import { z } from 'zod';
import { QuestionDifficulty } from '../../../question-sets/enums/question-difficulty.enum';

export const QuestionEvidenceRefSchema = z.object({
  type: z
    .string()
    .describe(
      'Type of evidence, e.g. skill, experience, project, education, criterion',
    ),
  key: z
    .string()
    .describe(
      'The name or identifier of the skill/project/criterion being referenced',
    ),
  summary: z
    .string()
    .optional()
    .describe('Brief context of why this evidence matters'),
});

export const GeneratedQuestionItemSchema = z.object({
  position: z
    .number()
    .int()
    .min(1)
    .max(12)
    .describe('Continuous 1-based index'),
  text: z
    .string()
    .min(5)
    .max(2000)
    .describe(
      'Job interview question text specifically evaluating qualifications',
    ),
  competency: z
    .string()
    .max(150)
    .nullable()
    .describe(
      'Core competency being evaluated (e.g. Backend Architecture, Problem Solving)',
    ),
  evaluationCriterionId: z
    .string()
    .max(100)
    .nullable()
    .describe(
      'Exact matching id from evaluationCriteria provided in the job snapshot, or null',
    ),
  difficulty: z
    .nativeEnum(QuestionDifficulty)
    .describe('Difficulty level: basic, intermediate, advanced'),
  allowFollowUp: z
    .boolean()
    .describe('Whether this question allows a follow-up probing question'),
  maxFollowUps: z
    .number()
    .int()
    .min(0)
    .max(2)
    .describe(
      'Maximum number of follow-ups allowed (0, 1, or 2). Must be 0 if allowFollowUp is false',
    ),
  evidenceRefs: z
    .array(QuestionEvidenceRefSchema)
    .default([])
    .describe(
      'List of references to candidate profile details or job requirements',
    ),
  reviewNotes: z
    .string()
    .nullable()
    .default(null)
    .describe('Optional guidance for the human HR reviewer'),
});

export const QuestionsOutputSchema = z.object({
  questions: z
    .array(GeneratedQuestionItemSchema)
    .min(1)
    .max(12)
    .describe('Array of tailored interview questions'),
});

export type QuestionsOutputDto = z.infer<typeof QuestionsOutputSchema>;
