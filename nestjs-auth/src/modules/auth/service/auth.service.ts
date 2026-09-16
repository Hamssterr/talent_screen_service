import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../../users/users.service';
import { User, UserStatus } from '../../users/entities/user.entity';
import { RefreshTokenService } from './refresh-token.service';
import { LoginAttemptService } from './login-attempt.service';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { ActivateAccountDto } from '../dto/activate-account.dto';
import { ActionToken, TokenType } from '../entities/action-token.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { TokenUtil } from '../../../common/utils/token.util';
import {
  EMAIL_PROVIDER_TOKEN,
  type EmailProvider,
} from '../../../platform/email/email-provider.interface';
import { EmailTemplateService } from '../../../platform/email/templates/email-template.service';

/**
 * Service trung tâm xử lý các nghiệp vụ Authentication.
 * Đóng vai trò điều phối giữa các Service nhỏ hơn (User, Email, Token, LoginAttempt).
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly loginAttemptService: LoginAttemptService,
    @Inject(EMAIL_PROVIDER_TOKEN)
    private readonly emailProvider: EmailProvider,
    private readonly templateService: EmailTemplateService,
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
   * Luôn trả về generic response để chống account enumeration.
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

      // Gửi email trực tiếp sau khi transaction đã commit
      try {
        const { subject, html } = this.templateService.renderPasswordReset({
          email: user.email,
          name: user.name,
          token: rawToken,
        });
        await this.emailProvider.sendEmail({
          to: user.email,
          subject,
          html,
        });
      } catch (error) {
        this.logger.error(
          `Lỗi khi gửi email đặt lại mật khẩu cho ${user.id}`,
          error instanceof Error ? error.stack : error,
        );
      }
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
        new Date() > actionToken.expiresAt
      ) {
        throw new BadRequestException(
          'Token không hợp lệ hoặc đã hết hạn sử dụng',
        );
      }

      actionToken.usedAt = new Date();
      await manager.getRepository(ActionToken).save(actionToken);

      const user = await manager.getRepository(User).findOne({
        where: { id: actionToken.userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!user) throw new NotFoundException('Không tìm thấy người dùng');

      user.passwordHash = await bcrypt.hash(dto.newPassword, 10);
      await manager.getRepository(User).save(user);

      await manager
        .getRepository(RefreshToken)
        .createQueryBuilder()
        .update(RefreshToken)
        .set({ revokedAt: new Date() })
        .where('"userId" = :userId', { userId: user.id })
        .andWhere('"revokedAt" IS NULL')
        .execute();
    });

    return {
      message:
        'Đặt lại mật khẩu thành công. Vui lòng đăng nhập bằng mật khẩu mới.',
    };
  }

  /**
   * Kích hoạt tài khoản từ lời mời của Admin theo transaction nguyên tử.
   */
  async activateAccount(dto: ActivateAccountDto) {
    const tokenHash = TokenUtil.hashToken(dto.token);

    return this.dataSource.transaction(async (manager) => {
      const actionToken = await manager.getRepository(ActionToken).findOne({
        where: { tokenHash, type: TokenType.ACCOUNT_ACTIVATION },
        lock: { mode: 'pessimistic_write' },
      });

      if (
        !actionToken ||
        actionToken.usedAt ||
        new Date() > actionToken.expiresAt
      ) {
        throw new BadRequestException(
          'Token kích hoạt không hợp lệ hoặc đã hết hạn',
        );
      }

      const user = await manager.getRepository(User).findOne({
        where: { id: actionToken.userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!user) {
        throw new NotFoundException('Không tìm thấy người dùng');
      }

      if (user.status !== UserStatus.PENDING || user.passwordHash) {
        throw new ConflictException(
          'Tài khoản không ở trạng thái chờ kích hoạt',
        );
      }

      actionToken.usedAt = new Date();
      await manager.getRepository(ActionToken).save(actionToken);

      user.status = UserStatus.ACTIVE;
      user.passwordHash = await bcrypt.hash(dto.password, 10);
      await manager.getRepository(User).save(user);

      return {
        message: 'Kích hoạt tài khoản thành công. Bạn đã có thể đăng nhập.',
      };
    });
  }

  /**
   * Thay đổi mật khẩu khi người dùng đã đăng nhập (cần mật khẩu cũ).
   * Thu hồi toàn bộ Refresh Token của các thiết bị khác.
   * Nếu gửi email cảnh báo bảo mật thất bại, không rollback đổi mật khẩu.
   */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.dataSource.transaction(async (manager) => {
      const foundUser = await manager.getRepository(User).findOne({
        where: { id: userId },
        select: { id: true, email: true, name: true, passwordHash: true },
        lock: { mode: 'pessimistic_write' },
      });

      if (!foundUser || !foundUser.passwordHash) {
        throw new NotFoundException('Không tìm thấy người dùng');
      }

      const isOldPasswordValid = await bcrypt.compare(
        dto.oldPassword,
        foundUser.passwordHash,
      );
      if (!isOldPasswordValid) {
        throw new BadRequestException('Mật khẩu hiện tại không chính xác');
      }

      foundUser.passwordHash = await bcrypt.hash(dto.newPassword, 10);
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

    // Gửi email cảnh báo bảo mật trực tiếp ngoài transaction; không rollback nếu lỗi
    try {
      const { subject, html } = this.templateService.renderPasswordChangedAlert(
        {
          email: user.email,
          name: user.name,
        },
      );
      await this.emailProvider.sendEmail({
        to: user.email,
        subject,
        html,
      });
    } catch (error) {
      this.logger.error(
        `Không thể gửi email cảnh báo đổi mật khẩu cho ${user.id}`,
        error instanceof Error ? error.stack : error,
      );
    }

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

    // 1. Kiểm tra Rate Limit / Brute-force qua PostgreSQL
    const isLocked = await this.loginAttemptService.isLocked(normalizedEmail);
    if (isLocked) {
      throw new HttpException(
        'Tài khoản đã bị khóa do nhập sai mật khẩu quá 5 lần. Vui lòng thử lại sau 10 phút.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user =
      await this.usersService.findByEmailWithPassword(normalizedEmail);

    if (!user || !user.passwordHash) {
      await this.loginAttemptService.recordFailure(normalizedEmail);
      throw new UnauthorizedException(
        'Tài khoản hoặc mật khẩu không chính xác',
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      await this.loginAttemptService.recordFailure(normalizedEmail);
      throw new UnauthorizedException(
        'Tài khoản hoặc mật khẩu không chính xác',
      );
    }

    // Nếu mật khẩu đúng, xóa bộ đếm sai
    await this.loginAttemptService.clearAttempts(normalizedEmail);

    if (user.status !== UserStatus.ACTIVE)
      throw new UnauthorizedException(
        'Tài khoản của bạn đã bị khóa hoặc chưa kích hoạt',
      );

    return user;
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
