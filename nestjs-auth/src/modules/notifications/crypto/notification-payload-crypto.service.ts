import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

@Injectable()
export class NotificationPayloadCryptoService {
  private readonly logger = new Logger(NotificationPayloadCryptoService.name);
  private readonly key: Buffer;

  constructor(private readonly configService: ConfigService) {
    const rawKey =
      this.configService.get<string>('notifications.cryptoKey') ||
      this.configService.get<string>('auth.jwtSecret') ||
      'fallback-secure-crypto-key-at-least-32-chars';
    // Đảm bảo key luôn có độ dài đúng 32 bytes (256 bits) cho AES-256-GCM
    this.key = createHash('sha256').update(rawKey).digest();
  }

  /**
   * Mã hóa payload bằng thuật toán AES-256-GCM
   * Trả về chuỗi định dạng: ivHex:authTagHex:encryptedDataHex
   */
  encrypt(payload: Record<string, unknown>): string {
    const iv = randomBytes(12); // 96 bits IV chuẩn cho GCM
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);

    const plaintext = JSON.stringify(payload);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Giải mã ciphertext AES-256-GCM
   */
  decrypt(encryptedText: string): Record<string, unknown> | null {
    try {
      const parts = encryptedText.split(':');
      if (parts.length !== 3) {
        throw new Error('Định dạng payload mã hóa không hợp lệ');
      }

      const [ivHex, authTagHex, encryptedDataHex] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');

      const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encryptedDataHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return JSON.parse(decrypted) as Record<string, unknown>;
    } catch (error) {
      this.logger.error(
        'Lỗi khi giải mã notification payload',
        error instanceof Error ? error.stack : error,
      );
      return null;
    }
  }
}
