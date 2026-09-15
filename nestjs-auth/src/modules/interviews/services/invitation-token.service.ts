import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';

@Injectable()
export class InvitationTokenService {
  /**
   * Tạo ngẫu nhiên raw token (base64url, ít nhất 32 bytes entropy)
   */
  generateToken(): string {
    return randomBytes(32).toString('base64url');
  }

  /**
   * Băm token bằng thuật toán SHA-256 trước khi lưu database
   */
  hashToken(token: string): string {
    return createHash('sha256').update(token.trim()).digest('hex');
  }
}
