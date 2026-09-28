import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { AiProvider } from '../contracts/ai-provider.interface';
import {
  StructuredGenerationRequest,
  StructuredGenerationResult,
} from '../contracts/structured-generation.types';
import { ProviderError } from '../../../platform/external-providers/errors/provider-error';
import { ProviderErrorCode } from '../../../platform/external-providers/errors/provider-error-code';
import { withProviderTimeout } from '../../../platform/external-providers/timeout/with-provider-timeout';
import { GeminiErrorMapper } from '../errors/gemini-error.mapper';

@Injectable()
export class GeminiAiProvider implements AiProvider {
  private readonly logger = new Logger(GeminiAiProvider.name);
  private client: GoogleGenAI | null = null;
  private readonly configuredApiKey: string;
  private readonly configuredModel: string;

  constructor(private readonly configService: ConfigService) {
    this.configuredApiKey = this.configService.get<string>(
      'ai.geminiApiKey',
      '',
    );
    this.configuredModel =
      this.configService.get<string>('ai.geminiModel')?.trim() ||
      'gemini-3.5-flash-lite';
  }

  /**
   * Khởi tạo client lười (lazy initialization) khi có request thực tế.
   * Không gọi hoặc khởi tạo trong quá trình application bootstrap.
   */
  private getClient(): GoogleGenAI {
    if (!this.configuredApiKey || !this.configuredModel) {
      throw new ProviderError({
        provider: 'gemini',
        code: ProviderErrorCode.UNAUTHORIZED,
        message:
          'Gemini AI is not configured. Both GEMINI_API_KEY and GEMINI_MODEL must be provided.',
      });
    }

    if (!this.client) {
      this.client = new GoogleGenAI({ apiKey: this.configuredApiKey });
    }
    return this.client;
  }

  /**
   * Chuẩn hóa OpenAPI Schema tương thích với tập con (subset) mà Google Gemini API hỗ trợ.
   * Loại bỏ các thuộc tính không được Gemini hỗ trợ trong responseSchema như:
   * $schema, maxLength, minLength, maxItems, minItems, minimum, maximum, additionalProperties.
   * Lưu ý: Việc validate các ràng buộc này vẫn được Zod thực thi an toàn ở backend sau khi nhận kết quả.
   */
  private cleanOpenApiSchemaForGemini(schema: unknown): unknown {
    if (typeof schema !== 'object' || schema === null) return schema;
    if (Array.isArray(schema)) {
      return schema.map((item) => this.cleanOpenApiSchemaForGemini(item));
    }
    const UNSUPPORTED_KEYS = new Set([
      '$schema',
      'maxLength',
      'minLength',
      'maxItems',
      'minItems',
      'minimum',
      'maximum',
      'additionalProperties',
    ]);

    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
      if (!UNSUPPORTED_KEYS.has(k)) {
        result[k] = this.cleanOpenApiSchemaForGemini(v);
      }
    }
    return result;
  }

  /**
   * Gọi Gemini API để sinh dữ liệu có cấu trúc (Structured Output).
   * - Chuyển Zod schema sang OpenAPI 3.0 / JSON schema.
   * - Bọc với withProviderTimeout và AbortSignal.
   * - Parse JSON và validate lại bằng Zod.
   * - Đo latency và trích xuất token usage.
   * - Tuyệt đối KHÔNG log raw prompt, response hoặc PII.
   */
  async generateStructured<T>(
    request: StructuredGenerationRequest<T>,
  ): Promise<StructuredGenerationResult<T>> {
    const client = this.getClient();
    const model = this.configuredModel;
    const startTime = Date.now();

    // 1. Chuyển đổi Zod schema sang OpenApi 3.0 / JSON Schema phù hợp với Gemini responseSchema
    const rawJsonSchema = zodToJsonSchema(request.schema, {
      target: 'openApi3',
      $refStrategy: 'none',
    });
    const jsonSchema = this.cleanOpenApiSchemaForGemini(
      rawJsonSchema,
    ) as Record<string, unknown>;

    try {
      // 2. Gọi generateContent với timeout qua withProviderTimeout và AbortSignal
      const response = await withProviderTimeout(
        'gemini',
        request.timeoutMs,
        async (signal) => {
          return client.models.generateContent({
            model,
            contents: request.prompt,
            config: {
              systemInstruction: request.systemInstruction,
              responseMimeType: 'application/json',
              responseSchema: jsonSchema,
              temperature: request.temperature ?? 0.2,
              abortSignal: signal,
            },
          });
        },
      );

      const latencyMs = Date.now() - startTime;

      // 3. Kiểm tra response text
      const rawText = response.text;
      if (!rawText || !rawText.trim()) {
        throw new ProviderError({
          provider: 'gemini',
          code: ProviderErrorCode.INVALID_REQUEST,
          message: 'Gemini returned empty or blank text response',
        });
      }

      // 4. Parse JSON an toàn
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(rawText.trim());
      } catch (parseError) {
        throw new ProviderError({
          provider: 'gemini',
          code: ProviderErrorCode.INVALID_REQUEST,
          message: 'Failed to parse Gemini response as valid JSON',
          cause: parseError,
        });
      }

      // 5. Validate lại bằng Zod schema
      const parseResult = request.schema.safeParse(parsedJson);
      if (!parseResult.success) {
        throw new ProviderError({
          provider: 'gemini',
          code: ProviderErrorCode.INVALID_REQUEST,
          message: `Gemini response failed Zod schema validation: ${parseResult.error.message}`,
          cause: parseResult.error,
        });
      }

      // 6. Đọc usage metadata
      const inputTokens = response.usageMetadata?.promptTokenCount;
      const outputTokens = response.usageMetadata?.candidatesTokenCount;

      this.logger.log(
        `[GeminiAiProvider] Successfully generated structured output. Model: ${model}, Latency: ${latencyMs}ms, Tokens: in=${inputTokens ?? 0}, out=${outputTokens ?? 0}`,
      );

      return {
        data: parseResult.data,
        provider: 'gemini',
        model,
        latencyMs,
        inputTokens,
        outputTokens,
      };
    } catch (error) {
      const mappedError = GeminiErrorMapper.map(error, request.timeoutMs);
      this.logger.error(
        `[GeminiAiProvider] Execution failed: [${mappedError.code}] ${mappedError.message}`,
      );
      throw mappedError;
    }
  }
}
