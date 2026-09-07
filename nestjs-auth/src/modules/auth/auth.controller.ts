import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  UseGuards,
  UnauthorizedException,
  Res,
  Req,
} from '@nestjs/common';
import type { Response, Request as ExpressRequest } from 'express';
import { AuthService } from './service/auth.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { LocalAuthGuard } from '../../common/guards/local-auth.guard';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ConfigService } from '@nestjs/config';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { ICurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { CookieUtil } from '../../common/utils/cookie.util';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { CustomThrottlerGuard } from '../../common/guards/custom-throttler.guard';
import { ActivateAccountDto } from './dto/activate-account.dto';

/**
 * Controller quản lý tất cả các endpoint liên quan đến Xác thực (Authentication).
 */
@UseGuards(CustomThrottlerGuard)
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Đăng nhập tài khoản bằng email/mật khẩu.
   * Gắn Refresh Token vào httpOnly Cookie để bảo mật.
   */
  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(
    @CurrentUser() user: User,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(user);

    CookieUtil.setRefreshTokenCookie(
      res,
      result.refreshToken,
      this.configService,
    );

    return {
      message: 'Đăng nhập thành công',
      accessToken: result.accessToken,
    };
  }

  /**
   * Lấy Access Token mới khi cái cũ hết hạn (Silent Refresh).
   * Yêu cầu cookie chứa Refresh Token hợp lệ.
   */
  @Post('refresh')
  async refresh(
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = CookieUtil.getRefreshTokenFromCookie(req);

    if (!token) {
      throw new UnauthorizedException('Refresh token is missing');
    }

    const result = await this.authService.refresh(token);

    CookieUtil.setRefreshTokenCookie(
      res,
      result.refreshToken,
      this.configService,
    );

    return { accessToken: result.accessToken };
  }

  /**
   * Đăng xuất khỏi thiết bị hiện tại (Xóa Refresh Token ở cookie và server).
   */
  @Post('logout')
  async logout(
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = CookieUtil.getRefreshTokenFromCookie(req);

    if (token) {
      await this.authService.logout(token);
    }

    CookieUtil.clearRefreshTokenCookie(res);

    return { message: 'Đăng xuất thành công' };
  }

  /**
   * Đăng xuất khỏi TOÀN BỘ các thiết bị (Thu hồi tất cả Refresh Token của User).
   */
  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  logoutAll(@CurrentUser() user: ICurrentUser) {
    return this.authService.logoutAll(user.id);
  }

  /**
   * Gửi link đặt lại mật khẩu vào email khi người dùng quên.
   * Rất nhạy cảm với spam email -> Giới hạn gắt: 3 lần / 1 phút
   */
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  /**
   * Đặt lại mật khẩu mới thông qua Token trong email.
   */
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  /**
   * Kích hoạt tài khoản đã được admin mời và tự thiết lập mật khẩu.
   */
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('activate-account')
  activateAccount(@Body() dto: ActivateAccountDto) {
    return this.authService.activateAccount(dto);
  }

  /**
   * Đổi mật khẩu chủ động khi đã đăng nhập (Cần mật khẩu cũ).
   */
  @UseGuards(JwtAuthGuard)
  @Patch('change-password')
  changePassword(
    @CurrentUser() user: ICurrentUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.id, dto);
  }

  /**
   * Lấy thông tin cá nhân (Profile) cơ bản.
   * API này gọi liên tục nên sẽ bỏ qua (Skip) rate limit
   */
  @SkipThrottle()
  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() user: ICurrentUser) {
    return user;
  }
}
