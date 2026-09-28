export enum PdfExtractionErrorCode {
  ENCRYPTED = 'ENCRYPTED',
  PAGE_LIMIT_EXCEEDED = 'PAGE_LIMIT_EXCEEDED',
  NO_MEANINGFUL_TEXT = 'NO_MEANINGFUL_TEXT',
  CORRUPTED = 'CORRUPTED',
  STREAM_LIMIT_EXCEEDED = 'STREAM_LIMIT_EXCEEDED',
  TIMEOUT = 'TIMEOUT',
  UNKNOWN = 'UNKNOWN',
}

export class PdfExtractionError extends Error {
  readonly code: PdfExtractionErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: PdfExtractionErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'PdfExtractionError';
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, PdfExtractionError.prototype);
  }
}
