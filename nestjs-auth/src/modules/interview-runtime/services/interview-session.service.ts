import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { InterviewSession } from '../entities/interview-session.entity';
import { Interview } from '../../interviews/entities/interview.entity';
import { InterviewQuestion } from '../../interviews/entities/interview-question.entity';
import { InterviewAccessCredential } from '../../interviews/entities/interview-access-credential.entity';
import { InvitationTokenService } from '../../interviews/services/invitation-token.service';
import { InterviewStatus } from '../../interviews/enums/interview-status.enum';
import { SessionStatus } from '../enums/session-status.enum';
import { RuntimeState } from '../enums/runtime-state.enum';
import { SessionEndReason } from '../enums/session-end-reason.enum';
import { StartInterviewDto } from '../dto/start-interview.dto';
import { SubmitAnswerDto } from '../dto/submit-answer.dto';
import { FinishSessionDto } from '../dto/finish-session.dto';
import { CandidateSessionResponseDto } from '../dto/session-response.dto';
import { InterviewTurnService } from './interview-turn.service';
import { RuntimeTransitionService } from './runtime-transition.service';
import { RuntimeProjectionService } from './runtime-projection.service';
import { IdempotencyService } from '../../../platform/idempotency/idempotency.service';
import { AuditService } from '../../../platform/audit/audit.service';
import { ErrorCodes } from '../../../common/errors/error-codes';

interface DbClockResult {
  db_now: string | Date;
}

@Injectable()
export class InterviewSessionService {
  private readonly logger = new Logger(InterviewSessionService.name);

  // Consent version được chấp nhận ở thời điểm hiện tại
  public static readonly CURRENT_CONSENT_VERSION = 'v1';

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(InterviewSession)
    private readonly sessionRepository: Repository<InterviewSession>,
    @InjectRepository(Interview)
    private readonly interviewRepository: Repository<Interview>,
    @InjectRepository(InterviewQuestion)
    private readonly questionRepository: Repository<InterviewQuestion>,
    @InjectRepository(InterviewAccessCredential)
    private readonly credentialRepository: Repository<InterviewAccessCredential>,
    private readonly tokenService: InvitationTokenService,
    private readonly turnService: InterviewTurnService,
    private readonly transitionService: RuntimeTransitionService,
    private readonly projectionService: RuntimeProjectionService,
    private readonly idempotencyService: IdempotencyService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Lấy thời gian server chuẩn từ PostgreSQL database
   */
  private async getDatabaseTime(manager?: EntityManager): Promise<Date> {
    const runner = manager || this.dataSource;
    const result = await runner.query<DbClockResult[]>(
      'SELECT clock_timestamp() AS db_now',
    );
    return new Date(result[0].db_now);
  }

  /**
   * Tìm credential và interview từ rawCookieToken
   */
  async resolveCandidateAccess(rawCookieToken: string): Promise<{
    credential: InterviewAccessCredential;
    interview: Interview;
  }> {
    const tokenHash = this.tokenService.hashToken(rawCookieToken);

    const credential = await this.credentialRepository.findOne({
      where: { tokenHash },
      relations: {
        invitation: {
          interview: true,
        },
      },
    });

    if (
      !credential ||
      !credential.invitation ||
      !credential.invitation.interview
    ) {
      throw new UnauthorizedException({
        code: ErrorCodes.INVITATION_UNAVAILABLE,
        message: 'Phiên truy cập phỏng vấn không hợp lệ',
      });
    }

    const now = new Date();
    if (credential.revokedAt || credential.expiresAt < now) {
      throw new UnauthorizedException({
        code: ErrorCodes.INVITATION_UNAVAILABLE,
        message: 'Phiên truy cập phỏng vấn đã hết hạn hoặc bị thu hồi',
      });
    }

    const invitation = credential.invitation;
    const interview = invitation.interview;

    if (!interview) {
      throw new UnauthorizedException({
        code: ErrorCodes.INVITATION_UNAVAILABLE,
        message: 'Không tìm thấy thông tin buổi phỏng vấn',
      });
    }

    if (invitation.revokedAt) {
      throw new UnauthorizedException({
        code: ErrorCodes.INVITATION_UNAVAILABLE,
        message: 'Lời mời phỏng vấn đã bị thu hồi',
      });
    }

    if (invitation.invitationVersion !== interview.invitationVersion) {
      throw new UnauthorizedException({
        code: ErrorCodes.INVITATION_UNAVAILABLE,
        message: 'Lời mời phỏng vấn không còn hiệu lực do đã được cấp lại',
      });
    }

    return { credential, interview };
  }

  /**
   * START INTERVIEW
   * - Bắt buộc consent
   * - Tạo InterviewSession duy nhất
   * - startedAt = db_now, deadlineAt = startedAt + durationMinutes
   * - Gia hạn credential.expiresAt >= deadlineAt + 30 phút
   * - Mở Turn đầu tiên (position = 1)
   */
  async startInterview(
    rawCookieToken: string,
    dto: StartInterviewDto,
    idempotencyKey?: string,
  ): Promise<{
    statusCode: number;
    response: CandidateSessionResponseDto;
    newCookieExpiresAt?: Date;
  }> {
    const { credential, interview } =
      await this.resolveCandidateAccess(rawCookieToken);

    const actorScope = `candidate:interview:${interview.id}`;

    const executed = await this.idempotencyService.execute({
      actorScope,
      route: 'POST:/api/v1/candidate/interview/start',
      key: idempotencyKey,
      method: 'POST',
      body: dto,
      action: async () => {
        // Kiểm tra consent
        if (!dto.consentAccepted) {
          throw new BadRequestException({
            code: ErrorCodes.CONSENT_REQUIRED,
            message: 'Bạn cần đồng ý với các điều khoản trước khi bắt đầu',
          });
        }

        if (
          dto.consentVersion !== InterviewSessionService.CURRENT_CONSENT_VERSION
        ) {
          throw new BadRequestException({
            code: ErrorCodes.CONSENT_VERSION_MISMATCH,
            message: 'Phiên bản điều khoản đồng ý không khớp',
          });
        }

        let isCreated = false;
        let finalSession: InterviewSession;
        let newCookieExpiresAt: Date | undefined;

        await this.dataSource.transaction(async (manager) => {
          const interviewRepo = manager.getRepository(Interview);
          const sessionRepo = manager.getRepository(InterviewSession);
          const credRepo = manager.getRepository(InterviewAccessCredential);
          const questionRepo = manager.getRepository(InterviewQuestion);

          const dbNow = await this.getDatabaseTime(manager);

          // 1. Lock Interview pessimistic write
          const lockedInterview = await interviewRepo
            .createQueryBuilder('i')
            .setLock('pessimistic_write')
            .where('i.id = :id', { id: interview.id })
            .getOne();

          if (!lockedInterview) {
            throw new NotFoundException({
              code: ErrorCodes.INTERVIEW_NOT_FOUND,
              message: 'Buổi phỏng vấn không tồn tại',
            });
          }

          // Kiểm tra xem đã có Session chưa
          const existingSession = await sessionRepo.findOne({
            where: { interviewId: lockedInterview.id },
            relations: {
              currentTurn: true,
              turns: { answer: true },
            },
          });

          if (existingSession) {
            // Session đã tồn tại (ví dụ tab khác bấm trước hoặc idempotency) -> Trả lại session hiện tại
            finalSession = existingSession;
            isCreated = false;
            return;
          }

          // Kiểm tra trạng thái Interview phải là invited
          if (lockedInterview.status !== InterviewStatus.INVITED) {
            throw new ConflictException({
              code: ErrorCodes.INTERVIEW_ALREADY_STARTED,
              message: 'Buổi phỏng vấn đã được bắt đầu hoặc đã kết thúc',
            });
          }

          // Kiểm tra invitation_expires_at: phải còn hạn để start
          if (dbNow > lockedInterview.invitationExpiresAt) {
            throw new ConflictException({
              code: ErrorCodes.INVITATION_UNAVAILABLE,
              message: 'Lời mời phỏng vấn đã quá hạn để bắt đầu',
            });
          }

          // 2. Tính toán deadline
          const startedAt = dbNow;
          const deadlineAt = new Date(
            startedAt.getTime() + lockedInterview.durationMinutes * 60 * 1000,
          );

          // 3. Tạo InterviewSession
          const session = sessionRepo.create({
            interviewId: lockedInterview.id,
            status: SessionStatus.IN_PROGRESS,
            runtimeState: RuntimeState.AWAITING_ANSWER,
            startedAt,
            deadlineAt,
            endedAt: null,
            endReason: null,
            currentTurnId: null,
            followUpsUsed: 0,
            version: 1,
            advanceDeadlineAt: null,
            consentVersion: dto.consentVersion,
            consentedAt: dbNow,
          });
          const savedSession = await sessionRepo.save(session);

          // 4. Lấy câu hỏi đầu tiên (position = 1)
          const firstQuestion = await questionRepo.findOne({
            where: { interviewId: lockedInterview.id, position: 1 },
          });

          if (!firstQuestion) {
            throw new ConflictException({
              code: ErrorCodes.QUESTION_SET_EMPTY,
              message: 'Buổi phỏng vấn không có câu hỏi nào',
            });
          }

          // Tạo turn đầu tiên
          const firstTurn = await this.turnService.createInitialTurn(
            savedSession.id,
            firstQuestion,
            dbNow,
            manager,
          );

          savedSession.currentTurnId = firstTurn.id;
          savedSession.currentTurn = firstTurn;
          finalSession = await sessionRepo.save(savedSession);
          finalSession.turns = [firstTurn];

          // 5. Cập nhật Interview sang in_progress
          lockedInterview.status = InterviewStatus.IN_PROGRESS;
          lockedInterview.version += 1;
          await interviewRepo.save(lockedInterview);

          // 6. Gia hạn Credential đến deadlineAt + 30 phút read grace
          const graceExpiresAt = new Date(
            deadlineAt.getTime() + 30 * 60 * 1000,
          );
          if (credential.expiresAt < graceExpiresAt) {
            await credRepo.update(
              { id: credential.id },
              { expiresAt: graceExpiresAt },
            );
            newCookieExpiresAt = graceExpiresAt;
          }

          // 7. Audit log
          await this.auditService.record(
            {
              actorId: null,
              actorType: 'candidate',
              action: 'interview.started',
              targetType: 'interview_session',
              targetId: savedSession.id,
              ownerId: lockedInterview.ownerId,
              metadata: {
                interviewId: lockedInterview.id,
                startedAt,
                deadlineAt,
              },
            },
            manager,
          );

          isCreated = true;
        });

        // Đếm tổng số câu hỏi chính
        const totalMainQuestions = await this.questionRepository.count({
          where: { interviewId: interview.id },
        });

        const projection = this.projectionService.project(
          finalSession!,
          totalMainQuestions,
          new Date(),
        );

        return {
          status: isCreated ? HttpStatus.CREATED : HttpStatus.OK,
          body: {
            statusCode: isCreated ? HttpStatus.CREATED : HttpStatus.OK,
            response: projection,
            newCookieExpiresAt,
          },
        };
      },
    });

    return executed.body;
  }

  /**
   * GET / RESUME SESSION
   * - Trả về open turn, submitted turns, progress
   * - Nếu quá deadlineAt, tự động đóng session expired
   */
  async getSession(
    rawCookieToken: string,
  ): Promise<CandidateSessionResponseDto> {
    const { interview } = await this.resolveCandidateAccess(rawCookieToken);

    let session = await this.sessionRepository.findOne({
      where: { interviewId: interview.id },
      relations: {
        currentTurn: true,
        turns: { answer: true },
      },
    });

    if (!session) {
      throw new ConflictException({
        code: ErrorCodes.SESSION_NOT_STARTED,
        message: 'Buổi phỏng vấn chưa được bắt đầu',
      });
    }

    const dbNow = await this.getDatabaseTime();

    // Reconcile deadline: Nếu session đang in_progress mà dbNow >= deadlineAt -> Đóng expired
    if (
      session.status === SessionStatus.IN_PROGRESS &&
      dbNow >= session.deadlineAt
    ) {
      await this.dataSource.transaction(async (manager) => {
        const lockedSession = await manager
          .getRepository(InterviewSession)
          .createQueryBuilder('s')
          .setLock('pessimistic_write')
          .where('s.id = :id', { id: session!.id })
          .getOne();

        if (
          lockedSession &&
          lockedSession.status === SessionStatus.IN_PROGRESS
        ) {
          session = await this.transitionService.closeSession(
            lockedSession,
            SessionEndReason.DEADLINE_REACHED,
            dbNow,
            manager,
          );
        }
      });
    }

    const totalMainQuestions = await this.questionRepository.count({
      where: { interviewId: interview.id },
    });

    return this.projectionService.project(session, totalMainQuestions, dbNow);
  }

  /**
   * SUBMIT ANSWER
   * - Idempotency theo candidate:session:{sessionId}
   * - Kiểm tra deadlineAt; nếu hết hạn đóng session và ném 410 SESSION_EXPIRED
   * - Giao cho InterviewTurnService lưu Answer và mở Turn tiếp theo
   */
  async submitAnswer(
    rawCookieToken: string,
    dto: SubmitAnswerDto,
    idempotencyKey?: string,
  ): Promise<CandidateSessionResponseDto> {
    const { interview } = await this.resolveCandidateAccess(rawCookieToken);

    const session = await this.sessionRepository.findOne({
      where: { interviewId: interview.id },
    });

    if (!session) {
      throw new ConflictException({
        code: ErrorCodes.SESSION_NOT_STARTED,
        message: 'Buổi phỏng vấn chưa được bắt đầu',
      });
    }

    const actorScope = `candidate:session:${session.id}`;

    const executed = await this.idempotencyService.execute({
      actorScope,
      route: 'POST:/api/v1/candidate/session/answers',
      key: idempotencyKey,
      method: 'POST',
      body: dto,
      action: async () => {
        await this.dataSource.transaction(async (manager) => {
          const sessionRepo = manager.getRepository(InterviewSession);
          const dbNow = await this.getDatabaseTime(manager);

          // 1. Lock Session
          const lockedSession = await sessionRepo
            .createQueryBuilder('s')
            .setLock('pessimistic_write')
            .where('s.id = :id', { id: session.id })
            .getOne();

          if (!lockedSession) {
            throw new NotFoundException({
              code: ErrorCodes.RESOURCE_NOT_FOUND,
              message: 'Không tìm thấy phiên phỏng vấn',
            });
          }

          // Kiểm tra Session status
          if (lockedSession.status !== SessionStatus.IN_PROGRESS) {
            throw new ConflictException({
              code: ErrorCodes.SESSION_CLOSED,
              message: 'Phiên phỏng vấn đã đóng hoặc đã kết thúc',
            });
          }

          // Kiểm tra Deadline
          if (dbNow >= lockedSession.deadlineAt) {
            await this.transitionService.closeSession(
              lockedSession,
              SessionEndReason.DEADLINE_REACHED,
              dbNow,
              manager,
            );
            throw new HttpException(
              {
                code: ErrorCodes.SESSION_EXPIRED,
                message: 'Thời gian làm bài phỏng vấn đã kết thúc',
              },
              HttpStatus.GONE, // 410 GONE
            );
          }

          // 2. Thực hiện submit answer qua TurnService
          await this.turnService.submitAnswer(
            lockedSession,
            dto.turnId,
            dto.text,
            dto.isSkipped,
            dbNow,
            manager,
            idempotencyKey,
          );
        });

        // Load lại đầy đủ turns để project
        const fullSession = await this.sessionRepository.findOne({
          where: { id: session.id },
          relations: {
            currentTurn: true,
            turns: { answer: true },
          },
        });

        const totalMainQuestions = await this.questionRepository.count({
          where: { interviewId: interview.id },
        });

        const projection = this.projectionService.project(
          fullSession!,
          totalMainQuestions,
          new Date(),
        );

        return {
          status: HttpStatus.OK,
          body: projection,
        };
      },
    });

    return executed.body;
  }

  /**
   * FINISH SESSION
   * - Hết câu hỏi -> finish bình thường
   * - Còn câu hỏi -> yêu cầu confirmEarlyFinish = true, nếu false trả 422
   * - Chuyển session sang COMPLETED, endReason, Application sang under_review
   */
  async finishSession(
    rawCookieToken: string,
    dto: FinishSessionDto,
    idempotencyKey?: string,
  ): Promise<CandidateSessionResponseDto> {
    const { interview } = await this.resolveCandidateAccess(rawCookieToken);

    const session = await this.sessionRepository.findOne({
      where: { interviewId: interview.id },
    });

    if (!session) {
      throw new ConflictException({
        code: ErrorCodes.SESSION_NOT_STARTED,
        message: 'Buổi phỏng vấn chưa được bắt đầu',
      });
    }

    const actorScope = `candidate:session:${session.id}`;

    const executed = await this.idempotencyService.execute({
      actorScope,
      route: 'POST:/api/v1/candidate/session/finish',
      key: idempotencyKey,
      method: 'POST',
      body: dto,
      action: async () => {
        await this.dataSource.transaction(async (manager) => {
          const sessionRepo = manager.getRepository(InterviewSession);
          const dbNow = await this.getDatabaseTime(manager);

          // 1. Lock Session
          const lockedSession = await sessionRepo
            .createQueryBuilder('s')
            .setLock('pessimistic_write')
            .where('s.id = :id', { id: session.id })
            .getOne();

          if (!lockedSession) {
            throw new NotFoundException({
              code: ErrorCodes.RESOURCE_NOT_FOUND,
              message: 'Không tìm thấy phiên phỏng vấn',
            });
          }

          if (lockedSession.status !== SessionStatus.IN_PROGRESS) {
            throw new ConflictException({
              code: ErrorCodes.SESSION_CLOSED,
              message: 'Phiên phỏng vấn đã đóng hoặc đã kết thúc',
            });
          }

          // Kiểm tra Deadline
          if (dbNow >= lockedSession.deadlineAt) {
            await this.transitionService.closeSession(
              lockedSession,
              SessionEndReason.DEADLINE_REACHED,
              dbNow,
              manager,
            );
            throw new HttpException(
              {
                code: ErrorCodes.SESSION_EXPIRED,
                message: 'Thời gian làm bài phỏng vấn đã kết thúc',
              },
              HttpStatus.GONE,
            );
          }

          // Kiểm tra xem đã hết câu hỏi chưa
          const hasRemainingQuestions =
            lockedSession.runtimeState !== RuntimeState.READY_TO_FINISH;

          if (hasRemainingQuestions) {
            if (!dto.confirmEarlyFinish) {
              throw new HttpException(
                {
                  code: ErrorCodes.EARLY_FINISH_CONFIRMATION_REQUIRED,
                  message:
                    'Bạn vẫn còn câu hỏi chưa hoàn thành. Vui lòng xác nhận kết thúc sớm',
                },
                HttpStatus.UNPROCESSABLE_ENTITY, // 422
              );
            }
          }

          const endReason = hasRemainingQuestions
            ? SessionEndReason.SUBMITTED_EARLY
            : SessionEndReason.ALL_QUESTIONS_ANSWERED;

          await this.transitionService.closeSession(
            lockedSession,
            endReason,
            dbNow,
            manager,
            { actorId: null, actorType: 'candidate' },
          );
        });

        const fullSession = await this.sessionRepository.findOne({
          where: { id: session.id },
          relations: {
            currentTurn: true,
            turns: { answer: true },
          },
        });

        const totalMainQuestions = await this.questionRepository.count({
          where: { interviewId: interview.id },
        });

        const projection = this.projectionService.project(
          fullSession!,
          totalMainQuestions,
          new Date(),
        );

        return {
          status: HttpStatus.OK,
          body: projection,
        };
      },
    });

    return executed.body;
  }
}
