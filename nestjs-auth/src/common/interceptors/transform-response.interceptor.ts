import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { RESPONSE_MESSAGE_METADATA } from '../decorators/response-message.decorator';
import { SKIP_TRANSFORM_RESPONSE_METADATA } from '../decorators/skip-transform-response.decorator';
import { PaginationMeta } from '../dto/pagination.dto';

export interface StandardApiResponse<T> {
  message: string | null;
  data: T | null;
  meta?: PaginationMeta;
}

@Injectable()
export class TransformResponseInterceptor<T> implements NestInterceptor<
  T,
  StandardApiResponse<T> | T
> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<StandardApiResponse<T> | T> {
    const isSkipped = this.reflector.getAllAndOverride<boolean>(
      SKIP_TRANSFORM_RESPONSE_METADATA,
      [context.getHandler(), context.getClass()],
    );

    if (isSkipped) {
      return next.handle();
    }

    const decoratorMessage =
      this.reflector.getAllAndOverride<string>(RESPONSE_MESSAGE_METADATA, [
        context.getHandler(),
        context.getClass(),
      ]) ?? null;

    return next.handle().pipe(
      map((result: unknown): StandardApiResponse<T> => {
        // 1. Tránh double-wrapping nếu kết quả đã được format chuẩn { message, data }
        if (
          result &&
          typeof result === 'object' &&
          'data' in result &&
          'message' in result &&
          !('success' in result)
        ) {
          const resObj = result as {
            message: string | null;
            data: T;
            meta?: PaginationMeta;
          };
          return {
            message: decoratorMessage ?? resObj.message,
            data: resObj.data,
            ...(resObj.meta !== undefined ? { meta: resObj.meta } : {}),
          };
        }

        // 2. Trường hợp kết quả là null hoặc undefined
        if (result === null || result === undefined) {
          return {
            message: decoratorMessage,
            data: null,
          };
        }

        // 3. Trường hợp kết quả có phân trang { data: [...], meta: { ... } }
        if (
          typeof result === 'object' &&
          'data' in result &&
          'meta' in result &&
          Array.isArray((result as { data: unknown }).data)
        ) {
          const paginated = result as { data: unknown; meta: PaginationMeta };
          return {
            message: decoratorMessage,
            data: paginated.data as T,
            meta: paginated.meta,
          };
        }

        // 4. Trường hợp object trả về có chứa thuộc tính message bên trong
        if (
          typeof result === 'object' &&
          !Array.isArray(result) &&
          'message' in result &&
          typeof result.message === 'string'
        ) {
          const obj = result as Record<string, unknown>;
          const { message, ...rest } = obj;
          const finalMessage =
            decoratorMessage ?? (typeof message === 'string' ? message : null);
          const hasRemainingKeys = Object.keys(rest).length > 0;

          return {
            message: finalMessage,
            data: hasRemainingKeys ? (rest as T) : null,
          };
        }

        // 5. Mặc định: data là payload chính
        return {
          message: decoratorMessage,
          data: result as T,
        };
      }),
    );
  }
}
