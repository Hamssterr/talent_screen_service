import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { JwtService } from '@nestjs/jwt';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../../users/users.service';
import { User, UserStatus } from '../../users/entities/user.entity';
import { RefreshTokenService } from './refresh-token.service';
import { RedisService } from '../../redis/redis.service';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { ActivateAccountDto } from '../dto/activate-account.dto';
import { ActionToken, TokenType } from '../entities/action-token.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { TokenUtil } from '../../../common/utils/token.util';

/**
 * Service trung tâm xử lý các nghiệp vụ Authentication.
 * Đóng vai trò điều phối giữa các Service nhỏ hơn (User, Mail, Token).
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
    @InjectQueue('mail-queue') private readonly mailQueue: Queue,
    private readonly redisService: RedisService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Đăng nhập sau khi Passport LocalStrategy đã validate thành công.
   * Sinh ra cặp Access Token và Refresh Token mới.
   */
  async login(user: User) {
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Tài khoản không còn hoạt động');
    }

    const accessToken = await this.generateAccessToken(user);
    const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const { rawToken: refreshToken } = await this.refreshTokenService.create(
      user,
      refreshExpiresAt,
    );

    return { accessToken, refreshToken };
  }

  /**
   * Xin cấp lại Access Token mới dựa trên Refresh Token.
   * Sử dụng atomic transaction và pessimistic row locking.
   */
  async refresh(rawRefreshToken: string) {
    const { newRawToken, user } =
      await this.refreshTokenService.rotate(rawRefreshToken);
    const accessToken = await this.generateAccessToken(user);

    return { accessToken, refreshToken: newRawToken };
  }

  /**
   * Đăng xuất khỏi thiết bị hiện tại (Xóa duy nhất 1 Refresh Token).
   */
  async logout(rawRefreshToken: string) {
    try {
      await this.refreshTokenService.revokeToken(rawRefreshToken);
    } catch {
      // Phớt lờ lỗi nếu token đã hết hạn hoặc không tồn tại (coi như đã logout)
    }
    return { message: 'Đăng xuất thành công' };
  }

  /**
   * Đăng xuất khỏi mọi thiết bị bằng cách thu hồi toàn bộ Refresh Token của user.
   */
  async logoutAll(userId: string) {
    await this.refreshTokenService.revokeAllForUser(userId);
    return { message: 'Đã đăng xuất khỏi tất cả các thiết bị.' };
  }

  /**
   * Gửi link đặt lại mật khẩu vào email người dùng.
   */
  async forgotPassword(dto: ForgotPasswordDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.usersService.findByEmail(email);

    if (user && user.status === UserStatus.ACTIVE) {
      const rawToken = await this.dataSource.transaction(async (manager) => {
        await manager
          .getRepository(ActionToken)
          .createQueryBuilder()
          .update()
          .set({ usedAt: new Date() })
          .where('user_id = :userId', { userId: user.id })
          .andWhere('type = :type', { type: TokenType.PASSWORD_RESET })
          .andWhere('"usedAt" IS NULL')
          .execute();

        const token = TokenUtil.generateRawToken();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

        await manager.getRepository(ActionToken).save(
          manager.getRepository(ActionToken).create({
            tokenHash: TokenUtil.hashToken(token),
            type: TokenType.PASSWORD_RESET,
            userId: user.id,
            expiresAt,
            usedAt: null,
          }),
        );

        return token;
      });

      await this.mailQueue.add(
        'send-mail',
        {
          type: 'RESET_PASSWORD',
          userId: user.id,
          email: user.email,
          name: user.name,
          token: rawToken,
        },
        { attempts: 3, backoff: 5000 },
      );
    }

    return {
      message: 'Nếu email tồn tại, thư hướng dẫn đặt lại mật khẩu đã được gửi.',
    };
  }

  /**
   * Xác nhận đổi mật khẩu dựa vào token gửi qua mail theo transaction nguyên tử.
   */
  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = TokenUtil.hashToken(dto.token);

    await this.dataSource.transaction(async (manager) => {
      const actionToken = await manager.getRepository(ActionToken).findOne({
        where: { tokenHash, type: TokenType.PASSWORD_RESET },
        lock: { mode: 'pessimistic_write' },
      });

      if (
        !actionToken ||
        actionToken.usedAt ||
        actionToken.expiresAt <= new Date()
      ) {
        throw new BadRequestException(
          'Mã đặt lại mật khẩu không hợp lệ hoặc đã hết hạn',
        );
      }

      const user = await manager.getRepository(User).findOne({
        where: { id: actionToken.userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!user) {
        throw new NotFoundException('Không tìm thấy người dùng');
      }

      user.passwordHash = await bcrypt.hash(dto.newPassword, 12);
      actionToken.usedAt = new Date();

      await manager.getRepository(User).save(user);
      await manager.getRepository(ActionToken).save(actionToken);

      await manager
        .getRepository(RefreshToken)
        .createQueryBuilder()
        .update(RefreshToken)
        .set({ revokedAt: new Date() })
        .where('"userId" = :userId', { userId: user.id })
        .andWhere('"revokedAt" IS NULL')
        .execute();
    });

    return { message: 'Đặt lại mật khẩu thành công.' };
  }

  /**
   * Kích hoạt tài khoản đã được admin mời và tự thiết lập mật khẩu.
   */
  async activateAccount(dto: ActivateAccountDto) {
    const tokenHash = TokenUtil.hashToken(dto.token);
    await this.dataSource.transaction(async (manager) => {
      const token = await manager.getRepository(ActionToken).findOne({
        where: { tokenHash, type: TokenType.ACCOUNT_ACTIVATION },
        lock: { mode: 'pessimistic_write' },
      });
      if (!token || token.usedAt || token.expiresAt <= new Date()) {
        throw new BadRequestException(
          'Mã kích hoạt không hợp lệ hoặc đã hết hạn',
        );
      }

      const user = await manager.getRepository(User).findOne({
        where: { id: token.userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) {
        throw new NotFoundException('Không tìm thấy người dùng');
      }
      if (user.status !== UserStatus.PENDING || user.passwordHash) {
        throw new ConflictException(
          'Tài khoản đã được kích hoạt hoặc không hợp lệ',
        );
      }

      user.passwordHash = await bcrypt.hash(dto.password, 12);
      user.status = UserStatus.ACTIVE;
      token.usedAt = new Date();

      await manager.getRepository(User).save(user);
      await manager.getRepository(ActionToken).save(token);
    });

    return { message: 'Kích hoạt tài khoản thành công. Bạn có thể đăng nhập.' };
  }

  /**
   * Đổi mật khẩu cho người dùng đang đăng nhập theo transaction nguyên tử.
   */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    if (dto.oldPassword === dto.newPassword) {
      throw new BadRequestException(
        'Mật khẩu mới không được trùng với mật khẩu cũ',
      );
    }

    const user = await this.dataSource.transaction(async (manager) => {
      const foundUser = await manager
        .getRepository(User)
        .createQueryBuilder('user')
        .addSelect('user.passwordHash')
        .where('user.id = :userId', { userId })
        .setLock('pessimistic_write')
        .getOne();

      if (!foundUser || !foundUser.passwordHash) {
        throw new BadRequestException('Không tìm thấy tài khoản hợp lệ');
      }

      const isPasswordValid = await bcrypt.compare(
        dto.oldPassword,
        foundUser.passwordHash,
      );
      if (!isPasswordValid) {
        throw new BadRequestException('Mật khẩu cũ không chính xác');
      }

      foundUser.passwordHash = await bcrypt.hash(dto.newPassword, 12);
      await manager.getRepository(User).save(foundUser);

      await manager
        .getRepository(RefreshToken)
        .createQueryBuilder()
        .update(RefreshToken)
        .set({ revokedAt: new Date() })
        .where('"userId" = :userId', { userId })
        .andWhere('"revokedAt" IS NULL')
        .execute();

      return foundUser;
    });

    await this.mailQueue.add(
      'send-mail',
      {
        type: 'PASSWORD_CHANGED',
        userId: user.id,
        email: user.email,
        name: user.name,
      },
      { attempts: 3, backoff: 5000 },
    );

    return {
      message:
        'Thay đổi mật khẩu thành công. Vui lòng đăng nhập lại trên các thiết bị.',
    };
  }

  /**
   * Hàm cho LocalStrategy xác thực thông tin email/pass khi gọi API Login.
   */
  async validateUser(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();

    // 1. Kiểm tra Rate Limit trước tiên
    await this.checkRateLimit(normalizedEmail);

    const user =
      await this.usersService.findByEmailWithPassword(normalizedEmail);

    if (!user || !user.passwordHash) {
      await this.incrementFailedLogin(normalizedEmail);
      throw new UnauthorizedException(
        'Tài khoản hoặc mật khẩu không chính xác',
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      await this.incrementFailedLogin(normalizedEmail);
      throw new UnauthorizedException(
        'Tài khoản hoặc mật khẩu không chính xác',
      );
    }

    // Nếu mật khẩu đúng, xóa bộ đếm sai
    await this.clearFailedLogin(normalizedEmail);

    if (user.status !== UserStatus.ACTIVE)
      throw new UnauthorizedException(
        'Tài khoản của bạn đã bị khóa hoặc chưa kích hoạt',
      );

    return user;
  }

  /**
   * RATE LIMIT: Kiểm tra xem user có đang bị khóa tạm thời không
   */
  private async checkRateLimit(email: string) {
    const attempts = await this.redisService.get<number>(`login_fail:${email}`);
    if (attempts && attempts >= 5) {
      throw new HttpException(
        'Tài khoản đã bị khóa do nhập sai mật khẩu quá 5 lần. Vui lòng thử lại sau 10 phút.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * RATE LIMIT: Tăng bộ đếm khi đăng nhập sai, và set thời gian khóa 10 phút (600 giây)
   */
  private async incrementFailedLogin(email: string) {
    const key = `login_fail:${email}`;
    let attempts = await this.redisService.get<number>(key);

    attempts = attempts ? attempts + 1 : 1;

    await this.redisService.set(key, attempts, 600);
  }

  /**
   * RATE LIMIT: Xóa bộ đếm khi đăng nhập thành công
   */
  private async clearFailedLogin(email: string) {
    await this.redisService.del(`login_fail:${email}`);
  }

  /**
   * Tiện ích sinh Access Token (JWT) chỉ chứa sub và email.
   */
  private async generateAccessToken(user: { id: string; email: string }) {
    return this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
    });
  }
}
