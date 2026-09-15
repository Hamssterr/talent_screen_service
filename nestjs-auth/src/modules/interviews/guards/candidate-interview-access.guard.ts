import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { CANDIDATE_COOKIE_NAME } from '../services/candidate-access.service';
import { ErrorCodes } from '../../../common/errors/error-codes';

@Injectable()
export class CandidateInterviewAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    // Đọc cookie interview_access từ header Cookie hoặc req.cookies nếu đã có cookie-parser
    let cookieToken = (
      request as unknown as { cookies?: Record<string, string> }
    ).cookies?.[CANDIDATE_COOKIE_NAME];

    if (!cookieToken && request.headers.cookie) {
      const match = request.headers.cookie
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith(`${CANDIDATE_COOKIE_NAME}=`));
      if (match) {
        cookieToken = decodeURIComponent(match.split('=')[1]);
      }
    }

    if (!cookieToken || !cookieToken.trim()) {
      throw new UnauthorizedException({
        code: ErrorCodes.INVITATION_UNAVAILABLE,
        message:
          'Bạn chưa có quyền truy cập phòng chờ phỏng vấn. Vui lòng sử dụng liên kết từ email',
      });
    }

    // Gắn cookie token vào request object để decorator hoặc controller đọc
    (request as unknown as Record<string, unknown>)['candidateCookieToken'] =
      cookieToken.trim();

    return true;
  }
}
