import {
  InterviewSummaryOutput,
  SummaryEvaluationCriterion,
  SummaryTranscriptTurn,
} from './summary-ai.types';

export interface SummaryValidationResult {
  isValid: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export function validateSummaryOutput(
  output: InterviewSummaryOutput,
  validTurns: SummaryTranscriptTurn[],
  validCriteria: SummaryEvaluationCriterion[],
): SummaryValidationResult {
  const turnMap = new Map<string, SummaryTranscriptTurn>();
  const validRootQuestionIds = new Set<string>();

  for (const t of validTurns) {
    turnMap.set(t.turnId, t);
    validRootQuestionIds.add(t.rootQuestionId);
  }

  const validCriterionIds = new Set<string>(validCriteria.map((c) => c.id));

  // 1. Kiểm tra evidenceTurnIds trong strengths
  for (const strength of output.strengths) {
    if (!strength.evidenceTurnIds || strength.evidenceTurnIds.length === 0) {
      return {
        isValid: false,
        errorCode: 'AI_INVALID_OUTPUT',
        errorMessage: `Điểm mạnh "${strength.statement}" không có bằng chứng lượt phỏng vấn.`,
      };
    }

    for (const turnId of strength.evidenceTurnIds) {
      const turn = turnMap.get(turnId);
      if (!turn) {
        return {
          isValid: false,
          errorCode: 'AI_INVALID_OUTPUT',
          errorMessage: `Bằng chứng turnId "${turnId}" không tồn tại trong transcript buổi phỏng vấn.`,
        };
      }
      if (turn.isSkipped) {
        return {
          isValid: false,
          errorCode: 'AI_INVALID_OUTPUT',
          errorMessage: `Không được dùng lượt bị bỏ qua (turnId "${turnId}") làm bằng chứng cho điểm mạnh.`,
        };
      }
    }
  }

  // 2. Kiểm tra evidenceTurnIds trong gaps
  for (const gap of output.gaps) {
    if (!gap.evidenceTurnIds || gap.evidenceTurnIds.length === 0) {
      return {
        isValid: false,
        errorCode: 'AI_INVALID_OUTPUT',
        errorMessage: `Điểm hạn chế "${gap.statement}" không có bằng chứng lượt phỏng vấn.`,
      };
    }

    for (const turnId of gap.evidenceTurnIds) {
      const turn = turnMap.get(turnId);
      if (!turn) {
        return {
          isValid: false,
          errorCode: 'AI_INVALID_OUTPUT',
          errorMessage: `Bằng chứng turnId "${turnId}" không tồn tại trong transcript buổi phỏng vấn.`,
        };
      }
    }
  }

  // 3. Kiểm tra coverage
  for (const cov of output.coverage) {
    if (!validRootQuestionIds.has(cov.rootQuestionId)) {
      return {
        isValid: false,
        errorCode: 'AI_INVALID_OUTPUT',
        errorMessage: `rootQuestionId "${cov.rootQuestionId}" trong coverage không thuộc danh sách câu hỏi buổi phỏng vấn.`,
      };
    }

    if (
      cov.evaluationCriterionId &&
      !validCriterionIds.has(cov.evaluationCriterionId)
    ) {
      return {
        isValid: false,
        errorCode: 'AI_INVALID_OUTPUT',
        errorMessage: `evaluationCriterionId "${cov.evaluationCriterionId}" trong coverage không thuộc danh sách tiêu chí hợp lệ.`,
      };
    }

    for (const turnId of cov.evidenceTurnIds) {
      if (!turnMap.has(turnId)) {
        return {
          isValid: false,
          errorCode: 'AI_INVALID_OUTPUT',
          errorMessage: `Bằng chứng turnId "${turnId}" trong coverage không tồn tại trong transcript.`,
        };
      }
    }
  }

  return { isValid: true };
}
