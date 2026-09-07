import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { IdempotencyKey } from './entities/idempotency-key.entity';
import { ErrorCodes } from '../../common/errors/error-codes';
import { CLOCK_TOKEN, type Clock } from '../time/clock.interface';

export interface IdempotencyExecutionParams<T> {
  actorScope: string;
  route: string;
  key?: string;
  method: string;
  body: unknown;
  ttlSeconds?: number;
  action: () => Promise<{ status: number; body: T }>;
}

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(
    @InjectRepository(IdempotencyKey)
    private readonly idempotencyRepository: Repository<IdempotencyKey>,
    @Optional()
    @Inject(CLOCK_TOKEN)
    private readonly clock?: Clock,
  ) {}

  private now(): Date {
    return this.clock ? this.clock.now() : new Date();
  }

  computeHash(method: string, canonicalRoute: string, body: unknown): string {
    let serializedBody = '';
    if (typeof body === 'object' && body !== null) {
      serializedBody = JSON.stringify(body, Object.keys(body).sort());
    } else if (typeof body === 'string') {
      serializedBody = body;
    } else if (typeof body === 'number' || typeof body === 'boolean') {
      serializedBody = String(body);
    }
    const raw = `${method.toUpperCase()}:${canonicalRoute}:${serializedBody}`;
    return createHash('sha256').update(raw).digest('hex');
  }

  async execute<T>(
    params: IdempotencyExecutionParams<T>,
  ): Promise<{ status: number; body: T }> {
    const {
      actorScope,
      route,
      key,
      method,
      body,
      ttlSeconds = 86400, // default 24h
      action,
    } = params;

    // Nếu không có Idempotency-Key, thực thi trực tiếp bình thường
    if (!key) {
      return action();
    }

    const requestHash = this.computeHash(method, route, body);
    const now = this.now();

    // 1. Kiểm tra bản ghi đã tồn tại
    const existing = await this.idempotencyRepository.findOne({
      where: { actorScope, route, key },
    });

    if (existing) {
      const isExpired = existing.expiresAt <= now;

      if (!isExpired) {
        // Cùng key nhưng hash khác nhau -> Xung đột
        if (existing.requestHash !== requestHash) {
          throw new ConflictException({
            code: ErrorCodes.IDEMPOTENCY_KEY_REUSED,
            message:
              'Idempotency-Key đã được sử dụng cho một request khác với payload khác',
          });
        }

        // Request đang được xử lý dở dang
        if (existing.state === 'processing') {
          throw new ConflictException({
            code: ErrorCodes.REQUEST_IN_PROGRESS,
            message:
              'Một thao tác với Idempotency-Key này đang được xử lý, vui lòng chờ',
          });
        }

        // Request đã hoàn tất thành công -> trả lại kết quả lưu trước đó
        if (existing.state === 'completed') {
          return {
            status: existing.responseStatus ?? 200,
            body: existing.responseBody as T,
          };
        }
      } else {
        // Nếu đã hết hạn, xóa bản ghi cũ để xử lý lại
        await this.idempotencyRepository.delete(existing.id);
      }
    }

    // 2. Tạo bản ghi trạng thái processing
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
    const idempotencyRecord = this.idempotencyRepository.create({
      actorScope,
      route,
      key,
      requestHash,
      state: 'processing',
      expiresAt,
    });

    try {
      await this.idempotencyRepository.save(idempotencyRecord);
    } catch (err: unknown) {
      // Bắt trường hợp race condition khi 2 request cùng insert đồng thời
      const error = err as { code?: string };
      if (error.code === '23505') {
        // Postgres unique violation
        throw new ConflictException({
          code: ErrorCodes.REQUEST_IN_PROGRESS,
          message:
            'Một thao tác với Idempotency-Key này đang được xử lý, vui lòng chờ',
        });
      }
      throw err;
    }

    // 3. Thực thi nghiệp vụ
    try {
      const result = await action();

      // Cập nhật kết quả khi hoàn thành
      idempotencyRecord.state = 'completed';
      idempotencyRecord.responseStatus = result.status;
      idempotencyRecord.responseBody = result.body as Record<string, unknown>;
      await this.idempotencyRepository.save(idempotencyRecord);

      return result;
    } catch (err) {
      // Nếu nghiệp vụ ném lỗi, xóa bản ghi processing để client có thể retry lại sau
      await this.idempotencyRepository
        .delete(idempotencyRecord.id)
        .catch((deleteErr: unknown) => {
          this.logger.error(
            'Failed to clean up idempotency key on failure',
            deleteErr,
          );
        });
      throw err;
    }
  }
}
