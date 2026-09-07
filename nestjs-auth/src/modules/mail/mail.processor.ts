import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { MailService } from './mail.service';

export type MailJobData =
  | {
      type: 'RESET_PASSWORD';
      userId: string;
      email: string;
      name: string;
      token: string;
    }
  | {
      type: 'PASSWORD_CHANGED';
      userId: string;
      email: string;
      name: string;
    }
  | {
      type: 'ACCOUNT_INVITATION';
      userId: string;
      email: string;
      name: string;
      token: string;
    };

@Processor('mail-queue')
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(private readonly mailService: MailService) {
    super();
  }

  async process(job: Job<MailJobData>) {
    const { type, email } = job.data;

    try {
      if (job.data.type === 'RESET_PASSWORD') {
        await this.mailService.sendPasswordResetEmail({
          email: job.data.email,
          name: job.data.name,
          token: job.data.token,
        });
      } else if (job.data.type === 'PASSWORD_CHANGED') {
        await this.mailService.sendPasswordChangedAlert({
          email: job.data.email,
          name: job.data.name,
        });
      } else if (job.data.type === 'ACCOUNT_INVITATION') {
        await this.mailService.sendAccountInvitation({
          email: job.data.email,
          name: job.data.name,
          token: job.data.token,
        });
      }
      this.logger.log(`[Queue] Đã gửi mail ${type} thành công tới ${email}`);
    } catch (error: unknown) {
      this.logger.error(
        `[Queue] Gửi mail ${type} tới ${email} thất bại:`,
        error instanceof Error ? error.stack : error,
      );
      throw error;
    }
  }
}
