import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource, In, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { ApplicationDecision } from './entities/application-decision.entity';
import { Application } from '../applications/entities/application.entity';
import { ApplicationStatus } from '../applications/enums/application-status.enum';
import { isApplicationTerminal } from '../applications/policies/application-terminal.policy';
import { DecisionOutcome } from './enums/decision-outcome.enum';
import { Interview } from '../interviews/entities/interview.entity';
import { InterviewStatus } from '../interviews/enums/interview-status.enum';
import { InterviewSession } from '../interview-runtime/entities/interview-session.entity';
import { SessionStatus } from '../interview-runtime/enums/session-status.enum';
import { Evaluation } from '../reviews/entities/evaluation.entity';
import { EvaluationType } from '../reviews/enums/evaluation-type.enum';
import { Candidate } from '../candidates/entities/candidate.entity';
import { Job } from '../jobs/entities/job.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { NotificationStatus } from '../notifications/enums/notification-status.enum';
import { NotificationPayloadCryptoService } from '../notifications/crypto/notification-payload-crypto.service';
import { NotificationDispatchService } from '../notifications/notification-dispatch.service';
import { CreateApplicationDecisionDto } from './dto/create-application-decision.dto';
import { ApplicationDecisionResponseDto } from './dto/application-decision-response.dto';
import { VersionConflictException } from '../../common/dto/expected-version.dto';
import { AuditService } from '../../platform/audit/audit.service';
import { IdempotencyService } from '../../platform/idempotency/idempotency.service';
import { PermissionsService } from '../admin/permissions/permissions.service';
import { Permissions } from '../admin/permissions/permissions.constants';
import { ErrorCodes } from '../../common/errors/error-codes';
import { ActorContext } from '../../common/context/actor-context';

@Injectable()
export class DecisionsService {
  private readonly logger = new Logger(DecisionsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly permissionsService: PermissionsService,
    private readonly auditService: AuditService,
    private readonly idempotencyService: IdempotencyService,
    private readonly cryptoService: NotificationPayloadCryptoService,
    private readonly notificationDispatchService: NotificationDispatchService,
    @InjectRepository(ApplicationDecision)
    private readonly decisionRepository: Repository<ApplicationDecision>,
    @InjectRepository(Application)
    private readonly applicationRepository: Repository<Application>,
  ) {}

  /**
   * Tạo quyết định tuyển dụng chính thức cho một Application.
   */
  async createDecision(
    applicationId: string,
    dto: CreateApplicationDecisionDto,
    actor: ActorContext,
    idempotencyKey?: string,
  ): Promise<ApplicationDecisionResponseDto> {
    if (!idempotencyKey || !idempotencyKey.trim()) {
      throw new BadRequestException({
        code: ErrorCodes.VALIDATION_FAILED,
        message: 'Header Idempotency-Key là bắt buộc khi ra quyết định',
      });
    }

    const actorScope = `user:${actor.userId}:application-decision:${applicationId}`;

    const executed = await this.idempotencyService.execute({
      actorScope,
      route: 'POST:/api/v1/applications/:id/decisions',
      key: idempotencyKey,
      method: 'POST',
      body: { applicationId, dto },
      action: async () => {
        // 1. Kiểm tra Application và quyền truy cập (Resource Hiding 404)
        await this.assertApplicationAccess(applicationId, actor);

        let pendingNotificationId: string | null = null;
        let savedDecision!: ApplicationDecision;

        // 2. Transaction ngắn để lưu quyết định và cập nhật Application
        await this.dataSource.transaction(async (manager) => {
          const appRepo = manager.getRepository(Application);

          // Lock Application row pessimistic_write
          const application = await appRepo
            .createQueryBuilder('app')
            .setLock('pessimistic_write')
            .where('app.id = :id', { id: applicationId })
            .andWhere('app.deletedAt IS NULL')
            .getOne();

          if (!application) {
            throw new NotFoundException({
              code: ErrorCodes.APPLICATION_NOT_FOUND,
              message: 'Hồ sơ ứng tuyển không tồn tại',
            });
          }

          // Kiểm tra OCC
          if (application.version !== dto.expectedApplicationVersion) {
            throw new VersionConflictException(
              `Phiên bản hồ sơ không khớp. Current version: ${application.version}, expected: ${dto.expectedApplicationVersion}`,
            );
          }

          // Kiểm tra đã có quyết định chưa
          const existingDecision = await manager
            .getRepository(ApplicationDecision)
            .findOne({
              where: { applicationId },
            });

          if (existingDecision) {
            throw new ConflictException({
              code: ErrorCodes.APPLICATION_ALREADY_DECIDED,
              message: 'Hồ sơ ứng tuyển đã có quyết định chính thức.',
            });
          }

          // Kiểm tra status Application: phải là under_review
          if (isApplicationTerminal(application.status)) {
            throw new ConflictException({
              code: ErrorCodes.APPLICATION_TERMINAL,
              message: 'Hồ sơ ứng tuyển đã ở trạng thái kết thúc.',
            });
          }

          if (application.status !== ApplicationStatus.UNDER_REVIEW) {
            throw new ConflictException({
              code: ErrorCodes.APPLICATION_NOT_UNDER_REVIEW,
              message:
                'Chỉ có thể ra quyết định khi hồ sơ đang ở trạng thái under_review.',
            });
          }

          // Kiểm tra không còn interview nào đang mở (invited hoặc in_progress)
          const openInterviews = await manager.getRepository(Interview).count({
            where: {
              applicationId,
              status: In([
                InterviewStatus.INVITED,
                InterviewStatus.IN_PROGRESS,
              ]),
            },
          });

          if (openInterviews > 0) {
            throw new ConflictException({
              code: ErrorCodes.INTERVIEW_ALREADY_OPEN,
              message:
                'Vẫn còn buổi phỏng vấn chưa kết thúc đối với hồ sơ này.',
            });
          }

          // Kiểm tra basisInterviewId
          const basisInterview = await manager
            .getRepository(Interview)
            .findOne({
              where: { id: dto.basisInterviewId, applicationId },
            });

          if (!basisInterview) {
            throw new UnprocessableEntityException({
              code: ErrorCodes.RESOURCE_NOT_FOUND,
              message: 'Buổi phỏng vấn làm căn cứ không thuộc hồ sơ này.',
            });
          }

          // Kiểm tra basisSessionId
          const basisSession = await manager
            .getRepository(InterviewSession)
            .findOne({
              where: {
                id: dto.basisSessionId,
                interviewId: basisInterview.id,
              },
            });

          if (
            !basisSession ||
            (basisSession.status !== SessionStatus.COMPLETED &&
              basisSession.status !== SessionStatus.EXPIRED &&
              basisSession.status !== SessionStatus.CANCELLED)
          ) {
            throw new UnprocessableEntityException({
              code: ErrorCodes.INTERVIEW_NOT_TERMINAL,
              message: 'Phiên phỏng vấn làm căn cứ chưa hoàn tất.',
            });
          }

          // Kiểm tra basisHrReviewId: phải là HR_REVIEW và là revision mới nhất
          const hrReview = await manager.getRepository(Evaluation).findOne({
            where: {
              id: dto.basisHrReviewId,
              interviewId: basisInterview.id,
              sessionId: basisSession.id,
              type: EvaluationType.HR_REVIEW,
            },
          });

          if (!hrReview) {
            throw new UnprocessableEntityException({
              code: ErrorCodes.HR_REVIEW_NOT_FOUND,
              message: 'Không tìm thấy bản đánh giá HR làm căn cứ.',
            });
          }

          const latestHrReview = await manager
            .getRepository(Evaluation)
            .findOne({
              where: {
                interviewId: basisInterview.id,
                type: EvaluationType.HR_REVIEW,
              },
              order: { revision: 'DESC' },
            });

          if (latestHrReview?.id !== hrReview.id) {
            throw new ConflictException({
              code: ErrorCodes.HR_REVIEW_NOT_LATEST,
              message:
                'Bản đánh giá HR được làm căn cứ không phải là revision mới nhất.',
            });
          }

          // Tạo ApplicationDecision
          const previousStatus = application.status;
          const newStatus =
            dto.outcome === DecisionOutcome.APPROVED
              ? ApplicationStatus.APPROVED
              : ApplicationStatus.REJECTED;

          const decisionRepo = manager.getRepository(ApplicationDecision);
          const decision = decisionRepo.create({
            ownerId: application.ownerId,
            applicationId: application.id,
            basisInterviewId: basisInterview.id,
            basisSessionId: basisSession.id,
            basisHrReviewId: hrReview.id,
            outcome: dto.outcome,
            internalReason: dto.internalReason,
            candidateMessage: dto.candidateMessage?.trim() || null,
            notifyCandidate: dto.notifyCandidate ?? false,
            previousStatus,
            decidedBy: actor.userId,
          });

          savedDecision = await decisionRepo.save(decision);

          // Cập nhật Application
          application.status = newStatus;
          application.version += 1;
          await appRepo.save(application);

          // Audit log
          await this.auditService.record(
            {
              actorId: actor.userId,
              actorType: 'user',
              action: 'application.decided',
              targetType: 'application',
              targetId: application.id,
              ownerId: application.ownerId,
              requestId: actor.requestId,
              metadata: {
                decisionId: savedDecision.id,
                outcome: dto.outcome,
                previousStatus,
                newStatus,
                basisHrReviewId: hrReview.id,
                notifyCandidate: dto.notifyCandidate,
              },
            },
            manager,
          );

          // Nếu có yêu cầu gửi email thông báo cho ứng viên
          if (dto.notifyCandidate) {
            const candidate = await manager.getRepository(Candidate).findOne({
              where: { id: application.candidateId },
            });
            const job = await manager.getRepository(Job).findOne({
              where: { id: application.jobId },
            });

            if (candidate && candidate.email) {
              const notificationType =
                dto.outcome === DecisionOutcome.APPROVED
                  ? NotificationType.APPLICATION_APPROVED
                  : NotificationType.APPLICATION_REJECTED;

              const payload = {
                candidateName: candidate.fullName || undefined,
                jobTitle: job?.title || 'Vị trí ứng tuyển',
                candidateMessage: dto.candidateMessage?.trim() || undefined,
              };

              const encryptedPayload = this.cryptoService.encrypt(payload);
              const dedupeKey = `decision:${application.id}:${dto.outcome}`;

              const notifRepo = manager.getRepository(Notification);
              const notification = notifRepo.create({
                ownerId: application.ownerId,
                interviewId: basisInterview.id,
                type: notificationType,
                recipient: candidate.email,
                encryptedPayload,
                dedupeKey,
                status: NotificationStatus.PENDING,
                attempts: 0,
              });

              const savedNotification = await notifRepo.save(notification);
              pendingNotificationId = savedNotification.id;
            }
          }
        });

        // 3. Ngoài transaction: dispatch email nếu có (lỗi email không rollback decision)
        if (pendingNotificationId) {
          try {
            await this.notificationDispatchService.dispatch(
              pendingNotificationId,
            );
          } catch (dispatchErr: unknown) {
            const err = dispatchErr as Error;
            this.logger.warn(
              `[DecisionsService] Dispatching decision notification failed: ${err.message}`,
            );
          }
        }

        const responseDto = this.toResponseDto(savedDecision);
        return {
          status: 201,
          body: responseDto,
        };
      },
    });

    return executed.body;
  }

  /**
   * Xem quyết định của hồ sơ ứng tuyển.
   */
  async getDecision(
    applicationId: string,
    actor: ActorContext,
  ): Promise<ApplicationDecisionResponseDto> {
    await this.assertApplicationAccess(applicationId, actor);

    const decision = await this.decisionRepository.findOne({
      where: { applicationId },
    });

    if (!decision) {
      throw new NotFoundException({
        code: ErrorCodes.DECISION_NOT_FOUND,
        message: 'Hồ sơ ứng tuyển chưa có quyết định chính thức.',
      });
    }

    return this.toResponseDto(decision);
  }

  /**
   * Kiểm tra quyền truy cập Application với chính sách Resource Hiding (404).
   */
  private async assertApplicationAccess(
    applicationId: string,
    actor: ActorContext,
  ): Promise<Application> {
    const application = await this.applicationRepository.findOne({
      where: { id: applicationId },
      relations: { job: true },
    });

    if (!application || application.deletedAt !== null) {
      throw new NotFoundException({
        code: ErrorCodes.APPLICATION_NOT_FOUND,
        message: 'Hồ sơ ứng tuyển không tồn tại',
      });
    }

    const isAppAdmin = await this.permissionsService.hasAny(actor.userId, [
      Permissions.DecisionsManage,
      Permissions.ApplicationsManage,
    ]);

    const isAppOwner = application.ownerId === actor.userId;
    const isJobOwner = application.job?.ownerId === actor.userId;

    if (!isAppAdmin && !isAppOwner && !isJobOwner) {
      throw new NotFoundException({
        code: ErrorCodes.APPLICATION_NOT_FOUND,
        message: 'Hồ sơ ứng tuyển không tồn tại',
      });
    }

    return application;
  }

  private toResponseDto(
    entity: ApplicationDecision,
  ): ApplicationDecisionResponseDto {
    return {
      id: entity.id,
      applicationId: entity.applicationId,
      outcome: entity.outcome,
      internalReason: entity.internalReason,
      candidateMessage: entity.candidateMessage,
      notifyCandidate: entity.notifyCandidate,
      previousStatus: entity.previousStatus,
      basisInterviewId: entity.basisInterviewId,
      basisSessionId: entity.basisSessionId,
      basisHrReviewId: entity.basisHrReviewId,
      decidedBy: entity.decidedBy,
      createdAt: entity.createdAt,
    };
  }
}
