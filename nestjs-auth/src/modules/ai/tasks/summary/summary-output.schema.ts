import { z } from 'zod';

export const SummaryStrengthSchema = z.object({
  statement: z
    .string()
    .min(10, 'Điểm mạnh phải có ít nhất 10 ký tự')
    .max(500, 'Điểm mạnh không được vượt quá 500 ký tự'),
  evidenceTurnIds: z
    .array(z.string().uuid('evidenceTurnId phải là UUID hợp lệ'))
    .min(1, 'Mỗi điểm mạnh phải có ít nhất 1 bằng chứng từ lượt phỏng vấn'),
});

export const SummaryGapSchema = z.object({
  statement: z
    .string()
    .min(10, 'Điểm hạn chế phải có ít nhất 10 ký tự')
    .max(500, 'Điểm hạn chế không được vượt quá 500 ký tự'),
  evidenceTurnIds: z
    .array(z.string().uuid('evidenceTurnId phải là UUID hợp lệ'))
    .min(1, 'Mỗi điểm hạn chế phải có ít nhất 1 bằng chứng từ lượt phỏng vấn'),
});

export const SummaryCriterionCoverageSchema = z.object({
  rootQuestionId: z.string().uuid('rootQuestionId phải là UUID hợp lệ'),
  evaluationCriterionId: z.string().uuid().nullable().optional(),
  status: z.enum(['covered', 'partially_covered', 'not_covered']),
  notes: z.string().min(5).max(500),
  evidenceTurnIds: z.array(
    z.string().uuid('evidenceTurnId phải là UUID hợp lệ'),
  ),
});

export const InterviewSummaryOutputSchema = z.object({
  summary: z
    .string()
    .min(50, 'Bản tóm tắt phải có ít nhất 50 ký tự')
    .max(3000, 'Bản tóm tắt không vượt quá 3000 ký tự'),
  strengths: z
    .array(SummaryStrengthSchema)
    .min(1, 'Phải có ít nhất 1 điểm nổi bật/điểm mạnh')
    .max(10, 'Tối đa 10 điểm mạnh'),
  gaps: z.array(SummaryGapSchema).max(10, 'Tối đa 10 điểm hạn chế'),
  coverage: z
    .array(SummaryCriterionCoverageSchema)
    .min(1, 'Phải có đánh giá độ bao phủ câu hỏi/tiêu chí'),
});
