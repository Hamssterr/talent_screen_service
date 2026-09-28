import { z } from 'zod';

export const FollowUpOutputSchema = z
  .object({
    action: z
      .enum(['ask', 'continue'])
      .describe(
        '"ask" to probe deeper into the candidate\'s answer, or "continue" to proceed to the next main question',
      ),
    question: z
      .string()
      .min(5)
      .max(1000)
      .nullable()
      .describe(
        'The targeted follow-up question. MUST be provided when action is "ask", and MUST be null when action is "continue"',
      ),
    reason: z
      .string()
      .max(500)
      .nullable()
      .default(null)
      .describe(
        'Internal concise reasoning for asking or continuing (for HR audit only)',
      ),
  })
  .refine(
    (val) => {
      if (val.action === 'ask') {
        return (
          typeof val.question === 'string' && val.question.trim().length >= 5
        );
      }
      if (val.action === 'continue') {
        return val.question === null || val.question === undefined;
      }
      return false;
    },
    {
      message:
        'When action is "ask", question is required; when action is "continue", question must be null.',
      path: ['question'],
    },
  );

export type FollowUpOutputDto = z.infer<typeof FollowUpOutputSchema>;
