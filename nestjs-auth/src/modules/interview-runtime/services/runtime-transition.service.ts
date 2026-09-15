import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { InterviewSession } from '../entities/interview-session.entity';
import { InterviewTurn } from '../entities/interview-turn.entity';
import { Interview } from '../../interviews/entities/interview.entity';
import { Application } from '../../applications/entities/application.entity';
import { SessionStatus } from '../enums/session-status.enum';
import { RuntimeState } from '../enums/runtime-state.enum';
import { SessionEndReason } from '../enums/session-end-reason.enum';
import { TurnStatus } from '../enums/turn-status.enum';
import { InterviewStatus } from '../../interviews/enums/interview-status.enum';
import { ApplicationStatus } from '../../applications/enums/application-status.enum';
import { AuditService } from '../../../platform/audit/audit.service';

@Injectable()
export class RuntimeTransitionService {
  private readonly logger = new Logger(RuntimeTransitionService.name);

  constructor(private readonly auditService: AuditService) {}

  /**
   * Đóng session với lý do tương ứng (all_questions_answered, submitted_early, deadline_reached, hr_cancelled).
   * Luôn xử lý Turn đang open -> closed_unanswered.
   * Cập nhật Interview status và Application status tương ứng.
   */
  async closeSession(
    session: InterviewSession,
    endReason: SessionEndReason,
    now: Date,
    manager: EntityManager,
    actorInfo?: {
      actorId?: string | null;
      actorType?: string;
      requestId?: string;
    },
  ): Promise<InterviewSession> {
    const sessionRepo = manager.getRepository(InterviewSession);
    const turnRepo = manager.getRepository(InterviewTurn);
    const interviewRepo = manager.getRepository(Interview);
    const appRepo = manager.getRepository(Application);

    // 1. Đóng open turn nếu có
    if (session.currentTurnId) {
      const currentTurn = await turnRepo.findOne({
        where: { id: session.currentTurnId },
      });
      if (currentTurn && currentTurn.status === TurnStatus.OPEN) {
        currentTurn.status = TurnStatus.CLOSED_UNANSWERED;
        currentTurn.closedAt = now;
        await turnRepo.save(currentTurn);
      }
    }

    // 2. Xác định trạng thái mới của Session và Interview
    let sessionStatus = SessionStatus.COMPLETED;
    let interviewStatus = InterviewStatus.COMPLETED;

    if (endReason === SessionEndReason.DEADLINE_REACHED) {
      sessionStatus = SessionStatus.EXPIRED;
      interviewStatus = InterviewStatus.EXPIRED;
    } else if (endReason === SessionEndReason.HR_CANCELLED) {
      sessionStatus = SessionStatus.CANCELLED;
      interviewStatus = InterviewStatus.CANCELLED;
    }

    // 3. Cập nhật Session
    session.status = sessionStatus;
    session.runtimeState = RuntimeState.CLOSED;
    session.endedAt = now;
    session.endReason = endReason;
    session.currentTurnId = null;
    session.currentTurn = null;
    session.version += 1;
    const savedSession = await sessionRepo.save(session);

    // 4. Cập nhật Interview
    const interview = await interviewRepo.findOne({
      where: { id: session.interviewId },
    });
    if (interview) {
      interview.status = interviewStatus;
      if (interviewStatus === InterviewStatus.COMPLETED) {
        interview.completedAt = now;
      }
      interview.version += 1;
      await interviewRepo.save(interview);

      // 5. Cập nhật Application -> under_review (vì đã có session/dữ liệu phỏng vấn)
      const application = await appRepo.findOne({
        where: { id: interview.applicationId },
      });
      if (application) {
        application.status = ApplicationStatus.UNDER_REVIEW;
        application.version += 1;
        await appRepo.save(application);
      }
    }

    // 6. Ghi Audit Log
    let auditAction = 'interview.finished';
    if (endReason === SessionEndReason.DEADLINE_REACHED) {
      auditAction = 'interview.expired';
    } else if (endReason === SessionEndReason.HR_CANCELLED) {
      auditAction = 'interview.cancelled';
    }

    await this.auditService.record(
      {
        actorId: actorInfo?.actorId ?? null,
        actorType: actorInfo?.actorType || 'system',
        action: auditAction,
        targetType: 'interview_session',
        targetId: session.id,
        ownerId: interview?.ownerId,
        metadata: {
          interviewId: session.interviewId,
          endReason,
          sessionStatus,
        },
        requestId: actorInfo?.requestId,
      },
      manager,
    );

    return savedSession;
  }
}
