import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import {
  EmailProvider,
  SendEmailOptions,
  SendEmailResult,
} from '../email-provider.interface';
import { withProviderTimeout } from '../../external-providers/timeout/with-provider-timeout';
import { ProviderError } from '../../external-providers/errors/provider-error';
import { ProviderErrorCode } from '../../external-providers/errors/provider-error-code';

@Injectable()
export class NodemailerEmailProvider implements EmailProvider {
  private readonly logger = new Logger(NodemailerEmailProvider.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly defaultFrom: string;
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('mail.host', 'smtp.gmail.com');
    const port = this.configService.get<number>('mail.port', 465);
    const secure = this.configService.get<boolean>('mail.secure', true);
    const user = this.configService.get<string>('mail.user', '');
    const pass = this.configService.get<string>('mail.password', '');

    this.timeoutMs = this.configService.get<number>('mail.timeoutMs', 10000);

    this.defaultFrom = this.configService.get<string>(
      'mail.from',
      user
        ? `Talent Screen <${user}>`
        : 'TalentScreen <noreply@talentscreen.com>',
    );

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      connectionTimeout: this.timeoutMs,
      greetingTimeout: this.timeoutMs,
      socketTimeout: this.timeoutMs,
    });
  }

  async sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    try {
      const from = options.from || this.defaultFrom;

      const info = await withProviderTimeout(
        'nodemailer-smtp',
        this.timeoutMs,
        async () => {
          return this.transporter.sendMail({
            from,
            to: options.to,
            subject: options.subject,
            html: options.html,
            headers: options.dedupeKey
              ? { 'X-Entity-Ref-ID': options.dedupeKey }
              : undefined,
          });
        },
      );

      this.logger.log(
        `[NodemailerEmailProvider] Email sent successfully to: ${options.to}, messageId: ${info.messageId}`,
      );

      return {
        success: true,
        messageId: info.messageId,
        acceptedAt: new Date(),
      };
    } catch (error) {
      const isTimeout = ProviderError.isTimeout(error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      const isUnknown = isTimeout; // Khi timeout sau khi socket đã mở, không chắc chắn server SMTP đã xử lý hay chưa

      this.logger.error(
        `[NodemailerEmailProvider] Failed to send email to ${options.to}: ${errorMsg}`,
      );

      return {
        success: false,
        error: errorMsg,
        errorCode: isTimeout
          ? ProviderErrorCode.TIMEOUT
          : ProviderErrorCode.TEMPORARY,
        isUnknown,
      };
    }
  }
}
