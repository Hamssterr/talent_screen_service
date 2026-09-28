import { ZodType } from 'zod';

export interface StructuredGenerationRequest<T> {
  systemInstruction: string;
  prompt: string;
  schema: ZodType<T, any, any>;
  timeoutMs: number;
  temperature?: number;
}

export interface StructuredGenerationResult<T> {
  data: T;
  provider: 'gemini';
  model: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
}
