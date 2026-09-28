import { ProviderError } from '../../../platform/external-providers/errors/provider-error';
import { ProviderErrorCode } from '../../../platform/external-providers/errors/provider-error-code';

export class GeminiErrorMapper {
  /**
   * Map các lỗi từ Google GenAI SDK hoặc quá trình parse JSON / Zod validation
   * thành ProviderError với taxonomy chuẩn hóa của platform.
   */
  static map(error: unknown, timeoutMs?: number): ProviderError {
    if (error instanceof ProviderError) {
      return error;
    }

    const errorMsg = error instanceof Error ? error.message : String(error);
    const errObj = error as Record<string, unknown> | undefined;

    // 1. Timeout / AbortSignal
    if (
      (error instanceof Error &&
        (error.name === 'AbortError' || error.name === 'TimeoutError')) ||
      errorMsg.toLowerCase().includes('timeout') ||
      errorMsg.toLowerCase().includes('aborted')
    ) {
      return new ProviderError({
        provider: 'gemini',
        code: ProviderErrorCode.TIMEOUT,
        message: timeoutMs
          ? `Gemini request timed out after ${timeoutMs}ms`
          : 'Gemini request timed out',
        cause: error,
      });
    }

    // 2. HTTP Status / API Error mapping
    const status = (errObj?.['status'] ||
      errObj?.['statusCode'] ||
      errObj?.['code']) as number | string | undefined;
    const statusNum =
      typeof status === 'number' ? status : parseInt(String(status), 10);

    if (
      statusNum === 429 ||
      errorMsg.toLowerCase().includes('resource_exhausted') ||
      errorMsg.toLowerCase().includes('quota') ||
      errorMsg.toLowerCase().includes('rate limit')
    ) {
      return new ProviderError({
        provider: 'gemini',
        code: ProviderErrorCode.RATE_LIMITED,
        message: 'Gemini rate limit or quota exceeded',
        cause: error,
      });
    }

    if (
      statusNum === 401 ||
      statusNum === 403 ||
      errorMsg.toLowerCase().includes('api_key') ||
      errorMsg.toLowerCase().includes('permission_denied') ||
      errorMsg.toLowerCase().includes('unauthorized')
    ) {
      return new ProviderError({
        provider: 'gemini',
        code: ProviderErrorCode.UNAUTHORIZED,
        message: 'Gemini authentication failed or API key invalid',
        cause: error,
      });
    }

    if (
      statusNum === 400 ||
      errorMsg.toLowerCase().includes('invalid_argument') ||
      errorMsg.toLowerCase().includes('bad request')
    ) {
      return new ProviderError({
        provider: 'gemini',
        code: ProviderErrorCode.INVALID_REQUEST,
        message: 'Gemini request invalid or malformed',
        cause: error,
      });
    }

    if (
      statusNum === 404 ||
      errorMsg.toLowerCase().includes('not_found') ||
      errorMsg.toLowerCase().includes('not found') ||
      errorMsg.toLowerCase().includes('no longer available')
    ) {
      return new ProviderError({
        provider: 'gemini',
        code: ProviderErrorCode.INVALID_REQUEST,
        message:
          'Configured Gemini model was not found or is no longer available. Please check GEMINI_MODEL in .env',
        cause: error,
      });
    }

    if (
      statusNum === 503 ||
      statusNum === 500 ||
      statusNum === 502 ||
      statusNum === 504 ||
      errorMsg.toLowerCase().includes('unavailable') ||
      errorMsg.toLowerCase().includes('internal')
    ) {
      return new ProviderError({
        provider: 'gemini',
        code: ProviderErrorCode.TEMPORARY,
        message: 'Gemini service temporarily unavailable',
        cause: error,
      });
    }

    // 3. Structured parsing errors
    if (
      errorMsg.includes('JSON') ||
      errorMsg.toLowerCase().includes('unexpected token')
    ) {
      return new ProviderError({
        provider: 'gemini',
        code: ProviderErrorCode.INVALID_REQUEST,
        message: 'Gemini response is not valid JSON',
        cause: error,
      });
    }

    if (
      errorMsg.includes('ZodError') ||
      errorMsg.includes('validation failed')
    ) {
      return new ProviderError({
        provider: 'gemini',
        code: ProviderErrorCode.INVALID_REQUEST,
        message: 'Gemini response failed schema validation',
        cause: error,
      });
    }

    // 4. Default fallback: Unknown
    return new ProviderError({
      provider: 'gemini',
      code: ProviderErrorCode.UNKNOWN,
      message: errorMsg || 'Unknown Gemini provider error',
      cause: error,
    });
  }
}
