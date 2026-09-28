export interface SummaryTranscriptTurn {
  turnId: string;
  rootQuestionId: string;
  rootQuestionText: string;
  competency?: string | null;
  evaluationCriterionId?: string | null;
  kind: 'main' | 'follow_up';
  sequenceNo: number;
  questionText: string;
  answerText: string | null;
  isSkipped: boolean;
}

export interface SummaryEvaluationCriterion {
  id: string;
  name: string;
  description?: string | null;
}

export interface SummarizeInterviewInput {
  jobTitle: string;
  jobDescription?: string | null;
  candidateName?: string | null;
  candidateProfileSummary?: string | null;
  criteria: SummaryEvaluationCriterion[];
  turns: SummaryTranscriptTurn[];
  language?: string;
}

export interface SummaryStrength {
  statement: string;
  evidenceTurnIds: string[];
}

export interface SummaryGap {
  statement: string;
  evidenceTurnIds: string[];
}

export interface SummaryCriterionCoverage {
  rootQuestionId: string;
  evaluationCriterionId?: string | null;
  status: 'covered' | 'partially_covered' | 'not_covered';
  notes: string;
  evidenceTurnIds: string[];
}

export interface InterviewSummaryOutput {
  summary: string;
  strengths: SummaryStrength[];
  gaps: SummaryGap[];
  coverage: SummaryCriterionCoverage[];
}
