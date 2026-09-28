import { FollowUpOutput } from './follow-up-ai.types';

export interface FollowUpValidationResult {
  isValid: boolean;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Chuẩn hóa chuỗi văn bản để so sánh tương đồng (loại bỏ dấu câu, chuyển chữ thường, gộp khoảng trắng).
 */
export function normalizeQuestionText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,?!:;'"()[\]{}_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tính toán độ tương đồng từ vựng đơn giản (Jaccard similarity trên tập từ).
 * Không cần vector database hay external embeddings.
 */
export function computeJaccardSimilarity(textA: string, textB: string): number {
  const wordsA = new Set(
    normalizeQuestionText(textA)
      .split(' ')
      .filter((w) => w.length > 2),
  );
  const wordsB = new Set(
    normalizeQuestionText(textB)
      .split(' ')
      .filter((w) => w.length > 2),
  );

  if (wordsA.size === 0 || wordsB.size === 0) {
    return 0;
  }

  let intersectionCount = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) {
      intersectionCount++;
    }
  }

  const unionCount = new Set([...wordsA, ...wordsB]).size;
  return unionCount === 0 ? 0 : intersectionCount / unionCount;
}

/**
 * Xác thực câu hỏi follow-up từ AI:
 * 1. Action hợp lệ.
 * 2. Nếu action = ask, question không rỗng, độ dài 5..1000.
 * 3. Chống trùng lặp hoặc quá tương đồng với root question hoặc các turn trước trong branch (ngưỡng tương đồng Jaccard >= 0.7).
 * 4. Chống từ khóa nhạy cảm / protected attributes.
 */
export function validateFollowUpProposal(
  output: FollowUpOutput,
  rootQuestionText: string,
  existingBranchQuestions: string[],
): FollowUpValidationResult {
  if (output.action === 'continue') {
    return { isValid: true };
  }

  if (output.action !== 'ask') {
    return {
      isValid: false,
      errorCode: 'FOLLOW_UP_INVALID_OUTPUT',
      errorMessage: 'Hành động follow-up không hợp lệ.',
    };
  }

  if (!output.question || output.question.trim().length < 5) {
    return {
      isValid: false,
      errorCode: 'FOLLOW_UP_INVALID_OUTPUT',
      errorMessage: 'Câu hỏi follow-up quá ngắn hoặc để trống.',
    };
  }

  if (output.question.length > 1000) {
    return {
      isValid: false,
      errorCode: 'FOLLOW_UP_INVALID_OUTPUT',
      errorMessage: 'Câu hỏi follow-up vượt quá giới hạn 1000 ký tự.',
    };
  }

  // So sánh tương đồng với câu hỏi chính (root)
  const normProposed = normalizeQuestionText(output.question);
  const normRoot = normalizeQuestionText(rootQuestionText);

  if (
    normProposed === normRoot ||
    computeJaccardSimilarity(output.question, rootQuestionText) >= 0.7
  ) {
    return {
      isValid: false,
      errorCode: 'FOLLOW_UP_DUPLICATE',
      errorMessage: 'Câu hỏi follow-up bị trùng hoặc quá giống câu hỏi chính.',
    };
  }

  // So sánh với các câu hỏi trước trong nhánh
  for (const existing of existingBranchQuestions) {
    const normExisting = normalizeQuestionText(existing);
    if (
      normProposed === normExisting ||
      computeJaccardSimilarity(output.question, existing) >= 0.7
    ) {
      return {
        isValid: false,
        errorCode: 'FOLLOW_UP_DUPLICATE',
        errorMessage:
          'Câu hỏi follow-up bị trùng hoặc quá giống câu hỏi đã hỏi trước đó trong nhánh.',
      };
    }
  }

  // Chặn thông tin nhạy cảm
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

  const lower = output.question.toLowerCase();
  for (const kw of forbiddenKeywords) {
    if (lower.includes(kw)) {
      return {
        isValid: false,
        errorCode: 'FOLLOW_UP_INVALID_OUTPUT',
        errorMessage: `Câu hỏi follow-up vi phạm quyền riêng tư hoặc thông tin được bảo vệ ("${kw}").`,
      };
    }
  }

  return { isValid: true };
}
