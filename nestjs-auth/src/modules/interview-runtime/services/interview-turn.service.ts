import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { createHash } from 'crypto';
import { InterviewSession } from '../entities/interview-session.entity';
import { InterviewTurn } from '../entities/interview-turn.entity';
import { Answer } from '../entities/answer.entity';
import { InterviewQuestion } from '../../interviews/entities/interview-question.entity';
import { TurnKind } from '../enums/turn-kind.enum';
import { TurnStatus } from '../enums/turn-status.enum';
import { RuntimeState } from '../enums/runtime-state.enum';
import { RuntimeTransitionService } from './runtime-transition.service';
import { ErrorCodes } from '../../../common/errors/error-codes';
import { AuditService } from '../../../platform/audit/audit.service';

@Injectable()
export class InterviewTurnService {
  private readonly logger = new Logger(InterviewTurnService.name);

  constructor(
    private readonly transitionService: RuntimeTransitionService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Tạo initial main Turn từ câu hỏi đầu tiên (position = 1).
   */
  async createInitialTurn(
    sessionId: string,
    firstQuestion: InterviewQuestion,
    now: Date,
    manager: EntityManager,
  ): Promise<InterviewTurn> {
    const turnRepo = manager.getRepository(InterviewTurn);

    const turn = turnRepo.create({
      sessionId,
      rootQuestionId: firstQuestion.id,
      parentTurnId: null,
      sequenceNo: 1,
      kind: TurnKind.MAIN,
      followUpIndex: 0,
      text: firstQuestion.text,
      status: TurnStatus.OPEN,
      presentedAt: now,
      closedAt: null,
      aiRunId: null,
    });

    return turnRepo.save(turn);
  }

  /**
   * Submit hoặc Skip answer cho current Turn.
   * Manual mode:
   * - Xác thực payload (text vs isSkipped)
   * - Kiểm tra turn hợp lệ
   * - Tạo Answer bất biến
   * - Đóng Turn (answered | skipped)
   * - Tìm câu hỏi kế tiếp theo position
   * - Nếu còn câu hỏi: mở Turn mới (open), sequenceNo + 1
   * - Nếu hết câu hỏi: chuyển session sang READY_TO_FINISH, currentTurnId = null
   */
  async submitAnswer(
    session: InterviewSession,
    turnId: string,
    text: string | null | undefined,
    isSkipped: boolean,
    now: Date,
    manager: EntityManager,
    clientRequestId?: string,
  ): Promise<InterviewSession> {
    const turnRepo = manager.getRepository(InterviewTurn);
    const answerRepo = manager.getRepository(Answer);
    const sessionRepo = manager.getRepository(InterviewSession);
    const questionRepo = manager.getRepository(InterviewQuestion);

    // 1. Kiểm tra Turn có phải là current Turn của Session không
    if (!session.currentTurnId || session.currentTurnId !== turnId) {
      throw new ConflictException({
        code: ErrorCodes.TURN_NOT_CURRENT,
        message: 'Lượt trả lời không khớp với câu hỏi hiện tại đang mở',
      });
    }

    // 2. Lock và tải Turn hiện tại
    const turn = await turnRepo
      .createQueryBuilder('turn')
      .setLock('pessimistic_write')
      .where('turn.id = :id', { id: turnId })
      .andWhere('turn.sessionId = :sessionId', { sessionId: session.id })
      .getOne();

    if (!turn) {
      throw new ConflictException({
        code: ErrorCodes.TURN_NOT_CURRENT,
        message: 'Không tìm thấy câu hỏi hiện tại',
      });
    }

    if (turn.status !== TurnStatus.OPEN) {
      throw new ConflictException({
        code: ErrorCodes.TURN_ALREADY_ANSWERED,
        message: 'Câu hỏi này đã được trả lời hoặc đã đóng',
      });
    }

    // 3. Validation text & isSkipped
    const trimmedText = text?.trim();
    if (isSkipped) {
      if (trimmedText && trimmedText.length > 0) {
        throw new BadRequestException({
          code: ErrorCodes.INVALID_ANSWER,
          message:
            'Khi chọn bỏ qua (skip), không được gửi kèm nội dung trả lời',
        });
      }
    } else {
      if (!trimmedText || trimmedText.length === 0) {
        throw new BadRequestException({
          code: ErrorCodes.INVALID_ANSWER,
          message: 'Vui lòng nhập nội dung câu trả lời hoặc chọn bỏ qua',
        });
      }
      if (trimmedText.length > 10000) {
        throw new BadRequestException({
          code: ErrorCodes.INVALID_ANSWER,
          message: 'Nội dung câu trả lời không được vượt quá 10,000 ký tự',
        });
      }
    }

    // 4. Tạo content_hash và lưu Answer bất biến
    const normalizedContent = isSkipped ? '' : trimmedText!;
    const contentHash = createHash('sha256')
      .update(normalizedContent)
      .digest('hex');

    const answer = answerRepo.create({
      turnId: turn.id,
      text: isSkipped ? null : trimmedText,
      isSkipped,
      submittedAt: now,
      clientRequestId: clientRequestId || null,
      contentHash,
    });
    await answerRepo.save(answer);

    // 5. Đóng Turn hiện tại
    turn.status = isSkipped ? TurnStatus.SKIPPED : TurnStatus.ANSWERED;
    turn.closedAt = now;
    await turnRepo.save(turn);

    // 6. Tìm câu hỏi chính tiếp theo (Manual mode)
    // Lấy câu hỏi hiện tại để biết position
    const currentQuestion = await questionRepo.findOne({
      where: { id: turn.rootQuestionId },
    });

    const nextPosition = (currentQuestion?.position || 1) + 1;
    const nextQuestion = await questionRepo.findOne({
      where: {
        interviewId: session.interviewId,
        position: nextPosition,
      },
    });

    if (nextQuestion) {
      // Mở Turn tiếp theo
      const nextSequenceNo = turn.sequenceNo + 1;
      const nextTurn = turnRepo.create({
        sessionId: session.id,
        rootQuestionId: nextQuestion.id,
        parentTurnId: null,
        sequenceNo: nextSequenceNo,
        kind: TurnKind.MAIN,
        followUpIndex: 0,
        text: nextQuestion.text,
        status: TurnStatus.OPEN,
        presentedAt: now,
        closedAt: null,
        aiRunId: null,
      });
      const savedNextTurn = await turnRepo.save(nextTurn);

      session.currentTurnId = savedNextTurn.id;
      session.currentTurn = savedNextTurn;
      session.runtimeState = RuntimeState.AWAITING_ANSWER;
    } else {
      // Hết câu hỏi chính -> READY_TO_FINISH
      session.currentTurnId = null;
      session.currentTurn = null;
      session.runtimeState = RuntimeState.READY_TO_FINISH;
    }

    session.version += 1;
    const updatedSession = await sessionRepo.save(session);

    // 7. Audit log (chỉ lưu ID, trạng thái, KHÔNG ghi text câu trả lời nhạy cảm)
    await this.auditService.record(
      {
        actorId: null,
        actorType: 'candidate',
        action: 'answer.submitted',
        targetType: 'interview_turn',
        targetId: turn.id,
        metadata: {
          sessionId: session.id,
          interviewId: session.interviewId,
          sequenceNo: turn.sequenceNo,
          isSkipped,
          contentHash,
          runtimeState: session.runtimeState,
        },
      },
      manager,
    );

    return updatedSession;
  }
}
