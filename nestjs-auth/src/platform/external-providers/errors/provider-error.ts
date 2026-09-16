import { ProviderErrorCode } from './provider-error-code';

export interface ProviderErrorOptions {
  provider: string;
  code: ProviderErrorCode;
  message: string;
  cause?: unknown;
  retryAfterMs?: number;
}

export class ProviderError extends Error {
  readonly provider: string;
  readonly code: ProviderErrorCode;
  readonly retryAfterMs?: number;

  constructor(options: ProviderErrorOptions) {
    super(`[${options.provider}] ${options.code}: ${options.message}`);
    this.name = 'ProviderError';
    this.provider = options.provider;
    this.code = options.code;
    this.retryAfterMs = options.retryAfterMs;
    if (options.cause) {
      this.cause = options.cause;
    }
    Object.setPrototypeOf(this, ProviderError.prototype);
  }

  static isTimeout(error: unknown): boolean {
    return (
      error instanceof ProviderError && error.code === ProviderErrorCode.TIMEOUT
    );
  }
}
