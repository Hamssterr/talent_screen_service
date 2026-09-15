import { SessionStatus } from '../enums/session-status.enum';
import { RuntimeState } from '../enums/runtime-state.enum';
import { TurnKind } from '../enums/turn-kind.enum';
import { TurnStatus } from '../enums/turn-status.enum';

export interface TurnSummaryDto {
  id: string;
  kind: TurnKind;
  sequenceNo: number;
  text: string;
  status: TurnStatus;
  isSkipped: boolean;
  submittedAt: Date | null;
}

export interface CurrentTurnDto {
  id: string;
  kind: TurnKind;
  sequenceNo: number;
  text: string;
}

export interface SessionProgressDto {
  mainCompleted: number;
  mainAnswered: number;
  mainSkipped: number;
  mainTotal: number;
}

export interface CandidateSessionResponseDto {
  id: string;
  interviewId: string;
  status: SessionStatus;
  runtimeState: RuntimeState;
  serverNow: Date;
  startedAt: Date;
  deadlineAt: Date;
  canFinish: boolean;
  progress: SessionProgressDto;
  currentTurn: CurrentTurnDto | null;
  submittedTurns: TurnSummaryDto[];
  pollAfterMs?: number;
}
