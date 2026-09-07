import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';

import { RefreshToken } from '../entities/refresh-token.entity';
import { User, UserStatus } from '../../users/entities/user.entity';
import { TokenUtil } from '../../../common/utils/token.util';

/**
 * Service quản lý vòng đời của Refresh Token.
 * Cho phép tạo mới, xoay vòng (rotate) an toàn nguyên tử và thu hồi (revoke) token.
 */
@Injectable()
export class RefreshTokenService {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Tạo một Refresh Token mới cho người dùng.
   * Cấp kèm một familyId để theo dõi chuỗi token (dùng cho Token Rotation).
   */
  async create(user: { id: string }, expiresAt: Date, familyId?: string) {
    const rawToken = TokenUtil.generateRawToken();
    const tokenHash = TokenUtil.hashToken(rawToken);
    const currentFamilyId = familyId ?? randomUUID();

    const refreshToken = this.refreshTokenRepository.create({
      userId: user.id,
      tokenHash,
      familyId: currentFamilyId,
      expiresAt,
      revokedAt: null,
    });

    await this.refreshTokenRepository.save(refreshToken);

    return {
      rawToken,
      refreshToken,
      familyId: currentFamilyId,
    };
  }

  /**
   * Xoay vòng (Rotate) Refresh Token bằng database transaction và row lock (pessimistic_write).
   * Chống hoàn toàn race condition khi có 2 request đồng thời.
   * Nếu phát hiện token cũ bị dùng lại (reuse), thu hồi toàn bộ token trong Family đó.
   */
  async rotate(
    rawRefreshToken: string,
  ): Promise<{ newRawToken: string; user: User }> {
    const tokenHash = TokenUtil.hashToken(rawRefreshToken);

    return this.dataSource.transaction(async (manager) => {
      const token = await manager.getRepository(RefreshToken).findOne({
        where: { tokenHash },
        lock: { mode: 'pessimistic_write' },
      });

      if (!token) {
        throw new UnauthorizedException('Refresh token không hợp lệ');
      }

      if (token.revokedAt) {
        await manager
          .getRepository(RefreshToken)
          .createQueryBuilder()
          .update(RefreshToken)
          .set({ revokedAt: new Date() })
          .where('"familyId" = :familyId', { familyId: token.familyId })
          .andWhere('"userId" = :userId', { userId: token.userId })
          .andWhere('"revokedAt" IS NULL')
          .execute();

        throw new UnauthorizedException(
          'Cảnh báo bảo mật: Phát hiện sử dụng lại Refresh token cũ',
        );
      }

      if (token.expiresAt < new Date()) {
        throw new UnauthorizedException('Refresh token đã hết hạn');
      }

      const user = await manager.getRepository(User).findOne({
        where: { id: token.userId },
      });

      if (!user || user.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException(
          'Tài khoản chưa được kích hoạt hoặc đã bị khóa',
        );
      }

      token.revokedAt = new Date();
      await manager.getRepository(RefreshToken).save(token);

      const newRawToken = TokenUtil.generateRawToken();
      const newTokenHash = TokenUtil.hashToken(newRawToken);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const newToken = manager.getRepository(RefreshToken).create({
        userId: user.id,
        tokenHash: newTokenHash,
        familyId: token.familyId,
        expiresAt,
        revokedAt: null,
      });

      await manager.getRepository(RefreshToken).save(newToken);

      return { newRawToken, user };
    });
  }

  /**
   * Thu hồi một Refresh Token qua raw token.
   */
  async revokeToken(rawToken: string): Promise<void> {
    const tokenHash = TokenUtil.hashToken(rawToken);
    await this.refreshTokenRepository
      .createQueryBuilder()
      .update(RefreshToken)
      .set({ revokedAt: new Date() })
      .where('tokenHash = :tokenHash', { tokenHash })
      .andWhere('"revokedAt" IS NULL')
      .execute();
  }

  /**
   * Thu hồi tất cả Refresh Token của một user trên mọi thiết bị.
   * Ứng dụng khi đổi mật khẩu hoặc đăng xuất tất cả.
   */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.refreshTokenRepository
      .createQueryBuilder()
      .update(RefreshToken)
      .set({ revokedAt: new Date() })
      .where('"userId" = :userId', { userId })
      .andWhere('"revokedAt" IS NULL')
      .execute();
  }
}
