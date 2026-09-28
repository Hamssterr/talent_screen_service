import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AI_PROVIDER } from './constants/ai-provider.token';
import type { AiProvider } from './contracts/ai-provider.interface';
import type { StructuredGenerationResult } from './contracts/structured-generation.types';
import type { ProfileExtractionInput } from './tasks/profile/profile-ai.types';
import { ProfileV1OutputSchema } from './tasks/profile/profile-output.schema';
import {
  buildProfilePrompt,
  PROFILE_SYSTEM_INSTRUCTION,
} from './tasks/profile/profile.prompt';
import type { CvProfileV1Dto } from '../documents/schemas/cv-profile-v1.schema';
import type {
  QuestionGenerationTaskInput,
  QuestionGenerationOutput,
} from './tasks/questions/questions-ai.types';
import { QuestionsOutputSchema } from './tasks/questions/questions-output.schema';
import {
  buildQuestionsPrompt,
  QUESTIONS_SYSTEM_INSTRUCTION,
} from './tasks/questions/questions.prompt';
import type {
  FollowUpTaskInput,
  FollowUpOutput,
} from './tasks/follow-up/follow-up-ai.types';
import { FollowUpOutputSchema } from './tasks/follow-up/follow-up-output.schema';
import {
  buildFollowUpPrompt,
  FOLLOW_UP_SYSTEM_INSTRUCTION,
} from './tasks/follow-up/follow-up.prompt';
import type {
  SummarizeInterviewInput,
  InterviewSummaryOutput,
} from './tasks/summary/summary-ai.types';
import { InterviewSummaryOutputSchema } from './tasks/summary/summary-output.schema';
import {
  buildSummarySystemPrompt,
  buildSummaryUserPrompt,
} from './tasks/summary/summary.prompt';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    @Inject(AI_PROVIDER)
    private readonly aiProvider: AiProvider,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Getter kiểm tra xem Gemini AI đã được cấu hình đầy đủ hay chưa.
   * Không ném ngoại lệ; giúp feature service quyết định fallback hoặc thông báo cho người dùng.
   */
  isConfigured(): boolean {
    const key = this.configService.get<string>('ai.geminiApiKey', '');
    const model =
      this.configService.get<string>('ai.geminiModel')?.trim() ||
      'gemini-3.5-flash-lite';
    return !!(key.trim() && model.trim());
  }

  /**
   * Trích xuất thông tin hồ sơ ứng viên từ các trang văn bản CV.
   * Tuân thủ kiến trúc: Chỉ gọi AiProvider để sinh structured output, không thao tác database/ownership.
   */
  async extractProfile(
    input: ProfileExtractionInput,
  ): Promise<StructuredGenerationResult<CvProfileV1Dto>> {
    const timeoutMs = this.configService.get<number>(
      'ai.profileTimeoutMs',
      30000,
    );

    const prompt = buildProfilePrompt(input.pages);

    return this.aiProvider.generateStructured<CvProfileV1Dto>({
      systemInstruction: PROFILE_SYSTEM_INSTRUCTION,
      prompt,
      schema: ProfileV1OutputSchema,
      timeoutMs,
      temperature: 0.1,
    });
  }

  /**
   * Sinh bộ câu hỏi phỏng vấn có cấu trúc (Question Set draft) từ profile và job snapshot.
   * Không query DB, không tạo run, không kiểm tra permission, không approve.
   */
  async generateQuestions(
    input: QuestionGenerationTaskInput,
  ): Promise<StructuredGenerationResult<QuestionGenerationOutput>> {
    const timeoutMs = this.configService.get<number>(
      'ai.questionTimeoutMs',
      30000,
    );

    const prompt = buildQuestionsPrompt(input);

    return this.aiProvider.generateStructured<QuestionGenerationOutput>({
      systemInstruction: QUESTIONS_SYSTEM_INSTRUCTION,
      prompt,
      schema: QuestionsOutputSchema,
      timeoutMs,
      temperature: 0.3,
    });
  }

  /**
   * Đề xuất câu hỏi follow-up (hoặc tiếp tục main tiếp theo) sau câu trả lời của ứng viên.
   * Không query DB, không tạo Turn, không tạo Run, không retry sau fallback.
   */
  async suggestFollowUp(
    input: FollowUpTaskInput,
  ): Promise<StructuredGenerationResult<FollowUpOutput>> {
    const timeoutMs = this.configService.get<number>(
      'ai.followUpTimeoutMs',
      15000,
    );

    const prompt = buildFollowUpPrompt(input);

    return this.aiProvider.generateStructured<FollowUpOutput>({
      systemInstruction: FOLLOW_UP_SYSTEM_INSTRUCTION,
      prompt,
      schema: FollowUpOutputSchema,
      timeoutMs,
      temperature: 0.2,
    });
  }

  /**
   * Tạo bản tóm tắt phỏng vấn (AI Summary) dựa trên transcript và tiêu chí đánh giá.
   * Hoàn toàn không đưa ra quyết định tuyển dụng; chỉ trích xuất dữ liệu và bằng chứng.
   */
  async summarizeInterview(
    input: SummarizeInterviewInput,
  ): Promise<StructuredGenerationResult<InterviewSummaryOutput>> {
    const timeoutMs = this.configService.get<number>(
      'ai.summaryTimeoutMs',
      30000,
    );

    const systemInstruction = buildSummarySystemPrompt(input.language || 'vi');
    const prompt = buildSummaryUserPrompt(input);

    return this.aiProvider.generateStructured<InterviewSummaryOutput>({
      systemInstruction,
      prompt,
      schema: InterviewSummaryOutputSchema,
      timeoutMs,
      temperature: 0.2,
    });
  }
}
