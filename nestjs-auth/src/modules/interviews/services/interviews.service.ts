import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Interview } from '../entities/interview.entity';
import { InterviewQuestion } from '../entities/interview-question.entity';
import { Invitation } from '../entities/invitation.entity';
import { InterviewAccessCredential } from '../entities/interview-access-credential.entity';
import { InterviewSession } from '../../interview-runtime/entities/interview-session.entity';
import { InterviewTurn } from '../../interview-runtime/entities/interview-turn.entity';
import { SessionStatus } from '../../interview-runtime/enums/session-status.enum';
import { RuntimeState } from '../../interview-runtime/enums/runtime-state.enum';
import { SessionEndReason } from '../../interview-runtime/enums/session-end-reason.enum';
import { TurnStatus } from '../../interview-runtime/enums/turn-status.enum';
import { Application } from '../../applications/entities/application.entity';
import { ApplicationStatus } from '../../applications/enums/application-status.enum';
import { QuestionSet } from '../../question-sets/entities/question-set.entity';
import { QuestionSetStatus } from '../../question-sets/enums/question-set-status.enum';
import { QuestionSetItem } from '../../question-sets/entities/question-set-item.entity';
import { CvVersion } from '../../documents/entities/cv-version.entity';
import { CvProfileStatus } from '../../documents/enums/cv-profile-status.enum';
import { Job } from '../../jobs/entities/job.entity';
import { JobStatus } from '../../jobs/enums/job-status.enum';
import { Candidate } from '../../candidates/entities/candidate.entity';
import { CreateInterviewDto } from '../dto/create-interview.dto';
import { ListInterviewsQueryDto } from '../dto/list-interviews-query.dto';
import { RevokeInterviewDto } from '../dto/revoke-interview.dto';
import { ResendInvitationDto } from '../dto/resend-invitation.dto';
import {
  InterviewDetailDto,
  InterviewSummaryDto,
} from '../dto/interview-response.dto';
import { InterviewStatus } from '../enums/interview-status.enum';
import { InterviewLanguage } from '../enums/interview-language.enum';
import { InvitationTokenService } from './invitation-token.service';
import { InterviewLifecycleService } from './interview-lifecycle.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationType } from '../../notifications/enums/notification-type.enum';
import { AuditService } from '../../../platform/audit/audit.service';
import { IdempotencyService } from '../../../platform/idempotency/idempotency.service';
import { PermissionsService } from '../../admin/permissions/permissions.service';
import { Permissions } from '../../admin/permissions/permissions.constants';
import { ActorContext } from '../../../common/context/actor-context';
import {
  createPaginationResult,
  PaginatedResult,
} from '../../../common/dto/pagination.dto';
import { VersionConflictException } from '../../../common/dto/expected-version.dto';
import { ErrorCodes } from '../../../common/errors/error-codes';

export interface CreateInterviewResult {
  id: string;
  status: InterviewStatus;
  invitationExpiresAt: Date;
  durationMinutes: number;
  invitationVersion: number;
  version: number;
  notification: {
    id: string;
    status: string;
  };
}

@Injectable()
export class InterviewsService {
  private readonly logger = new Logger(InterviewsService.name);

  constructor(
    @InjectRepository(Interview)
    private readonly interviewRepository: Repository<Interview>,
    @InjectRepository(InterviewQuestion)
    private readonly questionRepository: Repository<InterviewQuestion>,
    @InjectRepository(Invitation)
    private readonly invitationRepository: Repository<Invitation>,
    @InjectRepository(InterviewAccessCredential)
    private readonly credentialRepository: Repository<InterviewAccessCredential>,
    @InjectRepository(Application)
    private readonly applicationRepository: Repository<Application>,
    @InjectRepository(QuestionSet)
    private readonly questionSetRepository: Repository<QuestionSet>,
    @InjectRepository(CvVersion)
    private readonly cvVersionRepository: Repository<CvVersion>,
    @InjectRepository(Job)
    private readonly jobRepository: Repository<Job>,
    @InjectRepository(Candidate)
    private readonly candidateRepository: Repository<Candidate>,
    private readonly dataSource: DataSource,
    private readonly tokenService: InvitationTokenService,
    private readonly notificationsService: NotificationsService,
    private readonly idempotencyService: IdempotencyService,
    private readonly permissionsService: PermissionsService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
    private readonly lifecycleService: InterviewLifecycleService,
  ) {}

  /**
   * Tạo Interview và Invitation kèm Idempotency
   */
  async create(
    actor: ActorContext,
    applicationId: string,
    dto: CreateInterviewDto,
    idempotencyKey?: string,
  ): Promise<CreateInterviewResult> {
    if (!idempotencyKey || !idempotencyKey.trim()) {
      throw new BadRequestException(
        'Header Idempotency-Key là bắt buộc khi tạo lời mời phỏng vấn',
      );
    }

    const route = `/api/v1/applications/${applicationId}/interviews`;
    const idempotencyResult =
      await this.idempotencyService.execute<CreateInterviewResult>({
        actorScope: actor.userId,
        route,
        key: idempotencyKey,
        method: 'POST',
        body: dto,
        ttlSeconds: 86400,
        action: async () => {
          const res = await this.executeCreateInterview(
            actor,
            applicationId,
            dto,
          );
          return { status: 201, body: res };
        },
      });

    return idempotencyResult.body;
  }

  /**
   * Thực thi logic tạo Interview trong Database Transaction
   */
  private async executeCreateInterview(
    actor: ActorContext,
    applicationId: string,
    dto: CreateInterviewDto,
  ): Promise<CreateInterviewResult> {
    const isAppAdmin = await this.permissionsService.hasAll(actor.userId, [
      Permissions.InterviewsManage,
    ]);

    // Validation thời gian expiry: 1 đến 14 ngày theo server time
    const now = new Date();
    const expiryDate = new Date(dto.invitationExpiresAt);
    if (isNaN(expiryDate.getTime())) {
      throw new BadRequestException({
        code: ErrorCodes.INVALID_INVITATION_EXPIRY,
        message: 'invitationExpiresAt không phải là thời gian hợp lệ',
      });
    }

    const minExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1000 - 60000); // 1 ngày (-1 min buffer)
    const maxExpiry = new Date(
      now.getTime() + 14 * 24 * 60 * 60 * 1000 + 60000,
    ); // 14 ngày (+1 min buffer)
    if (expiryDate < minExpiry || expiryDate > maxExpiry) {
      throw new BadRequestException({
        code: ErrorCodes.INVALID_INVITATION_EXPIRY,
        message:
          'Hạn cuối lời mời phỏng vấn phải nằm trong khoảng từ 1 đến 14 ngày tới',
      });
    }

    // Validation duration
    if (dto.durationMinutes < 10 || dto.durationMinutes > 90) {
      throw new BadRequestException({
        code: ErrorCodes.INVALID_INTERVIEW_DURATION,
        message: 'Thời lượng làm bài phỏng vấn phải từ 10 đến 90 phút',
      });
    }

    let createdNotificationId = '';
    let notificationDedupeKey = '';

    const result = await this.dataSource.transaction(async (manager) => {
      const appRepo = manager.getRepository(Application);
      const interviewRepo = manager.getRepository(Interview);
      const questionRepo = manager.getRepository(InterviewQuestion);
      const invRepo = manager.getRepository(Invitation);
      const qsRepo = manager.getRepository(QuestionSet);
      const itemRepo = manager.getRepository(QuestionSetItem);
      const cvRepo = manager.getRepository(CvVersion);
      const jobRepo = manager.getRepository(Job);
      const candRepo = manager.getRepository(Candidate);

      // 1. Lock Application bằng pessimistic write
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

      // 2. Quyền sở hữu: Application owner hoặc Admin
      if (!isAppAdmin && application.ownerId !== actor.userId) {
        throw new NotFoundException({
          code: ErrorCodes.APPLICATION_NOT_FOUND,
          message: 'Hồ sơ ứng tuyển không tồn tại',
        });
      }

      // 3. Trạng thái Application phải là shortlisted
      if (application.status !== ApplicationStatus.SHORTLISTED) {
        throw new ConflictException({
          code: ErrorCodes.APPLICATION_STATE_CONFLICT,
          message: `Chỉ được tạo phỏng vấn cho hồ sơ ở trạng thái shortlisted (hiện tại: ${application.status})`,
        });
      }

      // 4. Kiểm tra OCC Application version
      if (application.version !== dto.expectedApplicationVersion) {
        throw new VersionConflictException(
          `Phiên bản Application không khớp: expected ${dto.expectedApplicationVersion}, actual ${application.version}`,
        );
      }

      // 5. Job phải tồn tại và status OPEN
      const job = await jobRepo.findOne({
        where: { id: application.jobId },
      });
      if (!job || job.deletedAt || job.status !== JobStatus.OPEN) {
        throw new ConflictException({
          code: ErrorCodes.JOB_NOT_ACCEPTING_APPLICATIONS,
          message: 'Vị trí công việc (Job) không mở hoặc đã bị đóng',
        });
      }

      // 6. Candidate phải tồn tại và có email hợp lệ
      const candidate = await candRepo.findOne({
        where: { id: application.candidateId },
      });
      if (!candidate || candidate.deletedAt || !candidate.email?.trim()) {
        throw new BadRequestException({
          code: ErrorCodes.VALIDATION_FAILED,
          message: 'Ứng viên không tồn tại hoặc chưa có địa chỉ email hợp lệ',
        });
      }

      // 7. Kiểm tra không có Interview đang mở (invited hoặc in_progress)
      const openInterview = await interviewRepo.findOne({
        where: {
          applicationId: application.id,
          status: In([InterviewStatus.INVITED, InterviewStatus.IN_PROGRESS]),
        },
      });
      if (openInterview) {
        throw new ConflictException({
          code: ErrorCodes.INTERVIEW_ALREADY_OPEN,
          message: 'Hồ sơ ứng tuyển này đã có một buổi phỏng vấn đang mở',
        });
      }

      // 8. Kiểm tra Question Set
      const questionSet = await qsRepo.findOne({
        where: { id: dto.questionSetId },
      });
      if (!questionSet || questionSet.deletedAt) {
        throw new NotFoundException({
          code: ErrorCodes.QUESTION_SET_NOT_FOUND,
          message: 'Question Set không tồn tại',
        });
      }

      if (questionSet.applicationId !== application.id) {
        throw new BadRequestException({
          code: ErrorCodes.QUESTION_SET_NOT_FOUND,
          message: 'Question Set không thuộc về hồ sơ ứng tuyển này',
        });
      }

      if (questionSet.status !== QuestionSetStatus.APPROVED) {
        throw new ConflictException({
          code: ErrorCodes.QUESTION_SET_NOT_APPROVED,
          message: 'Question Set chưa được phê duyệt (status must be approved)',
        });
      }

      // Kiểm tra Stale Question Set
      if (
        !application.currentCvVersionId ||
        application.currentCvVersionId !== questionSet.cvVersionId
      ) {
        throw new ConflictException({
          code: ErrorCodes.QUESTION_SET_STALE,
          message: 'Question Set bị stale do CV hiện tại của hồ sơ đã thay đổi',
        });
      }

      const currentCv = await cvRepo.findOne({
        where: { id: application.currentCvVersionId },
      });
      if (
        !currentCv ||
        currentCv.deletedAt ||
        currentCv.profileStatus !== CvProfileStatus.APPROVED ||
        currentCv.profileVersion !== questionSet.cvProfileVersion
      ) {
        throw new ConflictException({
          code: ErrorCodes.QUESTION_SET_STALE,
          message:
            'Question Set bị stale do CV profile đã có phiên bản mới hơn',
        });
      }

      if (job.version !== questionSet.jobVersion) {
        throw new ConflictException({
          code: ErrorCodes.QUESTION_SET_STALE,
          message:
            'Question Set bị stale do Job specification đã có phiên bản mới hơn',
        });
      }

      // 9. Lấy danh sách câu hỏi từ Question Set
      const qsItems = await itemRepo.find({
        where: { questionSetId: questionSet.id },
        order: { position: 'ASC' },
      });

      if (!qsItems || qsItems.length < 1 || qsItems.length > 12) {
        throw new BadRequestException({
          code: ErrorCodes.QUESTION_SET_EMPTY,
          message: 'Question Set phải có từ 1 đến 12 câu hỏi',
        });
      }

      // 10. Tính toán roundNo tiếp theo
      const maxRoundRaw = (await interviewRepo
        .createQueryBuilder('i')
        .select('MAX(i.round_no)', 'maxRound')
        .where('i.application_id = :applicationId', {
          applicationId: application.id,
        })
        .getRawOne()) as unknown as { maxRound?: string | number } | null;
      const nextRoundNo =
        (parseInt(String(maxRoundRaw?.maxRound ?? '0'), 10) || 0) + 1;

      // 11. Tạo Interview
      const interview = interviewRepo.create({
        ownerId: application.ownerId,
        applicationId: application.id,
        questionSetId: questionSet.id,
        cvVersionId: currentCv.id,
        roundNo: nextRoundNo,
        status: InterviewStatus.INVITED,
        invitationExpiresAt: expiryDate,
        durationMinutes: dto.durationMinutes,
        version: 1,
        invitationVersion: 1,
        language:
          (questionSet.language as unknown as InterviewLanguage) ||
          InterviewLanguage.VI,
        maxFollowUpsTotal: dto.maxFollowUpsTotal,
        profileSnapshot: questionSet.profileSnapshot,
        jobSnapshot: questionSet.jobSnapshot,
      });

      const savedInterview = await interviewRepo.save(interview);

      // 12. Copy QuestionSetItem -> InterviewQuestion
      const interviewQuestions = qsItems.map((item) =>
        questionRepo.create({
          interviewId: savedInterview.id,
          sourceQuestionId: item.id,
          position: item.position,
          text: item.text,
          source: item.source,
          competency: item.competency,
          evaluationCriterionId: item.evaluationCriterionId,
          difficulty: item.difficulty,
          allowFollowUp: item.allowFollowUp,
          maxFollowUps: item.allowFollowUp ? item.maxFollowUps : 0,
          evidenceRefs: item.evidenceRefs,
        }),
      );
      await questionRepo.save(interviewQuestions);

      // 13. Tạo raw invitation token và Invitation entity
      const rawToken = this.tokenService.generateToken();
      const tokenHash = this.tokenService.hashToken(rawToken);

      const invitation = invRepo.create({
        interviewId: savedInterview.id,
        invitationVersion: 1,
        tokenHash,
        expiresAt: expiryDate,
      });
      await invRepo.save(invitation);

      // 14. Tạo Notification pending với encrypted payload
      const frontendUrl =
        this.configService.get<string>('frontendUrl') ||
        'http://localhost:3000';
      const invitationUrl = `${frontendUrl}/interview#token=${rawToken}`;
      notificationDedupeKey = `interview_invitation:${savedInterview.id}:v1`;

      const notification =
        await this.notificationsService.createPendingNotification(
          {
            ownerId: savedInterview.ownerId,
            interviewId: savedInterview.id,
            invitationVersion: 1,
            type: NotificationType.INTERVIEW_INVITATION,
            recipient: candidate.email,
            dedupeKey: notificationDedupeKey,
            unencryptedPayload: {
              candidateName: candidate.fullName,
              jobTitle: job.title,
              durationMinutes: savedInterview.durationMinutes,
              invitationExpiresAt:
                savedInterview.invitationExpiresAt.toISOString(),
              invitationUrl,
            },
          },
          manager,
        );
      createdNotificationId = notification.id;

      // 15. Chuyển Application status sang interviewing và tăng version
      application.status = ApplicationStatus.INTERVIEWING;
      application.version += 1;
      await appRepo.save(application);

      // 16. Ghi Audit Log
      await this.auditService.record(
        {
          actorId: actor.userId,
          actorType: 'user',
          action: 'interview.created',
          targetType: 'interview',
          targetId: savedInterview.id,
          ownerId: savedInterview.ownerId,
          metadata: {
            applicationId: application.id,
            questionSetId: questionSet.id,
            roundNo: savedInterview.roundNo,
            durationMinutes: savedInterview.durationMinutes,
            invitationExpiresAt: savedInterview.invitationExpiresAt,
          },
          requestId: actor.requestId,
        },
        manager,
      );

      return {
        id: savedInterview.id,
        status: savedInterview.status,
        invitationExpiresAt: savedInterview.invitationExpiresAt,
        durationMinutes: savedInterview.durationMinutes,
        invitationVersion: savedInterview.invitationVersion,
        version: savedInterview.version,
        notification: {
          id: notification.id,
          status: notification.status,
        },
      };
    });

    // 17. Dispatch notification trực tiếp sau khi transaction đã commit thành công
    if (createdNotificationId) {
      const dispatchResult =
        await this.notificationsService.dispatchNotification(
          createdNotificationId,
        );
      if (dispatchResult) {
        result.notification.status = dispatchResult.notification.status;
      }
    }

    return result;
  }

  /**
   * Danh sách Interviews (Offset Pagination, Filters, Visibility)
   */
  async list(
    actor: ActorContext,
    query: ListInterviewsQueryDto,
  ): Promise<PaginatedResult<InterviewSummaryDto>> {
    const isAppAdmin = await this.permissionsService.hasAll(actor.userId, [
      Permissions.InterviewsManage,
    ]);

    const qb = this.interviewRepository
      .createQueryBuilder('i')
      .innerJoin('i.application', 'app')
      .leftJoin('app.job', 'job');

    if (!isAppAdmin) {
      const scope = query.scope || 'all';
      if (scope === 'mine') {
        qb.andWhere('i.owner_id = :userId', { userId: actor.userId });
      } else if (scope === 'job_owned') {
        qb.andWhere('job.owner_id = :userId', { userId: actor.userId });
      } else {
        // all: là owner của application HOẶC là owner của job
        qb.andWhere('(i.owner_id = :userId OR job.owner_id = :userId)', {
          userId: actor.userId,
        });
      }
    }

    if (query.status) {
      qb.andWhere('i.status = :status', { status: query.status });
    }

    if (query.expiresBefore) {
      qb.andWhere('i.invitation_expires_at <= :expiresBefore', {
        expiresBefore: new Date(query.expiresBefore),
      });
    }

    if (query.jobId) {
      qb.andWhere('app.job_id = :jobId', { jobId: query.jobId });
    }

    qb.orderBy('i.created_at', 'DESC')
      .addOrderBy('i.id', 'DESC')
      .skip(query.skip)
      .take(query.limit ?? 20);

    const [interviews, totalItems] = await qb.getManyAndCount();

    const dtos = interviews.map((i) => this.mapToSummaryDto(i));
    return createPaginationResult(dtos, totalItems, query);
  }

  /**
   * Chi tiết Interview kèm Questions và Snapshot
   */
  async findOne(actor: ActorContext, id: string): Promise<InterviewDetailDto> {
    const isAppAdmin = await this.permissionsService.hasAll(actor.userId, [
      Permissions.InterviewsManage,
    ]);

    const interview = await this.interviewRepository.findOne({
      where: { id },
      relations: {
        application: {
          candidate: true,
          job: true,
        },
        questions: true,
      },
    });

    if (!interview || !interview.application) {
      throw new NotFoundException({
        code: ErrorCodes.INTERVIEW_NOT_FOUND,
        message: 'Phỏng vấn không tồn tại',
      });
    }

    const isAppOwner = interview.ownerId === actor.userId;
    const isJobOwner = interview.application.job?.ownerId === actor.userId;

    if (!isAppAdmin && !isAppOwner && !isJobOwner) {
      throw new NotFoundException({
        code: ErrorCodes.INTERVIEW_NOT_FOUND,
        message: 'Phỏng vấn không tồn tại',
      });
    }

    // Lazy reconcile nếu status là invited và đã quá hạn
    const now = new Date();
    if (
      interview.status === InterviewStatus.INVITED &&
      interview.invitationExpiresAt < now
    ) {
      await this.lifecycleService.expireInterview(interview.id).catch((err) => {
        this.logger.error(
          `Error during lazy expireInterview in findOne: ${err}`,
        );
      });
      interview.status = InterviewStatus.EXPIRED;
    }

    return this.mapToDetailDto(interview);
  }

  /**
   * Thu hồi Interview (Revoke)
   */
  async revoke(
    actor: ActorContext,
    id: string,
    dto: RevokeInterviewDto,
  ): Promise<InterviewDetailDto> {
    const isAppAdmin = await this.permissionsService.hasAll(actor.userId, [
      Permissions.InterviewsManage,
    ]);

    let cancelNotificationId = '';
    let cancelDedupeKey = '';

    const result = await this.dataSource.transaction(async (manager) => {
      const interviewRepo = manager.getRepository(Interview);
      const appRepo = manager.getRepository(Application);
      const invRepo = manager.getRepository(Invitation);
      const credRepo = manager.getRepository(InterviewAccessCredential);
      const candRepo = manager.getRepository(Candidate);
      const jobRepo = manager.getRepository(Job);

      // 1. Lock Interview để lấy applicationId
      const initialInterview = await interviewRepo.findOne({
        where: { id },
      });

      if (!initialInterview) {
        throw new NotFoundException({
          code: ErrorCodes.INTERVIEW_NOT_FOUND,
          message: 'Phỏng vấn không tồn tại',
        });
      }

      if (!isAppAdmin && initialInterview.ownerId !== actor.userId) {
        throw new NotFoundException({
          code: ErrorCodes.INTERVIEW_NOT_FOUND,
          message: 'Phỏng vấn không tồn tại',
        });
      }

      // 2. Lock Application trước
      const application = await appRepo
        .createQueryBuilder('app')
        .setLock('pessimistic_write')
        .where('app.id = :id', { id: initialInterview.applicationId })
        .andWhere('app.deletedAt IS NULL')
        .getOne();

      if (!application) {
        throw new NotFoundException({
          code: ErrorCodes.APPLICATION_NOT_FOUND,
          message: 'Hồ sơ ứng tuyển không tồn tại',
        });
      }

      // 3. Lock Interview sau
      const interview = await interviewRepo
        .createQueryBuilder('i')
        .setLock('pessimistic_write')
        .where('i.id = :id', { id })
        .getOne();

      if (!interview) {
        throw new NotFoundException({
          code: ErrorCodes.INTERVIEW_NOT_FOUND,
          message: 'Phỏng vấn không tồn tại',
        });
      }

      // 4. Kiểm tra status: cho phép revoke ở status invited hoặc in_progress
      const isBeforeStart = interview.status === InterviewStatus.INVITED;
      if (
        interview.status !== InterviewStatus.INVITED &&
        interview.status !== InterviewStatus.IN_PROGRESS
      ) {
        throw new ConflictException({
          code: ErrorCodes.INTERVIEW_NOT_REVOCABLE,
          message: `Chỉ có thể thu hồi buổi phỏng vấn ở trạng thái invited hoặc in_progress (hiện tại: ${interview.status})`,
        });
      }

      // 5. Kiểm tra OCC
      if (interview.version !== dto.expectedVersion) {
        throw new VersionConflictException(
          `Phiên bản Interview không khớp: expected ${dto.expectedVersion}, actual ${interview.version}`,
        );
      }

      const now = new Date();

      // 6. Cập nhật Interview status -> CANCELLED
      interview.status = InterviewStatus.CANCELLED;
      interview.cancelReason = dto.reason.trim();
      interview.cancelledAt = now;
      interview.version += 1;
      interview.invitationVersion += 1;
      const updatedInterview = await interviewRepo.save(interview);

      // Nếu đã có session đang chạy, đóng session qua SessionEndReason.HR_CANCELLED
      const sessionRepo = manager.getRepository(InterviewSession);
      const turnRepo = manager.getRepository(InterviewTurn);
      const runningSession = await sessionRepo.findOne({
        where: { interviewId: interview.id },
      });

      if (
        runningSession &&
        runningSession.status === SessionStatus.IN_PROGRESS
      ) {
        if (runningSession.currentTurnId) {
          await turnRepo.update(
            { id: runningSession.currentTurnId, status: TurnStatus.OPEN },
            { status: TurnStatus.CLOSED_UNANSWERED, closedAt: now },
          );
        }
        await sessionRepo.update(
          { id: runningSession.id },
          {
            status: SessionStatus.CANCELLED,
            runtimeState: RuntimeState.CLOSED,
            endedAt: now,
            endReason: SessionEndReason.HR_CANCELLED,
            currentTurnId: null,
            version: runningSession.version + 1,
          },
        );
      }

      // 7. Revoke tất cả active invitations và credentials
      const invitations = await invRepo.find({
        where: { interviewId: interview.id },
      });

      for (const inv of invitations) {
        if (!inv.revokedAt) {
          inv.revokedAt = now;
          await invRepo.save(inv);

          await credRepo.update(
            { invitationId: inv.id, revokedAt: IsNull() },
            { revokedAt: now },
          );
        }
      }

      // 8. Chuyển Application status:
      // Nếu cancel trước Start (invited) -> về shortlisted
      // Nếu cancel sau Start (in_progress) -> sang under_review vì đã có session/transcript
      if (application.status === ApplicationStatus.INTERVIEWING) {
        application.status = isBeforeStart
          ? ApplicationStatus.SHORTLISTED
          : ApplicationStatus.UNDER_REVIEW;
        application.version += 1;
        await appRepo.save(application);
      }

      // 9. Nếu notifyCandidate = true, tạo cancel notification
      if (dto.notifyCandidate) {
        const candidate = await candRepo.findOne({
          where: { id: application.candidateId },
        });
        const job = await jobRepo.findOne({
          where: { id: application.jobId },
        });

        if (candidate && candidate.email) {
          cancelDedupeKey = `interview_cancelled:${interview.id}:v${interview.invitationVersion}`;
          const notif =
            await this.notificationsService.createPendingNotification(
              {
                ownerId: interview.ownerId,
                interviewId: interview.id,
                invitationVersion: interview.invitationVersion,
                type: NotificationType.INTERVIEW_CANCELLED,
                recipient: candidate.email,
                dedupeKey: cancelDedupeKey,
                unencryptedPayload: {
                  candidateName: candidate.fullName,
                  jobTitle: job?.title || 'Vị trí ứng tuyển',
                  reason: dto.reason,
                },
              },
              manager,
            );
          cancelNotificationId = notif.id;
        }
      }

      // 10. Ghi Audit Log
      await this.auditService.record(
        {
          actorId: actor.userId,
          actorType: 'user',
          action: 'interview.revoked',
          targetType: 'interview',
          targetId: updatedInterview.id,
          ownerId: updatedInterview.ownerId,
          metadata: {
            reason: dto.reason,
            notifyCandidate: dto.notifyCandidate,
            newVersion: updatedInterview.version,
          },
          requestId: actor.requestId,
        },
        manager,
      );

      return this.mapToDetailDto(updatedInterview);
    });

    if (cancelNotificationId) {
      await this.notificationsService.dispatchNotification(
        cancelNotificationId,
      );
    }

    return result;
  }

  /**
   * Gửi lại lời mời phỏng vấn (Resend Invitation)
   */
  async resendInvitation(
    actor: ActorContext,
    id: string,
    dto: ResendInvitationDto,
  ): Promise<InterviewDetailDto> {
    const isAppAdmin = await this.permissionsService.hasAll(actor.userId, [
      Permissions.InterviewsManage,
    ]);

    let resendNotificationId = '';
    let resendDedupeKey = '';

    const result = await this.dataSource.transaction(async (manager) => {
      const interviewRepo = manager.getRepository(Interview);
      const invRepo = manager.getRepository(Invitation);
      const credRepo = manager.getRepository(InterviewAccessCredential);
      const appRepo = manager.getRepository(Application);
      const candRepo = manager.getRepository(Candidate);
      const jobRepo = manager.getRepository(Job);

      // Lock row Interview
      const interview = await interviewRepo
        .createQueryBuilder('i')
        .setLock('pessimistic_write')
        .where('i.id = :id', { id })
        .getOne();

      if (!interview) {
        throw new NotFoundException({
          code: ErrorCodes.INTERVIEW_NOT_FOUND,
          message: 'Phỏng vấn không tồn tại',
        });
      }

      if (!isAppAdmin && interview.ownerId !== actor.userId) {
        throw new NotFoundException({
          code: ErrorCodes.INTERVIEW_NOT_FOUND,
          message: 'Phỏng vấn không tồn tại',
        });
      }

      // Chỉ gửi lại khi status=invited và chưa hết hạn
      if (interview.status !== InterviewStatus.INVITED) {
        throw new ConflictException({
          code: ErrorCodes.INTERVIEW_NOT_REVOCABLE,
          message: `Không thể gửi lại lời mời cho buổi phỏng vấn ở trạng thái ${interview.status}`,
        });
      }

      const now = new Date();
      if (interview.invitationExpiresAt < now) {
        throw new ConflictException({
          code: ErrorCodes.INVALID_INVITATION_EXPIRY,
          message: 'Buổi phỏng vấn đã hết hạn, không thể gửi lại lời mời',
        });
      }

      // Check OCC
      if (interview.version !== dto.expectedVersion) {
        throw new VersionConflictException(
          `Phiên bản Interview không khớp: expected ${dto.expectedVersion}, actual ${interview.version}`,
        );
      }

      // Hạn mới nếu client truyền
      if (dto.invitationExpiresAt) {
        const newExpiry = new Date(dto.invitationExpiresAt);
        const minExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1000 - 60000);
        const maxExpiry = new Date(
          now.getTime() + 14 * 24 * 60 * 60 * 1000 + 60000,
        );
        if (newExpiry < minExpiry || newExpiry > maxExpiry) {
          throw new BadRequestException({
            code: ErrorCodes.INVALID_INVITATION_EXPIRY,
            message: 'Hạn mới phải nằm trong khoảng từ 1 đến 14 ngày tới',
          });
        }
        interview.invitationExpiresAt = newExpiry;
      }

      // Tăng version và invitationVersion
      interview.version += 1;
      interview.invitationVersion += 1;
      const updatedInterview = await interviewRepo.save(interview);

      // Revoke tất cả invitation và credentials cũ
      const oldInvitations = await invRepo.find({
        where: { interviewId: interview.id },
      });

      for (const inv of oldInvitations) {
        if (!inv.revokedAt) {
          inv.revokedAt = now;
          await invRepo.save(inv);

          await credRepo.update(
            { invitationId: inv.id, revokedAt: IsNull() },
            { revokedAt: now },
          );
        }
      }

      // Tạo raw token mới và Invitation mới
      const newRawToken = this.tokenService.generateToken();
      const newTokenHash = this.tokenService.hashToken(newRawToken);

      const newInvitation = invRepo.create({
        interviewId: updatedInterview.id,
        invitationVersion: updatedInterview.invitationVersion,
        tokenHash: newTokenHash,
        expiresAt: updatedInterview.invitationExpiresAt,
      });
      await invRepo.save(newInvitation);

      // Lấy Candidate và Job info để gửi email
      const application = await appRepo.findOne({
        where: { id: updatedInterview.applicationId },
      });
      const candidate = application
        ? await candRepo.findOne({ where: { id: application.candidateId } })
        : null;
      const job = application
        ? await jobRepo.findOne({ where: { id: application.jobId } })
        : null;

      if (!candidate || !candidate.email) {
        throw new BadRequestException({
          code: ErrorCodes.VALIDATION_FAILED,
          message:
            'Không tìm thấy thông tin email của ứng viên để gửi lại thư mời',
        });
      }

      const frontendUrl =
        this.configService.get<string>('frontendUrl') ||
        'http://localhost:3000';
      const invitationUrl = `${frontendUrl}/interview#token=${newRawToken}`;
      resendDedupeKey = `interview_invitation:${updatedInterview.id}:v${updatedInterview.invitationVersion}`;

      const notification =
        await this.notificationsService.createPendingNotification(
          {
            ownerId: updatedInterview.ownerId,
            interviewId: updatedInterview.id,
            invitationVersion: updatedInterview.invitationVersion,
            type: NotificationType.INTERVIEW_INVITATION,
            recipient: candidate.email,
            dedupeKey: resendDedupeKey,
            unencryptedPayload: {
              candidateName: candidate.fullName,
              jobTitle: job?.title || 'Vị trí ứng tuyển',
              durationMinutes: updatedInterview.durationMinutes,
              invitationExpiresAt:
                updatedInterview.invitationExpiresAt.toISOString(),
              invitationUrl,
            },
          },
          manager,
        );
      resendNotificationId = notification.id;

      // Ghi Audit Log
      await this.auditService.record(
        {
          actorId: actor.userId,
          actorType: 'user',
          action: 'interview.invitation_resent',
          targetType: 'interview',
          targetId: updatedInterview.id,
          ownerId: updatedInterview.ownerId,
          metadata: {
            newInvitationVersion: updatedInterview.invitationVersion,
            newVersion: updatedInterview.version,
            invitationExpiresAt: updatedInterview.invitationExpiresAt,
          },
          requestId: actor.requestId,
        },
        manager,
      );

      return this.mapToDetailDto(updatedInterview);
    });

    if (resendNotificationId) {
      await this.notificationsService.dispatchNotification(
        resendNotificationId,
      );
    }

    return result;
  }

  private mapToSummaryDto(i: Interview): InterviewSummaryDto {
    return {
      id: i.id,
      ownerId: i.ownerId,
      applicationId: i.applicationId,
      questionSetId: i.questionSetId,
      cvVersionId: i.cvVersionId,
      roundNo: i.roundNo,
      status: i.status,
      invitationExpiresAt: i.invitationExpiresAt,
      durationMinutes: i.durationMinutes,
      version: i.version,
      invitationVersion: i.invitationVersion,
      language: i.language,
      maxFollowUpsTotal: i.maxFollowUpsTotal,
      cancelReason: i.cancelReason,
      cancelledAt: i.cancelledAt,
      completedAt: i.completedAt,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
    };
  }

  private mapToDetailDto(i: Interview): InterviewDetailDto {
    const questions = (i.questions || []).map((q) => ({
      id: q.id,
      sourceQuestionId: q.sourceQuestionId || null,
      position: q.position,
      text: q.text,
      source: q.source,
      competency: q.competency,
      evaluationCriterionId: q.evaluationCriterionId,
      difficulty: q.difficulty,
      allowFollowUp: q.allowFollowUp,
      maxFollowUps: q.maxFollowUps,
      evidenceRefs: q.evidenceRefs,
      createdAt: q.createdAt,
    }));

    const app = i.application;
    const candidateName =
      app?.candidate?.fullName ||
      (i.profileSnapshot?.fullName as string) ||
      undefined;
    const candidateEmail = app?.candidate?.email || undefined;
    const jobTitle =
      app?.job?.title || (i.jobSnapshot?.title as string) || undefined;

    return {
      ...this.mapToSummaryDto(i),
      profileSnapshot: i.profileSnapshot,
      jobSnapshot: i.jobSnapshot,
      questions,
      candidateName,
      candidateEmail,
      jobTitle,
    };
  }
}
