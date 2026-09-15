import { Injectable } from '@nestjs/common';
import { InterviewSession } from '../entities/interview-session.entity';
import {
  CandidateSessionResponseDto,
  CurrentTurnDto,
} from '../dto/session-response.dto';
import { TurnStatus } from '../enums/turn-status.enum';
import { TurnKind } from '../enums/turn-kind.enum';
import { RuntimeState } from '../enums/runtime-state.enum';
import { SessionStatus } from '../enums/session-status.enum';

@Injectable()
export class RuntimeProjectionService {
  /**
   * Chuyển đổi session entity và thông tin liên quan thành DTO bảo mật cho Candidate.
   * TUYỆT ĐỐI KHÔNG leak:
   * - Câu hỏi tương lai
   * - Tiêu chí chấm điểm, rubric, evidenceRefs
   * - Nội dung nháp (không có draft)
   * - Prompt AI hoặc ghi chú của HR
   */
  project(
    session: InterviewSession,
    totalMainQuestions: number,
    serverNow: Date = new Date(),
  ): CandidateSessionResponseDto {
    const turns = session.turns || [];

    // 1. Phân loại các turns đã hoàn thành (answered hoặc skipped)
    const submittedTurns = turns
      .filter(
        (t) =>
          t.status === TurnStatus.ANSWERED || t.status === TurnStatus.SKIPPED,
      )
      .sort((a, b) => a.sequenceNo - b.sequenceNo)
      .map((t) => ({
        id: t.id,
        kind: t.kind,
        sequenceNo: t.sequenceNo,
        text: t.text,
        status: t.status,
        isSkipped: t.status === TurnStatus.SKIPPED,
        submittedAt: t.answer?.submittedAt || t.closedAt || null,
      }));

    // 2. Tính toán Progress
    const mainTurns = turns.filter((t) => t.kind === TurnKind.MAIN);
    const mainAnswered = mainTurns.filter(
      (t) => t.status === TurnStatus.ANSWERED,
    ).length;
    const mainSkipped = mainTurns.filter(
      (t) => t.status === TurnStatus.SKIPPED,
    ).length;
    const mainCompleted = mainAnswered + mainSkipped;

    // 3. Xác định currentTurn
    let currentTurnDto: CurrentTurnDto | null = null;
    if (
      session.status === SessionStatus.IN_PROGRESS &&
      session.runtimeState === RuntimeState.AWAITING_ANSWER &&
      session.currentTurn &&
      session.currentTurn.status === TurnStatus.OPEN
    ) {
      currentTurnDto = {
        id: session.currentTurn.id,
        kind: session.currentTurn.kind,
        sequenceNo: session.currentTurn.sequenceNo,
        text: session.currentTurn.text,
      };
    }

    // 4. canFinish = true khi ready_to_finish hoặc session đã xong hoặc candidate đang ở awaiting_answer
    const canFinish =
      session.status === SessionStatus.IN_PROGRESS &&
      (session.runtimeState === RuntimeState.READY_TO_FINISH ||
        session.runtimeState === RuntimeState.AWAITING_ANSWER);

    const response: CandidateSessionResponseDto = {
      id: session.id,
      interviewId: session.interviewId,
      status: session.status,
      runtimeState: session.runtimeState,
      serverNow,
      startedAt: session.startedAt,
      deadlineAt: session.deadlineAt,
      canFinish,
      progress: {
        mainCompleted,
        mainAnswered,
        mainSkipped,
        mainTotal: totalMainQuestions,
      },
      currentTurn: currentTurnDto,
      submittedTurns,
    };

    if (session.runtimeState === RuntimeState.ADVANCING) {
      response.pollAfterMs = 2000;
    }

    return response;
  }
}
