import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Application } from '../../applications/entities/application.entity';
import { ApplicationStatus } from '../../applications/enums/application-status.enum';
import { CvVersion } from '../../documents/entities/cv-version.entity';
import { CvProfileStatus } from '../../documents/enums/cv-profile-status.enum';
import { Job } from '../../jobs/entities/job.entity';
import { QuestionSet } from '../entities/question-set.entity';
import { QuestionSetItem } from '../entities/question-set-item.entity';
import { QuestionSetMode } from '../enums/question-set-mode.enum';
import { QuestionSetStatus } from '../enums/question-set-status.enum';
import { QuestionSource } from '../enums/question-source.enum';
import { QuestionLanguage } from '../enums/question-language.enum';
import { CreateQuestionSetDto } from '../dto/create-question-set.dto';
import { RetryQuestionGenerationDto } from '../dto/retry-question-generation.dto';
import {
  QuestionSetDetailDto,
  QuestionSetItemResponseDto,
} from '../dto/question-set-response.dto';
import { QuestionSetsService } from '../question-sets.service';
import { AiService } from '../../ai/ai.service';
import { AiRunService } from '../../ai/services/ai-run.service';
import { AiTask } from '../../ai/enums/ai-task.enum';
import { computeInputHash } from '../../ai/utils/input-hash.util';
import {
  QUESTIONS_PROMPT_VERSION,
  QUESTIONS_SCHEMA_VERSION,
} from '../../ai/tasks/questions/questions.prompt';
import {
  QuestionJobSnapshot,
  QuestionProfileSnapshot,
  QuestionGenerationOutput,
} from '../../ai/tasks/questions/questions-ai.types';
import type { StructuredGenerationResult } from '../../ai/contracts/structured-generation.types';
import { validateGeneratedQuestions } from '../../ai/tasks/questions/questions-evidence.validator';
import { PermissionsService } from '../../admin/permissions/permissions.service';
import { Permissions } from '../../admin/permissions/permissions.constants';
import { AuditService } from '../../../platform/audit/audit.service';
import { IdempotencyService } from '../../../platform/idempotency/idempotency.service';
import { ActorContext } from '../../../common/context/actor-context';
import { ErrorCodes } from '../../../common/errors/error-codes';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class QuestionGenerationService {
  private readonly logger = new Logger(QuestionGenerationService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly questionSetsService: QuestionSetsService,
    private readonly aiService: AiService,
    private readonly aiRunService: AiRunService,
    private readonly permissionsService: PermissionsService,
    private readonly auditService: AuditService,
    private readonly idempotencyService: IdempotencyService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Tạo Question Set draft bằng AI theo Two-Transaction pattern.
   */
  async generateDraft(
    actor: ActorContext,
    applicationId: string,
    dto: CreateQuestionSetDto,
    idempotencyKey?: string,
  ): Promise<QuestionSetDetailDto> {
    const actorScope = `user:${actor.userId}`;
    const questionCount = dto.questionCount || 6;
    const language = dto.language || QuestionLanguage.VI;

    if (!idempotencyKey || !idempotencyKey.trim()) {
      throw new BadRequestException(
        'Header Idempotency-Key là bắt buộc cho thao tác AI tạo câu hỏi',
      );
    }

    const executed =
      await this.idempotencyService.execute<QuestionSetDetailDto>({
        actorScope,
        route: `POST:/api/v1/applications/${applicationId}/question-sets`,
        key: idempotencyKey,
        method: 'POST',
        body: { ...dto, mode: 'ai', questionCount, language },
        action: async () => {
          // --- BƯỚC 1: TRANSACTION 1 ---
          // Lock Application, CvVersion, Job; Kiểm tra trạng thái; Khởi tạo QuestionSet GENERATING & AiRun PROCESSING
          const {
            questionSetId,
            aiRunId,
            profileSnapshot,
            jobSnapshot,
            expectedGenerationVersion,
          } = await this.dataSource.transaction(
            async (manager: EntityManager) => {
              const isAppAdmin = await this.permissionsService.hasAll(
                actor.userId,
                [Permissions.QuestionSetsManage],
              );

              const appRepo = manager.getRepository(Application);
              const cvRepo = manager.getRepository(CvVersion);
              const jobRepo = manager.getRepository(Job);
              const qsRepo = manager.getRepository(QuestionSet);

              const application = await appRepo
                .createQueryBuilder('app')
                .setLock('pessimistic_write')
                .where('app.id = :id', { id: applicationId })
                .andWhere('app.deleted_at IS NULL')
                .getOne();

              if (!application) {
                throw new NotFoundException({
                  code: ErrorCodes.APPLICATION_NOT_FOUND,
                  message: 'Hồ sơ ứng tuyển không tồn tại',
                });
              }

              if (!isAppAdmin && application.ownerId !== actor.userId) {
                throw new NotFoundException({
                  code: ErrorCodes.APPLICATION_NOT_FOUND,
                  message: 'Hồ sơ ứng tuyển không tồn tại',
                });
              }

              if (application.status !== ApplicationStatus.SHORTLISTED) {
                throw new ConflictException({
                  code: ErrorCodes.APPLICATION_STATE_CONFLICT,
                  message:
                    'Chỉ được tạo bộ câu hỏi cho hồ sơ có trạng thái shortlisted',
                });
              }

              // Kiểm tra currentCvVersionId
              const cvVersionId =
                dto.cvVersionId || application.currentCvVersionId;
              if (
                !cvVersionId ||
                cvVersionId !== application.currentCvVersionId
              ) {
                throw new BadRequestException({
                  code: ErrorCodes.CV_NOT_FOUND,
                  message:
                    'cvVersionId không trùng khớp với CV hiện tại của hồ sơ ứng tuyển',
                });
              }

              const cvVersion = await cvRepo
                .createQueryBuilder('cv')
                .setLock('pessimistic_write')
                .where('cv.id = :cvVersionId', { cvVersionId })
                .andWhere('cv.application_id = :applicationId', {
                  applicationId,
                })
                .andWhere('cv.deleted_at IS NULL')
                .getOne();

              if (!cvVersion) {
                throw new NotFoundException({
                  code: ErrorCodes.CV_NOT_FOUND,
                  message: 'Phiên bản CV không tồn tại',
                });
              }

              if (cvVersion.profileStatus !== CvProfileStatus.APPROVED) {
                throw new ConflictException({
                  code: ErrorCodes.CV_PROFILE_NOT_APPROVED,
                  message: 'Hồ sơ trích xuất CV (profile) chưa được phê duyệt',
                });
              }

              if (
                !cvVersion.profileJson ||
                (cvVersion.profileJson as unknown as Record<string, unknown>)
                  .schemaVersion !== 'profile.v1'
              ) {
                throw new BadRequestException({
                  code: ErrorCodes.CV_PROFILE_NOT_READY,
                  message:
                    'Dữ liệu CV profile chưa đúng cấu trúc schema profile.v1',
                });
              }

              const job = await jobRepo
                .createQueryBuilder('job')
                .setLock('pessimistic_read')
                .where('job.id = :jobId', { jobId: application.jobId })
                .andWhere('job.deleted_at IS NULL')
                .getOne();

              if (!job) {
                throw new NotFoundException({
                  code: ErrorCodes.JOB_NOT_FOUND,
                  message: 'Vị trí công việc không tồn tại',
                });
              }

              // Snapshot chuẩn
              const pSnapshot: QuestionProfileSnapshot = {
                ...(cvVersion.profileJson as unknown as QuestionProfileSnapshot),
              };

              const jSnapshot: QuestionJobSnapshot = {
                jobId: job.id,
                title: job.title,
                description: job.description,
                requiredSkills: job.requiredSkills || [],
                evaluationCriteria: (job.evaluationCriteria || []).map((c) => ({
                  id: c.id,
                  name: c.name,
                  description: c.description,
                })),
                version: job.version,
              };

              // Tạo QuestionSet với status=GENERATING
              const newQuestionSet = qsRepo.create({
                ownerId: application.ownerId,
                applicationId: application.id,
                cvVersionId: cvVersion.id,
                cvProfileVersion: cvVersion.profileVersion,
                jobVersion: job.version,
                profileSnapshot: pSnapshot as unknown as Record<
                  string,
                  unknown
                >,
                jobSnapshot: jSnapshot as unknown as Record<string, unknown>,
                language,
                mode: QuestionSetMode.AI,
                status: QuestionSetStatus.GENERATING,
                version: 1,
                generationVersion: 1,
                aiRunId: null,
              });

              const savedSet = await qsRepo.save(newQuestionSet);

              // Tạo AiRun
              const inputHash = computeInputHash({
                profile: pSnapshot,
                job: jSnapshot,
                questionCount,
                language,
              });

              const modelName =
                this.configService.get<string>('ai.geminiModel')?.trim() ||
                'gemini-3.5-flash-lite';

              const run = await this.aiRunService.start(manager, {
                task: AiTask.QUESTION_GENERATION,
                model: modelName,
                aggregateType: 'question_set',
                aggregateId: savedSet.id,
                promptVersion: QUESTIONS_PROMPT_VERSION,
                schemaVersion: QUESTIONS_SCHEMA_VERSION,
                inputHash,
              });

              savedSet.aiRunId = run.id;
              await qsRepo.save(savedSet);

              return {
                questionSetId: savedSet.id,
                aiRunId: run.id,
                profileSnapshot: pSnapshot,
                jobSnapshot: jSnapshot,
                expectedGenerationVersion: savedSet.generationVersion,
              };
            },
          );

          // --- BƯỚC 2: NGOÀI TRANSACTION (GỌI GEMINI & VALIDATE) ---
          const detail = await this.executeAiAndApplyResult({
            actor,
            questionSetId,
            aiRunId,
            profileSnapshot,
            jobSnapshot,
            language,
            questionCount,
            expectedGenerationVersion,
          });

          return { status: 201, body: detail };
        },
      });

    return executed.body;
  }

  /**
   * Thử lại tạo bộ câu hỏi AI (Retry Question Generation).
   */
  async retryGeneration(
    actor: ActorContext,
    id: string,
    dto: RetryQuestionGenerationDto,
    idempotencyKey?: string,
  ): Promise<QuestionSetDetailDto> {
    const actorScope = `user:${actor.userId}`;

    if (!idempotencyKey || !idempotencyKey.trim()) {
      throw new BadRequestException(
        'Header Idempotency-Key là bắt buộc cho thao tác retry AI tạo câu hỏi',
      );
    }

    const executed =
      await this.idempotencyService.execute<QuestionSetDetailDto>({
        actorScope,
        route: `POST:/api/v1/question-sets/${id}/retry-generation`,
        key: idempotencyKey,
        method: 'POST',
        body: dto,
        action: async () => {
          // --- BƯỚC 1: TRANSACTION 1 CHO RETRY ---
          const {
            questionSetId,
            aiRunId,
            profileSnapshot,
            jobSnapshot,
            language,
            questionCount,
            expectedGenerationVersion,
          } = await this.dataSource.transaction(
            async (manager: EntityManager) => {
              const isAppAdmin = await this.permissionsService.hasAll(
                actor.userId,
                [Permissions.QuestionSetsManage],
              );

              const qsRepo = manager.getRepository(QuestionSet);
              const appRepo = manager.getRepository(Application);
              const cvRepo = manager.getRepository(CvVersion);
              const jobRepo = manager.getRepository(Job);

              const questionSet = await qsRepo
                .createQueryBuilder('qs')
                .setLock('pessimistic_write')
                .where('qs.id = :id', { id })
                .andWhere('qs.deleted_at IS NULL')
                .getOne();

              if (!questionSet) {
                throw new NotFoundException({
                  code: ErrorCodes.QUESTION_SET_NOT_FOUND,
                  message: 'Question Set không tồn tại',
                });
              }

              if (!isAppAdmin && questionSet.ownerId !== actor.userId) {
                throw new NotFoundException({
                  code: ErrorCodes.QUESTION_SET_NOT_FOUND,
                  message: 'Question Set không tồn tại',
                });
              }

              if (questionSet.mode !== QuestionSetMode.AI) {
                throw new BadRequestException({
                  code: ErrorCodes.QUESTION_GENERATION_NOT_RETRYABLE,
                  message: 'Chỉ có thể retry bộ câu hỏi được tạo bởi AI',
                });
              }

              if (questionSet.status === QuestionSetStatus.APPROVED) {
                throw new ConflictException({
                  code: ErrorCodes.QUESTION_SET_ALREADY_APPROVED,
                  message: 'Question Set đã được phê duyệt, không thể retry',
                });
              }

              if (
                questionSet.generationVersion !== dto.expectedGenerationVersion
              ) {
                throw new ConflictException({
                  code: ErrorCodes.VERSION_CONFLICT,
                  message: `Xung đột generationVersion: mong đợi ${dto.expectedGenerationVersion}, hiện tại là ${questionSet.generationVersion}`,
                });
              }

              // Chỉ cho retry nếu status = FAILED hoặc GENERATING đã stale (> 2 phút)
              const staleThresholdMs = this.configService.get<number>(
                'cvExtraction.processingStaleMs',
                120000,
              );
              const isStaleGenerating =
                questionSet.status === QuestionSetStatus.GENERATING &&
                Date.now() - questionSet.updatedAt.getTime() > staleThresholdMs;

              if (
                questionSet.status !== QuestionSetStatus.FAILED &&
                !isStaleGenerating
              ) {
                throw new ConflictException({
                  code: ErrorCodes.QUESTION_GENERATION_NOT_RETRYABLE,
                  message:
                    'Question Set đang được xử lý hoặc đã hoàn tất thành công, không thể retry',
                });
              }

              // Kiểm tra Application, CV, Job thực tế để phát hiện stale source
              const application = await appRepo.findOne({
                where: { id: questionSet.applicationId },
              });
              if (!application || application.deletedAt) {
                throw new NotFoundException({
                  code: ErrorCodes.APPLICATION_NOT_FOUND,
                  message: 'Hồ sơ ứng tuyển không tồn tại',
                });
              }

              if (application.status !== ApplicationStatus.SHORTLISTED) {
                throw new ConflictException({
                  code: ErrorCodes.APPLICATION_STATE_CONFLICT,
                  message: 'Hồ sơ ứng tuyển không còn ở trạng thái shortlisted',
                });
              }

              const currentCv = application.currentCvVersionId
                ? await cvRepo.findOne({
                    where: { id: application.currentCvVersionId },
                  })
                : null;
              const job = await jobRepo.findOne({
                where: { id: application.jobId },
              });

              const isStale = this.questionSetsService.checkIfStale(
                questionSet,
                application,
                currentCv,
                job,
              );

              if (isStale) {
                throw new ConflictException({
                  code: ErrorCodes.QUESTION_GENERATION_STALE,
                  message:
                    'Dữ liệu nguồn (CV hoặc Job) đã có phiên bản mới hơn. Vui lòng tạo mới bộ câu hỏi',
                });
              }

              // Supersede run cũ nếu còn đang processing
              if (questionSet.aiRunId) {
                await this.aiRunService.supersede(manager, questionSet.aiRunId);
              }

              // Tăng generationVersion, chuyển sang GENERATING
              questionSet.generationVersion += 1;
              questionSet.status = QuestionSetStatus.GENERATING;

              // Tạo AiRun mới
              const pSnapshot =
                questionSet.profileSnapshot as unknown as QuestionProfileSnapshot;
              const jSnapshot =
                questionSet.jobSnapshot as unknown as QuestionJobSnapshot;

              const inputHash = computeInputHash({
                profile: pSnapshot,
                job: jSnapshot,
                questionCount: 6, // mặc định 6 cho retry
                language: questionSet.language,
              });

              const modelName =
                this.configService.get<string>('ai.geminiModel')?.trim() ||
                'gemini-3.5-flash-lite';

              const newRun = await this.aiRunService.start(manager, {
                task: AiTask.QUESTION_GENERATION,
                model: modelName,
                aggregateType: 'question_set',
                aggregateId: questionSet.id,
                promptVersion: QUESTIONS_PROMPT_VERSION,
                schemaVersion: QUESTIONS_SCHEMA_VERSION,
                inputHash,
              });

              questionSet.aiRunId = newRun.id;
              const savedSet = await qsRepo.save(questionSet);

              await this.auditService.record(
                {
                  actorId: actor.userId,
                  actorType: 'user',
                  action: 'question-sets.retry_generation',
                  targetType: 'question_set',
                  targetId: savedSet.id,
                  ownerId: savedSet.ownerId,
                  metadata: {
                    previousGenerationVersion: dto.expectedGenerationVersion,
                    newGenerationVersion: savedSet.generationVersion,
                    aiRunId: newRun.id,
                  },
                  requestId: actor.requestId,
                },
                manager,
              );

              return {
                questionSetId: savedSet.id,
                aiRunId: newRun.id,
                profileSnapshot: pSnapshot,
                jobSnapshot: jSnapshot,
                language: savedSet.language,
                questionCount: 6,
                expectedGenerationVersion: savedSet.generationVersion,
              };
            },
          );

          // --- BƯỚC 2: NGOÀI TRANSACTION (GỌI GEMINI & VALIDATE) ---
          const detail = await this.executeAiAndApplyResult({
            actor,
            questionSetId,
            aiRunId,
            profileSnapshot,
            jobSnapshot,
            language,
            questionCount,
            expectedGenerationVersion,
          });

          return { status: 200, body: detail };
        },
      });

    return executed.body;
  }

  /**
   * Phương thức điều phối gọi AI ngoài Transaction và commit kết quả ở Transaction 2
   */
  private async executeAiAndApplyResult(params: {
    actor: ActorContext;
    questionSetId: string;
    aiRunId: string;
    profileSnapshot: QuestionProfileSnapshot;
    jobSnapshot: QuestionJobSnapshot;
    language: QuestionLanguage;
    questionCount: number;
    expectedGenerationVersion: number;
  }): Promise<QuestionSetDetailDto> {
    const {
      actor,
      questionSetId,
      aiRunId,
      profileSnapshot,
      jobSnapshot,
      language,
      questionCount,
      expectedGenerationVersion,
    } = params;

    let aiResult: StructuredGenerationResult<QuestionGenerationOutput>;
    try {
      aiResult = await this.aiService.generateQuestions({
        profileSnapshot,
        jobSnapshot,
        language,
        questionCount,
      });
    } catch (error: unknown) {
      const err = error as Error & { code?: string };
      this.logger.error(
        `[QuestionGeneration] AI call failed for set=${questionSetId}: ${err.message}`,
      );

      const errorCode = err.code || ErrorCodes.QUESTION_GENERATION_FAILED;
      await this.markGenerationFailed(
        questionSetId,
        aiRunId,
        expectedGenerationVersion,
        errorCode,
      );

      throw new InternalServerErrorException({
        code: errorCode,
        message:
          'Không thể sinh bộ câu hỏi từ AI. Vui lòng thử lại hoặc tạo thủ công.',
        details: { canRetry: true },
      });
    }

    // Xác thực danh sách câu hỏi và bằng chứng
    const validationResult = validateGeneratedQuestions(
      aiResult.data.questions,
      questionCount,
      jobSnapshot,
    );

    if (!validationResult.isValid) {
      const errCode =
        validationResult.errorCode || ErrorCodes.QUESTION_INVALID_OUTPUT;
      await this.markGenerationFailed(
        questionSetId,
        aiRunId,
        expectedGenerationVersion,
        errCode,
      );

      throw new BadRequestException({
        code: errCode,
        message: validationResult.errorMessage,
        details: { canRetry: true },
      });
    }

    // --- BƯỚC 3: TRANSACTION 2 ---
    // Kiểm tra late result & lưu QuestionSetItems, chuyển sang DRAFT
    return await this.dataSource.transaction(async (manager: EntityManager) => {
      const qsRepo = manager.getRepository(QuestionSet);
      const itemRepo = manager.getRepository(QuestionSetItem);
      const appRepo = manager.getRepository(Application);
      const cvRepo = manager.getRepository(CvVersion);
      const jobRepo = manager.getRepository(Job);

      const questionSet = await qsRepo
        .createQueryBuilder('qs')
        .setLock('pessimistic_write')
        .where('qs.id = :id', { id: questionSetId })
        .andWhere('qs.deleted_at IS NULL')
        .getOne();

      if (!questionSet) {
        throw new NotFoundException({
          code: ErrorCodes.QUESTION_SET_NOT_FOUND,
          message: 'Question Set không tồn tại',
        });
      }

      // Late result check
      if (
        questionSet.status !== QuestionSetStatus.GENERATING ||
        questionSet.generationVersion !== expectedGenerationVersion ||
        questionSet.aiRunId !== aiRunId
      ) {
        this.logger.warn(
          `[QuestionGeneration] Late result ignored for set=${questionSetId}. Expected genVer=${expectedGenerationVersion}, current=${questionSet.generationVersion}, status=${questionSet.status}`,
        );
        await this.aiRunService.supersede(manager, aiRunId);
        throw new ConflictException({
          code: ErrorCodes.AI_RESULT_SUPERSEDED,
          message: 'Kết quả AI đã bị thay thế bởi yêu cầu mới hơn.',
        });
      }

      // Kiểm tra source stale
      const application = await appRepo.findOne({
        where: { id: questionSet.applicationId },
      });
      const currentCv = application?.currentCvVersionId
        ? await cvRepo.findOne({
            where: { id: application.currentCvVersionId },
          })
        : null;
      const job = application
        ? await jobRepo.findOne({ where: { id: application.jobId } })
        : null;

      const isStale = application
        ? this.questionSetsService.checkIfStale(
            questionSet,
            application,
            currentCv,
            job,
          )
        : true;

      if (isStale) {
        await this.aiRunService.fail(
          manager,
          aiRunId,
          ErrorCodes.QUESTION_GENERATION_STALE,
        );
        questionSet.status = QuestionSetStatus.FAILED;
        await qsRepo.save(questionSet);

        throw new ConflictException({
          code: ErrorCodes.QUESTION_GENERATION_STALE,
          message:
            'Dữ liệu nguồn đã thay đổi trong khi AI đang xử lý. Vui lòng tạo lại bộ câu hỏi.',
        });
      }

      // Xóa các items cũ nếu có (đề phòng)
      await itemRepo.delete({ questionSetId: questionSet.id });

      // Lưu các câu hỏi AI sinh ra
      const newItems = aiResult.data.questions.map((q) =>
        itemRepo.create({
          questionSetId: questionSet.id,
          position: q.position,
          text: q.text,
          source: QuestionSource.AI,
          competency: q.competency,
          evaluationCriterionId: q.evaluationCriterionId,
          difficulty: q.difficulty,
          allowFollowUp: q.allowFollowUp,
          maxFollowUps: q.maxFollowUps,
          evidenceRefs: q.evidenceRefs,
          reviewNotes: q.reviewNotes,
        }),
      );

      const savedItems = await itemRepo.save(newItems);

      // Cập nhật trạng thái QuestionSet sang DRAFT
      questionSet.status = QuestionSetStatus.DRAFT;
      questionSet.version += 1;
      const savedSet = await qsRepo.save(questionSet);

      // Mark AiRun SUCCEEDED
      await this.aiRunService.succeed(manager, aiRunId, {
        latencyMs: aiResult.latencyMs,
        inputTokens: aiResult.inputTokens,
        outputTokens: aiResult.outputTokens,
      });

      // Ghi Audit
      await this.auditService.record(
        {
          actorId: actor.userId,
          actorType: 'user',
          action: 'question-sets.ai_generated',
          targetType: 'question_set',
          targetId: savedSet.id,
          ownerId: savedSet.ownerId,
          metadata: {
            itemCount: savedItems.length,
            aiRunId,
            latencyMs: aiResult.latencyMs,
            version: savedSet.version,
            generationVersion: savedSet.generationVersion,
          },
          requestId: actor.requestId,
        },
        manager,
      );

      return this.mapToDetailDto(savedSet, savedItems, false);
    });
  }

  /**
   * Đánh dấu QuestionSet và AiRun là FAILED trong một Transaction riêng biệt
   */
  private async markGenerationFailed(
    questionSetId: string,
    aiRunId: string,
    expectedGenerationVersion: number,
    errorCode: string,
  ): Promise<void> {
    try {
      await this.dataSource.transaction(async (manager: EntityManager) => {
        const qsRepo = manager.getRepository(QuestionSet);
        const questionSet = await qsRepo
          .createQueryBuilder('qs')
          .setLock('pessimistic_write')
          .where('qs.id = :id', { id: questionSetId })
          .getOne();

        if (
          questionSet &&
          questionSet.status === QuestionSetStatus.GENERATING &&
          questionSet.generationVersion === expectedGenerationVersion &&
          questionSet.aiRunId === aiRunId
        ) {
          questionSet.status = QuestionSetStatus.FAILED;
          await qsRepo.save(questionSet);
        }

        await this.aiRunService.fail(manager, aiRunId, errorCode);
      });
    } catch (e: unknown) {
      const err = e as Error;
      this.logger.error(
        `[QuestionGeneration] Failed to mark run as failed: ${err.message}`,
      );
    }
  }

  private mapToDetailDto(
    set: QuestionSet,
    items: QuestionSetItem[],
    isStale: boolean,
  ): QuestionSetDetailDto {
    const itemDtos: QuestionSetItemResponseDto[] = (items || []).map(
      (item) => ({
        id: item.id,
        position: item.position,
        text: item.text,
        source: item.source,
        competency: item.competency,
        evaluationCriterionId: item.evaluationCriterionId,
        difficulty: item.difficulty,
        allowFollowUp: item.allowFollowUp,
        maxFollowUps: item.maxFollowUps,
        evidenceRefs: item.evidenceRefs,
        reviewNotes: item.reviewNotes,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }),
    );

    return {
      id: set.id,
      ownerId: set.ownerId,
      applicationId: set.applicationId,
      cvVersionId: set.cvVersionId,
      cvProfileVersion: set.cvProfileVersion,
      jobVersion: set.jobVersion,
      profileSnapshot: set.profileSnapshot,
      jobSnapshot: set.jobSnapshot,
      language: set.language,
      mode: set.mode,
      status: set.status,
      version: set.version,
      generationVersion: set.generationVersion,
      aiRunId: set.aiRunId,
      sourceQuestionSetId: set.sourceQuestionSetId,
      approvedBy: set.approvedBy,
      approvedAt: set.approvedAt,
      itemCount: itemDtos.length,
      isStale,
      items: itemDtos,
      createdAt: set.createdAt,
      updatedAt: set.updatedAt,
    };
  }
}
