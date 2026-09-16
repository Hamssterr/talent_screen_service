import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { LoginAttempt } from '../entities/login-attempt.entity';

@Injectable()
export class LoginAttemptService {
  private readonly logger = new Logger(LoginAttemptService.name);
  private static readonly MAX_FAILED_ATTEMPTS = 5;
  private static readonly LOCKOUT_MINUTES = 10;

  constructor(
    @InjectRepository(LoginAttempt)
    private readonly attemptRepository: Repository<LoginAttempt>,
  ) {}

  private hashIdentifier(identifier: string): string {
    return createHash('sha256')
      .update(identifier.trim().toLowerCase())
      .digest('hex');
  }

  /**
   * Kiểm tra xem identifier (email) có đang bị tạm khóa không
   */
  async isLocked(identifier: string): Promise<boolean> {
    const hash = this.hashIdentifier(identifier);
    const record = await this.attemptRepository.findOne({
      where: { identifierHash: hash },
    });

    if (!record || !record.lockedUntil) {
      return false;
    }

    const now = new Date();
    return record.lockedUntil > now;
  }

  /**
   * Tăng số lần đăng nhập sai, nếu vượt quá 5 lần thì khóa 10 phút
   */
  async recordFailure(identifier: string): Promise<void> {
    const hash = this.hashIdentifier(identifier);
    const now = new Date();

    let record = await this.attemptRepository.findOne({
      where: { identifierHash: hash },
    });

    if (!record) {
      record = this.attemptRepository.create({
        identifierHash: hash,
        failedCount: 1,
        lastAttemptAt: now,
        lockedUntil: null,
      });
    } else {
      // Nếu hết thời gian lock cũ thì reset về 1
      if (record.lockedUntil && record.lockedUntil <= now) {
        record.failedCount = 1;
        record.lockedUntil = null;
      } else {
        record.failedCount += 1;
      }
      record.lastAttemptAt = now;

      if (record.failedCount >= LoginAttemptService.MAX_FAILED_ATTEMPTS) {
        record.lockedUntil = new Date(
          now.getTime() + LoginAttemptService.LOCKOUT_MINUTES * 60 * 1000,
        );
      }
    }

    await this.attemptRepository.save(record);
  }

  /**
   * Xóa hoặc reset số lần thất bại khi đăng nhập thành công
   */
  async clearAttempts(identifier: string): Promise<void> {
    const hash = this.hashIdentifier(identifier);
    await this.attemptRepository.delete({ identifierHash: hash });
  }
}
