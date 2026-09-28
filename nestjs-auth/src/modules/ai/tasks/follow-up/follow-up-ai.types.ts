import { InterviewLanguage } from '../../../interviews/enums/interview-language.enum';

export type FollowUpAction = 'ask' | 'continue';

export interface FollowUpBranchTurn {
  id: string;
  kind: 'main' | 'follow_up';
  sequenceNo: number;
  text: string;
  answerText: string | null;
  isSkipped: boolean;
}

export interface FollowUpTaskInput {
  rootQuestionText: string;
  competency: string | null;
  evaluationCriterionDescription: string | null;
  branchTurns: FollowUpBranchTurn[];
  currentAnswerText: string;
  remainingRootBudget: number;
  remainingSessionBudget: number;
  language: InterviewLanguage;
}

export interface FollowUpOutput {
  action: FollowUpAction;
  question: string | null;
  reason: string | null;
}
