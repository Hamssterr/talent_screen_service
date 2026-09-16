export const EMAIL_PROVIDER_TOKEN = 'EMAIL_PROVIDER_TOKEN';

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  dedupeKey?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  errorCode?: string;
  acceptedAt?: Date;
  isUnknown?: boolean;
}

export interface EmailProvider {
  sendEmail(options: SendEmailOptions): Promise<SendEmailResult>;
}
