import {
  BadGatewayException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Evaluation } from '../entities/evaluation.entity';
import { EvaluationType } from '../enums/evaluation-type.enum';
import { Interview } from '../../interviews/entities/interview.entity';
import { InterviewSession } from '../../interview-runtime/entities/interview-session.entity';
import { SessionStatus } from '../../interview-runtime/enums/session-status.enum';
import { TranscriptProjectionService } from './transcript-projection.service';
import { EvaluationsService } from './evaluations.service';
import { AiService } from '../../ai/ai.service';
import { AiRunService } from '../../ai/services/ai-run.service';
import { AiTask } from '../../ai/enums/ai-task.enum';
import { computeInputHash } from '../../ai/utils/input-hash.util';
import {
  SUMMARY_PROMPT_VERSION,
  SUMMARY_SCHEMA_VERSION,
} from '../../ai/tasks/summary/summary.prompt';
import { validateSummaryOutput } from '../../ai/tasks/summary/summary-evidence.validator';
import { EvaluationResponseDto } from '../dto/evaluation-response.dto';
import { IdempotencyService } from '../../../platform/idempotency/idempotency.service';
import { AuditService } from '../../../platform/audit/audit.service';
import { ErrorCodes } from '../../../common/errors/error-codes';
import { ActorContext } from '../../../common/context/actor-context';
import {
  InterviewSummaryOutput,
  SummaryEvaluationCriterion,
} from '../../ai/tasks/summary/summary-ai.types';
import { StructuredGenerationResult } from '../../ai/contracts/structured-generation.types';

interface RawCriterion {
  id?: string;
  name?: string;
  description?: string;
}

@Injectable()
export class InterviewSummaryService {
  private readonly logger = new Logger(InterviewSummaryService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly aiService: AiService,
    private readonly aiRunService: AiRunService,
    private readonly auditService: AuditService,
    private readonly idempotencyService: IdempotencyService,
    private readonly transcriptProjectionService: TranscriptProjectionService,
    private readonly evaluationsService: EvaluationsService,
    @InjectRepository(Evaluation)
    private readonly evaluationRepository: Repository<Evaluation>,
    @InjectRepository(Interview)
    private readonly interviewRepository: Repository<Interview>,
    @InjectRepository(InterviewSession)
    private readonly sessionRepository: Repository<InterviewSession>,
  ) {}

  /**
   * Tạo revision tóm tắt mới (AI Summary) cho buổi phỏng vấn đã kết thúc (terminal session).
   * Tuân thủ Two-Transaction pattern:
   * - Tx 1: Kiểm tra quyền & điều kiện terminal, tạo AiRun PROCESSING.
   * - Ngoài Tx: Gọi Gemini, validate bằng chứng & tiêu chí.
   * - Tx 2: Lưu Evaluation revision mới, cập nhật AiRun SUCCEEDED, ghi audit log.
   */
  async regenerateSummary(
    interviewId: string,
    actor: ActorContext,
    idempotencyKey?: string,
  ): Promise<EvaluationResponseDto> {
    const actorScope = `user:${actor.userId}:interview-summary:${interviewId}`;

    const executed = await this.idempotencyService.execute({
      actorScope,
      route: 'POST:/api/v1/interviews/:id/regenerate-summary',
      key: idempotencyKey,
      method: 'POST',
      body: { interviewId },
      action: async () => {
        // 1. Kiểm tra Interview tồn tại
        const interview = await this.interviewRepository.findOne({
          where: { id: interviewId },
        });

        if (!interview) {
          throw new NotFoundException({
            code: ErrorCodes.INTERVIEW_NOT_FOUND,
            message: 'Không tìm thấy buổi phỏng vấn',
          });
        }

        // 2. Kiểm tra Session phải tồn tại và terminal
        const session = await this.sessionRepository.findOne({
          where: { interviewId },
        });

        if (!session) {
          throw new ConflictException({
            code: ErrorCodes.SESSION_NOT_STARTED,
            message: 'Buổi phỏng vấn chưa được bắt đầu, không thể tạo tóm tắt',
          });
        }

        const isTerminalSession =
          session.status === SessionStatus.COMPLETED ||
          session.status === SessionStatus.EXPIRED ||
          session.status === SessionStatus.CANCELLED;

        if (!isTerminalSession) {
          throw new ConflictException({
            code: ErrorCodes.SUMMARY_SESSION_NOT_TERMINAL,
            message:
              'Buổi phỏng vấn chưa kết thúc (đang diễn ra). Chỉ có thể tạo tóm tắt sau khi buổi phỏng vấn đã hoàn tất hoặc hết hạn.',
          });
        }

        // 3. Chuẩn bị dữ liệu đầu vào cho AI Summary từ Snapshots & Transcript
        const jobSnapshot = (interview.jobSnapshot || {}) as Record<
          string,
          any
        >;
        const profileSnapshot = (interview.profileSnapshot || {}) as Record<
          string,
          any
        >;

        const jobTitle: string = String(
          jobSnapshot.title || 'Vị trí tuyển dụng',
        );
        const jobDescription: string | null = jobSnapshot.description
          ? String(jobSnapshot.description)
          : null;
        let criteria: SummaryEvaluationCriterion[] = [];

        if (Array.isArray(jobSnapshot.evaluationCriteria)) {
          criteria = (jobSnapshot.evaluationCriteria as RawCriterion[]).map(
            (c) => ({
              id: c.id || '',
              name: c.name || '',
              description: c.description || null,
            }),
          );
        }

        const turns =
          await this.transcriptProjectionService.buildAiSummaryTurns(
            session.id,
          );

        if (turns.length === 0) {
          throw new ConflictException({
            code: ErrorCodes.SUMMARY_GENERATION_FAILED,
            message:
              'Transcript phỏng vấn không có lượt câu hỏi nào để tóm tắt',
          });
        }

        const inputHash = computeInputHash({
          interviewId,
          sessionId: session.id,
          turnCount: turns.length,
          lastTurnId: turns[turns.length - 1].turnId,
        });

        const modelName =
          this.configService.get<string>('ai.geminiModel')?.trim() ||
          'gemini-3.5-flash-lite';

        // --- TRANSACTION 1: TẠO AI_RUN ---
        let aiRunId: string;
        await this.dataSource.transaction(async (manager) => {
          const aiRun = await this.aiRunService.start(manager, {
            task: AiTask.INTERVIEW_SUMMARY,
            model: modelName,
            aggregateType: 'interview',
            aggregateId: interview.id,
            promptVersion: String(SUMMARY_PROMPT_VERSION),
            schemaVersion: String(SUMMARY_SCHEMA_VERSION),
            inputHash,
          });
          aiRunId = aiRun.id;
        });

        // --- NGOÀI TRANSACTION: GỌI GEMINI ---
        let aiResult: StructuredGenerationResult<InterviewSummaryOutput>;
        try {
          aiResult = await this.aiService.summarizeInterview({
            jobTitle,
            jobDescription,
            candidateName: profileSnapshot.fullName
              ? String(profileSnapshot.fullName)
              : null,
            candidateProfileSummary: profileSnapshot.summary
              ? String(profileSnapshot.summary)
              : null,
            criteria,
            turns,
            language: interview.language,
          });
        } catch (error: unknown) {
          const err = error as Error;
          this.logger.error(
            `[AiSummary] Call failed for interview=${interview.id}: ${err.message}`,
          );

          await this.dataSource.transaction(async (manager) => {
            await this.aiRunService.fail(
              manager,
              aiRunId,
              ErrorCodes.SUMMARY_GENERATION_FAILED,
            );
          });

          throw new BadGatewayException({
            code: ErrorCodes.SUMMARY_GENERATION_FAILED,
            message:
              'Tạo bản tóm tắt phỏng vấn từ AI thất bại. Vui lòng thử lại.',
          });
        }

        // Xác thực kết quả & bằng chứng
        const validation = validateSummaryOutput(
          aiResult.data,
          turns,
          criteria,
        );
        if (!validation.isValid) {
          this.logger.warn(
            `[AiSummary] Evidence validation failed: ${validation.errorMessage}`,
          );

          await this.dataSource.transaction(async (manager) => {
            await this.aiRunService.fail(
              manager,
              aiRunId,
              validation.errorCode || ErrorCodes.AI_INVALID_OUTPUT,
            );
          });

          throw new UnprocessableEntityException({
            code: validation.errorCode || ErrorCodes.AI_INVALID_OUTPUT,
            message:
              validation.errorMessage ||
              'Kết quả tóm tắt từ AI không hợp lệ hoặc thiếu bằng chứng xác thực.',
          });
        }

        // --- TRANSACTION 2: LƯU EVALUATION REVISION MỚI & SUCCEED AI_RUN ---
        let savedEvaluation!: Evaluation;
        await this.dataSource.transaction(async (manager) => {
          const evalRepo = manager.getRepository(Evaluation);

          // Tìm revision cao nhất hiện tại của ai_summary cho interview này
          const latestSummary = await evalRepo
            .createQueryBuilder('e')
            .setLock('pessimistic_write')
            .where('e.interview_id = :interviewId', {
              interviewId: interview.id,
            })
            .andWhere('e.type = :type', { type: EvaluationType.AI_SUMMARY })
            .orderBy('e.revision', 'DESC')
            .getOne();

          const nextRevision = (latestSummary?.revision || 0) + 1;

          const evaluation = evalRepo.create({
            ownerId: interview.ownerId,
            interviewId: interview.id,
            sessionId: session.id,
            type: EvaluationType.AI_SUMMARY,
            revision: nextRevision,
            schemaVersion: SUMMARY_SCHEMA_VERSION,
            content: aiResult.data,
            aiRunId,
            inputHash,
            createdBy: actor.userId,
          });

          savedEvaluation = await evalRepo.save(evaluation);

          // Mark AiRun SUCCEEDED
          await this.aiRunService.succeed(manager, aiRunId, {
            latencyMs: aiResult.latencyMs,
            inputTokens: aiResult.inputTokens,
            outputTokens: aiResult.outputTokens,
          });

          // Audit log
          await this.auditService.record(
            {
              actorId: actor.userId,
              actorType: 'user',
              action: 'interview.summary_generated',
              targetType: 'evaluation',
              targetId: savedEvaluation.id,
              metadata: {
                interviewId: interview.id,
                sessionId: session.id,
                revision: nextRevision,
                aiRunId,
              },
            },
            manager,
          );
        });

        const responseDto =
          this.evaluationsService.toResponseDto(savedEvaluation);
        return {
          status: 201,
          body: responseDto,
        };
      },
    });

    return executed.body;
  }
}
