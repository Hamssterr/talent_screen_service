import { Response, Request } from 'express';
import { ConfigService } from '@nestjs/config';

export class CookieUtil {
  /**
   * Helper: Gắn Refresh Token vào HttpOnly Cookie.
   */
  static setRefreshTokenCookie(
    res: Response,
    token: string,
    configService: ConfigService,
  ) {
    const isProduction = configService.get<string>('NODE_ENV') === 'production';
    res.cookie('refreshToken', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // Sống 7 ngày
      path: '/api/auth', // Chỉ gửi cookie lên các API có tiền tố này
    });
  }

  /**
   * Helper: Xóa Refresh Token Cookie khi đăng xuất.
   */
  static clearRefreshTokenCookie(res: Response) {
    res.clearCookie('refreshToken', {
      path: '/api/auth',
    });
  }

  /**
   * Lấy Refresh Token từ Cookie của Request.
   */
  static getRefreshTokenFromCookie(req: Request): string | undefined {
    const cookies = req.cookies as Record<string, unknown> | undefined;
    const token = cookies?.['refreshToken'];
    return typeof token === 'string' ? token : undefined;
  }
}
