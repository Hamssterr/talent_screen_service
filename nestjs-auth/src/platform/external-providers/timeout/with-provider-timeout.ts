import { ProviderError } from '../errors/provider-error';
import { ProviderErrorCode } from '../errors/provider-error-code';

export async function withProviderTimeout<T>(
  providerName: string,
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`Operation timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  try {
    return await operation(controller.signal);
  } catch (error) {
    if (
      controller.signal.aborted ||
      (error instanceof Error &&
        (error.name === 'AbortError' || error.name === 'TimeoutError'))
    ) {
      throw new ProviderError({
        provider: providerName,
        code: ProviderErrorCode.TIMEOUT,
        message: `Yêu cầu tới ${providerName} bị timeout sau ${timeoutMs}ms`,
        cause: error,
      });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
