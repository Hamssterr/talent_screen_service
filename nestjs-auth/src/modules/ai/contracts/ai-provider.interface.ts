import {
  StructuredGenerationRequest,
  StructuredGenerationResult,
} from './structured-generation.types';

export interface AiProvider {
  generateStructured<T>(
    request: StructuredGenerationRequest<T>,
  ): Promise<StructuredGenerationResult<T>>;
}
