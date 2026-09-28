import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityManager } from 'typeorm';
import { CvVersion } from '../entities/cv-version.entity';
import { Application } from '../../applications/entities/application.entity';
import { ApplicationStatus } from '../../applications/enums/application-status.enum';
import { CvExtractionStatus } from '../enums/cv-extraction-status.enum';
import { CvProfileStatus } from '../enums/cv-profile-status.enum';
import { CvProfileV1Dto } from '../schemas/cv-profile-v1.schema';
import { AiRunService } from '../../ai/services/ai-run.service';
import { AiTask } from '../../ai/enums/ai-task.enum';
import { AiRunStatus } from '../../ai/enums/ai-run-status.enum';
import { AiRun } from '../../ai/entities/ai-run.entity';
import { computeInputHash } from '../../ai/utils/input-hash.util';
import {
  PROFILE_PROMPT_VERSION,
  PROFILE_SCHEMA_VERSION,
} from '../../ai/tasks/profile/profile.prompt';
import { AuditService } from '../../../platform/audit/audit.service';
import { PermissionsService } from '../../admin/permissions/permissions.service';
import { Permissions } from '../../admin/permissions/permissions.constants';
import { ActorContext } from '../../../common/context/actor-context';
import { ErrorCodes } from '../../../common/errors/error-codes';

export interface ClaimResult {
  cv: CvVersion;
  aiRun: AiRun;
  processingVersion: number;
}

export interface CompleteExtractionData {
  pageCount: number;
  extractedText: string;
  profile: CvProfileV1Dto;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface FailExtractionData {
  status: CvExtractionStatus;
  errorCode: string;
  errorMessage: string;
  durationMs?: number;
}

@Injectable()
export class CvExtractionStateService {
  private readonly logger = new Logger(CvExtractionStateService.name);

  constructor(
    private readonly aiRunService: AiRunService,
    private readonly auditService: AuditService,
    private readonly permissionsService: PermissionsService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Transaction 1: Claim Initial Extraction (pending -> processing)
   */
  async claimInitialExtraction(
    manager: EntityManager,
    cvId: string,
    expectedVersion: number,
    actor: ActorContext,
  ): Promise<ClaimResult> {
    const cvRepo = manager.getRepository(CvVersion);

    const cv = await cvRepo
      .createQueryBuilder('cv')
      .setLock('pessimistic_write')
      .where('cv.id = :id', { id: cvId })
      .andWhere('cv.deletedAt IS NULL')
      .getOne();

    if (!cv) {
      throw new NotFoundException({
        code: ErrorCodes.CV_NOT_FOUND,
        message: 'Không tìm thấy phiên bản CV',
      });
    }

    const application = await manager.getRepository(Application).findOne({
      where: { id: cv.applicationId },
    });

    if (!application || application.deletedAt !== null) {
      throw new NotFoundException({
        code: ErrorCodes.APPLICATION_NOT_FOUND,
        message: 'Không tìm thấy hồ sơ ứng tuyển liên kết',
      });
    }

    // Ownership & Permission check
    const isCvAdmin = await this.permissionsService.hasAll(actor.userId, [
      Permissions.CvManage,
    ]);
    const isApplicationOwner = application.ownerId === actor.userId;

    if (!isCvAdmin && !isApplicationOwner) {
      throw new NotFoundException({
        code: ErrorCodes.CV_NOT_FOUND,
        message: 'Không tìm thấy phiên bản CV',
      });
    }

    // Application state check
    if (application.status !== ApplicationStatus.SHORTLISTED) {
      throw new ConflictException({
        code: ErrorCodes.APPLICATION_STATE_CONFLICT,
        message: `Chỉ được thực hiện trích xuất khi hồ sơ ở trạng thái shortlisted (hiện tại: ${application.status})`,
      });
    }

    // Profile approved check
    if (cv.profileStatus === CvProfileStatus.APPROVED) {
      throw new ConflictException({
        code: ErrorCodes.CV_PROFILE_ALREADY_APPROVED,
        message:
          'Profile của CV đã được duyệt (approved) và không thể trích xuất lại',
      });
    }

    // Extraction status check (chỉ cho phép pending)
    if (cv.extractionStatus === CvExtractionStatus.PROCESSING) {
      throw new ConflictException({
        code: ErrorCodes.AI_PROCESSING_CONFLICT,
        message: 'CV đang trong quá trình trích xuất',
      });
    }

    if (cv.extractionStatus !== CvExtractionStatus.PENDING) {
      throw new ConflictException({
        code: ErrorCodes.RESOURCE_CONFLICT,
        message: `Không thể trích xuất ban đầu từ trạng thái '${cv.extractionStatus}'. Vui lòng dùng endpoint retry nếu muốn trích xuất lại.`,
      });
    }

    // Expected processing version check
    if (cv.processingVersion !== expectedVersion) {
      throw new ConflictException({
        code: ErrorCodes.VERSION_CONFLICT,
        message: `Phiên bản xử lý không khớp (hiện tại: ${cv.processingVersion}, yêu cầu: ${expectedVersion})`,
      });
    }

    // Transition CV to processing
    cv.extractionStatus = CvExtractionStatus.PROCESSING;
    cv.errorCode = null;
    const savedCv = await cvRepo.save(cv);

    // Create AiRun (processing)
    const provider = this.configService.get<string>('ai.provider', 'gemini');
    const model =
      this.configService.get<string>('ai.geminiModel')?.trim() ||
      'gemini-3.5-flash-lite';
    const inputHash = computeInputHash({
      cvVersionId: cv.id,
      fileSha256: cv.sha256,
      processingVersion: cv.processingVersion,
      promptVersion: PROFILE_PROMPT_VERSION,
      schemaVersion: PROFILE_SCHEMA_VERSION,
    });

    const aiRun = await this.aiRunService.start(manager, {
      task: AiTask.PROFILE_EXTRACTION,
      aggregateType: 'cv_version',
      aggregateId: cv.id,
      provider,
      model,
      promptVersion: PROFILE_PROMPT_VERSION,
      schemaVersion: PROFILE_SCHEMA_VERSION,
      inputHash,
    });

    // Audit log
    await this.auditService.record(
      {
        actorId: actor.userId,
        actorType: 'user',
        action: 'cv.extraction_started',
        targetType: 'cv_version',
        targetId: cv.id,
        ownerId: cv.ownerId,
        requestId: actor.requestId,
        metadata: {
          applicationId: cv.applicationId,
          version: cv.version,
          processingVersion: cv.processingVersion,
          aiRunId: aiRun.id,
        },
      },
      manager,
    );

    return { cv: savedCv, aiRun, processingVersion: savedCv.processingVersion };
  }

  /**
   * Transaction 1: Claim Retry Extraction (failed / needs_manual_input / stale processing -> processing)
   */
  async claimRetryExtraction(
    manager: EntityManager,
    cvId: string,
    expectedVersion: number,
    actor: ActorContext,
  ): Promise<ClaimResult> {
    const cvRepo = manager.getRepository(CvVersion);

    const cv = await cvRepo
      .createQueryBuilder('cv')
      .setLock('pessimistic_write')
      .where('cv.id = :id', { id: cvId })
      .andWhere('cv.deletedAt IS NULL')
      .getOne();

    if (!cv) {
      throw new NotFoundException({
        code: ErrorCodes.CV_NOT_FOUND,
        message: 'Không tìm thấy phiên bản CV',
      });
    }

    const application = await manager.getRepository(Application).findOne({
      where: { id: cv.applicationId },
    });

    if (!application || application.deletedAt !== null) {
      throw new NotFoundException({
        code: ErrorCodes.APPLICATION_NOT_FOUND,
        message: 'Không tìm thấy hồ sơ ứng tuyển liên kết',
      });
    }

    // Ownership check
    const isCvAdmin = await this.permissionsService.hasAll(actor.userId, [
      Permissions.CvManage,
    ]);
    const isApplicationOwner = application.ownerId === actor.userId;

    if (!isCvAdmin && !isApplicationOwner) {
      throw new NotFoundException({
        code: ErrorCodes.CV_NOT_FOUND,
        message: 'Không tìm thấy phiên bản CV',
      });
    }

    // Application state check
    if (application.status !== ApplicationStatus.SHORTLISTED) {
      throw new ConflictException({
        code: ErrorCodes.APPLICATION_STATE_CONFLICT,
        message: `Chỉ được retry trích xuất khi hồ sơ ở trạng thái shortlisted (hiện tại: ${application.status})`,
      });
    }

    // Profile approved check
    if (cv.profileStatus === CvProfileStatus.APPROVED) {
      throw new ConflictException({
        code: ErrorCodes.CV_PROFILE_ALREADY_APPROVED,
        message:
          'Profile của CV đã được duyệt (approved) và không thể trích xuất lại',
      });
    }

    // Processing version check
    if (cv.processingVersion !== expectedVersion) {
      throw new ConflictException({
        code: ErrorCodes.VERSION_CONFLICT,
        message: `Phiên bản xử lý không khớp (hiện tại: ${cv.processingVersion}, yêu cầu: ${expectedVersion})`,
      });
    }

    // Check status retry eligibility
    const staleMs = this.configService.get<number>(
      'cvExtraction.processingStaleMs',
      120000,
    );
    const now = Date.now();
    const isStale =
      cv.extractionStatus === CvExtractionStatus.PROCESSING &&
      now - new Date(cv.updatedAt).getTime() > staleMs;

    const canRetry =
      cv.extractionStatus === CvExtractionStatus.FAILED ||
      cv.extractionStatus === CvExtractionStatus.NEEDS_MANUAL_INPUT ||
      isStale;

    if (!canRetry) {
      if (cv.extractionStatus === CvExtractionStatus.READY) {
        throw new ConflictException({
          code: ErrorCodes.RESOURCE_CONFLICT,
          message: 'CV đã trích xuất thành công (ready), không thể retry',
        });
      }
      if (cv.extractionStatus === CvExtractionStatus.PROCESSING && !isStale) {
        throw new ConflictException({
          code: ErrorCodes.AI_PROCESSING_CONFLICT,
          message: 'CV đang trong quá trình trích xuất và chưa quá hạn (stale)',
        });
      }
      throw new ConflictException({
        code: ErrorCodes.RESOURCE_CONFLICT,
        message: `Không thể retry từ trạng thái '${cv.extractionStatus}'`,
      });
    }

    // If stale, supersede existing processing AiRun
    if (isStale) {
      const activeRun = await manager.getRepository(AiRun).findOne({
        where: {
          aggregateType: 'cv_version',
          aggregateId: cv.id,
          task: AiTask.PROFILE_EXTRACTION,
          status: AiRunStatus.PROCESSING,
        },
      });
      if (activeRun) {
        await this.aiRunService.supersede(manager, activeRun.id);
      }
    }

    // Increment processingVersion and transition to processing
    cv.processingVersion += 1;
    cv.extractionStatus = CvExtractionStatus.PROCESSING;
    cv.errorCode = null;
    const savedCv = await cvRepo.save(cv);

    // Create new AiRun
    const provider = this.configService.get<string>('ai.provider', 'gemini');
    const model =
      this.configService.get<string>('ai.geminiModel')?.trim() ||
      'gemini-2.5-flash';
    const inputHash = computeInputHash({
      cvVersionId: cv.id,
      fileSha256: cv.sha256,
      processingVersion: cv.processingVersion,
      promptVersion: PROFILE_PROMPT_VERSION,
      schemaVersion: PROFILE_SCHEMA_VERSION,
    });

    const aiRun = await this.aiRunService.start(manager, {
      task: AiTask.PROFILE_EXTRACTION,
      aggregateType: 'cv_version',
      aggregateId: cv.id,
      provider,
      model,
      promptVersion: PROFILE_PROMPT_VERSION,
      schemaVersion: PROFILE_SCHEMA_VERSION,
      inputHash,
    });

    // Audit log
    await this.auditService.record(
      {
        actorId: actor.userId,
        actorType: 'user',
        action: 'cv.extraction_retried',
        targetType: 'cv_version',
        targetId: cv.id,
        ownerId: cv.ownerId,
        requestId: actor.requestId,
        metadata: {
          applicationId: cv.applicationId,
          version: cv.version,
          processingVersion: cv.processingVersion,
          aiRunId: aiRun.id,
        },
      },
      manager,
    );

    return { cv: savedCv, aiRun, processingVersion: savedCv.processingVersion };
  }

  /**
   * Transaction 2: Complete Extraction (apply success result)
   */
  async completeExtraction(
    manager: EntityManager,
    cvId: string,
    claimedProcessingVersion: number,
    aiRunId: string,
    data: CompleteExtractionData,
    actor: ActorContext,
  ): Promise<{ superseded: boolean; cv?: CvVersion }> {
    const cvRepo = manager.getRepository(CvVersion);

    const cv = await cvRepo
      .createQueryBuilder('cv')
      .setLock('pessimistic_write')
      .where('cv.id = :id', { id: cvId })
      .andWhere('cv.deletedAt IS NULL')
      .getOne();

    // Late result check
    if (
      !cv ||
      cv.processingVersion !== claimedProcessingVersion ||
      cv.extractionStatus !== CvExtractionStatus.PROCESSING ||
      cv.profileStatus === CvProfileStatus.APPROVED
    ) {
      this.logger.warn(
        `Late result detected for CV ${cvId}. Claimed v${claimedProcessingVersion}, current v${cv?.processingVersion}, status ${cv?.extractionStatus}. Superseding AiRun ${aiRunId}`,
      );
      await this.aiRunService.supersede(manager, aiRunId);
      return { superseded: true };
    }

    // Apply success state
    cv.pageCount = data.pageCount;
    cv.extractedText = data.extractedText;
    cv.profileJson = data.profile;
    cv.extractionStatus = CvExtractionStatus.READY;
    cv.profileStatus = CvProfileStatus.DRAFT;
    cv.profileVersion += 1;
    cv.errorCode = null;
    const savedCv = await cvRepo.save(cv);

    // Mark AiRun succeeded
    await this.aiRunService.succeed(manager, aiRunId, {
      latencyMs: data.latencyMs,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
    });

    // Audit log (không ghi extracted text / full profile để bảo mật)
    await this.auditService.record(
      {
        actorId: actor.userId,
        actorType: 'user',
        action: 'cv.extraction_completed',
        targetType: 'cv_version',
        targetId: cv.id,
        ownerId: cv.ownerId,
        requestId: actor.requestId,
        metadata: {
          applicationId: cv.applicationId,
          version: cv.version,
          processingVersion: cv.processingVersion,
          profileVersion: cv.profileVersion,
          pageCount: cv.pageCount,
          aiRunId,
          skillsCount: data.profile.skills?.length || 0,
          experiencesCount: data.profile.experiences?.length || 0,
          projectsCount: data.profile.projects?.length || 0,
        },
      },
      manager,
    );

    return { superseded: false, cv: savedCv };
  }

  /**
   * Failure Transaction: Fail Extraction
   */
  async failExtraction(
    manager: EntityManager,
    cvId: string,
    claimedProcessingVersion: number,
    aiRunId: string,
    failure: FailExtractionData,
    actor: ActorContext,
  ): Promise<{ superseded: boolean; cv?: CvVersion }> {
    const cvRepo = manager.getRepository(CvVersion);

    const cv = await cvRepo
      .createQueryBuilder('cv')
      .setLock('pessimistic_write')
      .where('cv.id = :id', { id: cvId })
      .andWhere('cv.deletedAt IS NULL')
      .getOne();

    // Late result check
    if (
      !cv ||
      cv.processingVersion !== claimedProcessingVersion ||
      cv.extractionStatus !== CvExtractionStatus.PROCESSING
    ) {
      this.logger.warn(
        `Late failure detected for CV ${cvId}. Claimed v${claimedProcessingVersion}, current v${cv?.processingVersion}. Superseding AiRun ${aiRunId}`,
      );
      await this.aiRunService.supersede(manager, aiRunId);
      return { superseded: true };
    }

    // Apply failure state
    cv.extractionStatus = failure.status;
    cv.errorCode = failure.errorCode;
    const savedCv = await cvRepo.save(cv);

    // Mark AiRun failed
    await this.aiRunService.fail(manager, aiRunId, failure.errorCode);

    // Audit log
    const action =
      failure.status === CvExtractionStatus.NEEDS_MANUAL_INPUT
        ? 'cv.extraction_needs_manual_input'
        : 'cv.extraction_failed';

    await this.auditService.record(
      {
        actorId: actor.userId,
        actorType: 'user',
        action,
        targetType: 'cv_version',
        targetId: cv.id,
        ownerId: cv.ownerId,
        requestId: actor.requestId,
        metadata: {
          applicationId: cv.applicationId,
          version: cv.version,
          processingVersion: cv.processingVersion,
          errorCode: failure.errorCode,
          aiRunId,
        },
      },
      manager,
    );

    return { superseded: false, cv: savedCv };
  }
}
