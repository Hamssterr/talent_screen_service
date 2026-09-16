import { Injectable, Logger } from '@nestjs/common';
import {
  EmailProvider,
  SendEmailOptions,
  SendEmailResult,
} from '../email-provider.interface';

@Injectable()
export class LocalEmailProvider implements EmailProvider {
  private readonly logger = new Logger(LocalEmailProvider.name);

  sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    const messageId = `local-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const acceptedAt = new Date();
    // Ghi log an toàn: KHÔNG log token, link chứa token hoặc email body
    this.logger.log(
      `[LocalEmailProvider] Mock email accepted for: ${options.to}, subject: "${options.subject}", messageId: ${messageId}`,
    );
    return Promise.resolve({
      success: true,
      messageId,
      acceptedAt,
    });
  }
}
