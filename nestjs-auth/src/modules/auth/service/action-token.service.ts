import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActionToken, TokenType } from '../entities/action-token.entity';
import { User } from '../../users/entities/user.entity';
import { TokenUtil } from '../../../common/utils/token.util';

/**
 * Service đa năng quản lý các loại Action Token (Xác thực email, Đặt lại mật khẩu...).
 */
@Injectable()
export class ActionTokenService {
  constructor(
    @InjectRepository(ActionToken)
    private readonly tokenRepository: Repository<ActionToken>,
  ) {}

  /**
   * Sinh một token mới cho người dùng.
   * @param user Đối tượng người dùng
   * @param type Loại token (EMAIL_VERIFICATION, PASSWORD_RESET, v.v...)
   * @returns Chuỗi token gốc (chưa băm) để gửi qua email
   */
  async createToken(
    user: User,
    type: TokenType,
    ttlMs = 15 * 60 * 1000,
  ): Promise<string> {
    // Vô hiệu hóa các token cũ cùng loại của user này
    await this.invalidateUserTokens(user.id, type);

    const rawToken = TokenUtil.generateRawToken();
    const tokenHash = TokenUtil.hashToken(rawToken);

    const expiresAt = new Date(Date.now() + ttlMs);

    const actionToken = this.tokenRepository.create({
      tokenHash,
      type,
      user,
      expiresAt,
      usedAt: null,
    });

    await this.tokenRepository.save(actionToken);

    return rawToken;
  }

  /**
   * Kiểm tra tính hợp lệ của token.
   * @param rawToken Chuỗi token nhận được từ URL
   * @param type Loại token kỳ vọng
   * @returns Trả về entity ActionToken (bao gồm user)
   */
  async verifyToken(rawToken: string, type: TokenType): Promise<ActionToken> {
    const tokenHash = TokenUtil.hashToken(rawToken);

    const actionToken = await this.tokenRepository.findOne({
      where: { tokenHash, type },
      relations: { user: true },
    });

    if (!actionToken) {
      throw new BadRequestException(
        'Mã xác nhận không hợp lệ hoặc không tồn tại',
      );
    }

    if (actionToken.usedAt) {
      throw new BadRequestException('Mã xác nhận này đã được sử dụng');
    }

    if (actionToken.expiresAt <= new Date()) {
      throw new BadRequestException('Mã xác nhận đã hết hạn');
    }

    return actionToken;
  }

  /**
   * Đánh dấu token đã được sử dụng.
   */
  async markAsUsed(token: ActionToken): Promise<void> {
    token.usedAt = new Date();
    await this.tokenRepository.save(token);
  }

  /**
   * Vô hiệu hóa các token cũ của một user.
   */
  async invalidateUserTokens(userId: string, type: TokenType): Promise<void> {
    await this.tokenRepository
      .createQueryBuilder()
      .update()
      .set({ usedAt: new Date() })
      .where('user_id = :userId', { userId })
      .andWhere('type = :type', { type })
      .andWhere('"usedAt" IS NULL')
      .execute();
  }
}
