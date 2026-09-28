import {
  GeneratedQuestionItem,
  QuestionEvidenceValidationResult,
  QuestionJobSnapshot,
} from './questions-ai.types';

/**
 * Kiểm tra tính hợp lệ và cấu trúc bằng chứng của danh sách câu hỏi AI sinh ra.
 * Đảm bảo:
 * 1. Số lượng câu hỏi nằm trong khoảng [1, 12] và khớp với expectedCount.
 * 2. Position bắt đầu từ 1 và liên tục.
 * 3. Text không trùng lặp (sau khi chuẩn hóa).
 * 4. maxFollowUps tuân thủ allowFollowUp (0 nếu allowFollowUp=false; tối đa 2).
 * 5. evaluationCriterionId nếu có phải thuộc danh sách tiêu chí trong Job snapshot.
 * 6. Không có câu hỏi chứa các từ khóa nhạy cảm / vi phạm protected attributes.
 */
export function validateGeneratedQuestions(
  questions: GeneratedQuestionItem[],
  expectedCount: number,
  jobSnapshot: QuestionJobSnapshot,
): QuestionEvidenceValidationResult {
  // 1. Kiểm tra số lượng
  if (!questions || questions.length === 0) {
    return {
      isValid: false,
      errorCode: 'QUESTION_INVALID_OUTPUT',
      errorMessage: 'AI không tạo ra câu hỏi nào.',
    };
  }

  if (questions.length !== expectedCount) {
    return {
      isValid: false,
      errorCode: 'QUESTION_INVALID_OUTPUT',
      errorMessage: `Số lượng câu hỏi AI tạo (${questions.length}) không khớp với yêu cầu (${expectedCount}).`,
    };
  }

  if (questions.length > 12) {
    return {
      isValid: false,
      errorCode: 'QUESTION_INVALID_OUTPUT',
      errorMessage: 'Số lượng câu hỏi vượt quá giới hạn tối đa 12 câu.',
    };
  }

  // 2. Kiểm tra position liên tục bắt đầu từ 1
  const positionsSeen = new Set<number>();
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const expectedPosition = i + 1;
    if (q.position !== expectedPosition) {
      return {
        isValid: false,
        errorCode: 'QUESTION_INVALID_OUTPUT',
        errorMessage: `Thứ tự vị trí câu hỏi không liên tục (câu ${i + 1} có position=${q.position}, mong đợi=${expectedPosition}).`,
      };
    }
    if (positionsSeen.has(q.position)) {
      return {
        isValid: false,
        errorCode: 'QUESTION_INVALID_OUTPUT',
        errorMessage: `Trùng lặp position: ${q.position}.`,
      };
    }
    positionsSeen.add(q.position);
  }

  // 3. Kiểm tra trùng lặp text
  const normalizedTexts = new Set<string>();
  for (const q of questions) {
    const norm = q.text.toLowerCase().replace(/\s+/g, ' ').trim();
    if (norm.length < 5 || norm.length > 2000) {
      return {
        isValid: false,
        errorCode: 'QUESTION_INVALID_OUTPUT',
        errorMessage: `Độ dài câu hỏi không hợp lệ (position ${q.position}).`,
      };
    }
    if (normalizedTexts.has(norm)) {
      return {
        isValid: false,
        errorCode: 'QUESTION_INVALID_OUTPUT',
        errorMessage: `Phát hiện câu hỏi bị trùng lặp nội dung: "${q.text.substring(0, 50)}...".`,
      };
    }
    normalizedTexts.add(norm);
  }

  // 4. Kiểm tra follow-up policy
  for (const q of questions) {
    if (!q.allowFollowUp && q.maxFollowUps !== 0) {
      return {
        isValid: false,
        errorCode: 'QUESTION_INVALID_OUTPUT',
        errorMessage: `Câu hỏi position ${q.position} có allowFollowUp=false nhưng maxFollowUps=${q.maxFollowUps} (phải là 0).`,
      };
    }
    if (q.maxFollowUps < 0 || q.maxFollowUps > 2) {
      return {
        isValid: false,
        errorCode: 'QUESTION_INVALID_OUTPUT',
        errorMessage: `Câu hỏi position ${q.position} có maxFollowUps không hợp lệ: ${q.maxFollowUps} (chỉ được 0..2).`,
      };
    }
  }

  // 5. Kiểm tra evaluationCriterionId thuộc Job snapshot
  const validCriterionIds = new Set(
    (jobSnapshot.evaluationCriteria || []).map((c) => c.id),
  );

  for (const q of questions) {
    if (q.evaluationCriterionId) {
      if (!validCriterionIds.has(q.evaluationCriterionId)) {
        return {
          isValid: false,
          errorCode: 'QUESTION_INVALID_EVIDENCE',
          errorMessage: `Câu hỏi position ${q.position} tham chiếu evaluationCriterionId "${q.evaluationCriterionId}" không tồn tại trong Job snapshot.`,
        };
      }
    }
  }

  // 6. Anti-discrimination / Sensitive check (Chặn các câu hỏi vi phạm thông tin cá nhân được bảo vệ)
  const forbiddenKeywords = [
    'tuổi tác',
    'bao nhiêu tuổi',
    'kết hôn',
    'gia đình',
    'con cái',
    'mang thai',
    'tôn giáo',
    'dân tộc',
    'giới tính',
    'khuyết tật',
    'bệnh tật',
    'sức khỏe',
    'marital status',
    'sexual orientation',
    'religion',
    'pregnancy',
  ];

  for (const q of questions) {
    const lower = q.text.toLowerCase();
    for (const kw of forbiddenKeywords) {
      if (lower.includes(kw)) {
        return {
          isValid: false,
          errorCode: 'QUESTION_INVALID_OUTPUT',
          errorMessage: `Câu hỏi position ${q.position} chứa nội dung nhạy cảm hoặc vi phạm quyền riêng tư ("${kw}").`,
        };
      }
    }
  }

  return { isValid: true };
}
