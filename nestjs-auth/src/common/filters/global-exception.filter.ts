import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ErrorCodes, type ApiErrorResponse } from '../errors/error-codes';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const requestId =
      request.requestId ||
      (typeof request.headers['x-request-id'] === 'string'
        ? request.headers['x-request-id']
        : 'unknown-request-id');

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string = ErrorCodes.INTERNAL_SERVER_ERROR;
    let message = 'Đã có lỗi hệ thống xảy ra';
    let details: unknown = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, unknown>;

        if (typeof resObj['code'] === 'string') {
          code = resObj['code'];
        }

        if (typeof resObj['message'] === 'string') {
          message = resObj['message'];
        } else if (Array.isArray(resObj['message'])) {
          message = 'Dữ liệu không hợp lệ';
          details = resObj['message'];
        }

        if (resObj['details'] !== undefined) {
          details = resObj['details'];
        }
      }

      // Map default status codes to stable error codes if not explicitly set
      if (code === ErrorCodes.INTERNAL_SERVER_ERROR) {
        switch (status) {
          case HttpStatus.BAD_REQUEST:
            code = ErrorCodes.VALIDATION_FAILED;
            break;
          case HttpStatus.UNAUTHORIZED:
            code =
              message.toLowerCase().includes('mật khẩu') ||
              message.toLowerCase().includes('credential')
                ? ErrorCodes.INVALID_CREDENTIALS
                : ErrorCodes.AUTHENTICATION_REQUIRED;
            break;
          case HttpStatus.FORBIDDEN:
            code = ErrorCodes.MISSING_PERMISSION;
            break;
          case HttpStatus.NOT_FOUND:
            code = ErrorCodes.RESOURCE_NOT_FOUND;
            break;
          case HttpStatus.CONFLICT:
            code = ErrorCodes.RESOURCE_CONFLICT;
            break;
        }
      }
    } else {
      // Unknown internal server error - log stack trace with requestId
      const errorMsg =
        exception instanceof Error ? exception.message : String(exception);
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(
        `[RequestID: ${requestId}] Internal Error: ${errorMsg}`,
        stack,
      );
    }

    const errorResponse: ApiErrorResponse = {
      error: {
        code,
        message,
        requestId,
        ...(details !== undefined ? { details } : {}),
      },
    };

    response.setHeader('X-Request-Id', requestId);
    response.status(status).json(errorResponse);
  }
}
