import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DataSource } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationStatus } from './enums/notification-status.enum';
import { NotificationType } from './enums/notification-type.enum';
import { NotificationPayloadCryptoService } from './crypto/notification-payload-crypto.service';
import { NOTIFICATION_QUEUE_NAME } from './notifications.service';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../../platform/audit/audit.service';

interface NotificationJobData {
  notificationId: string;
}

@Processor(NOTIFICATION_QUEUE_NAME)
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly cryptoService: NotificationPayloadCryptoService,
    private readonly mailService: MailService,
    private readonly auditService: AuditService,
  ) {
    super();
  }

  async process(job: Job<NotificationJobData>): Promise<void> {
    const { notificationId } = job.data;
    this.logger.log(`Processing notification job for ID: ${notificationId}`);

    // Dùng transaction với row-lock để xử lý an toàn
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Notification);

      const notification = await repo
        .createQueryBuilder('n')
        .setLock('pessimistic_write')
        .where('n.id = :id', { id: notificationId })
        .getOne();

      if (!notification) {
        this.logger.warn(`Notification ${notificationId} not found. Skipping.`);
        return;
      }

      // Chỉ gửi nếu trạng thái hợp lệ
      if (
        notification.status === NotificationStatus.ACCEPTED ||
        notification.status === NotificationStatus.DELIVERED ||
        notification.status === NotificationStatus.SUPPRESSED
      ) {
        this.logger.log(
          `Notification ${notificationId} already in final status ${notification.status}`,
        );
        return;
      }

      // Đánh dấu sending
      notification.status = NotificationStatus.SENDING;
      notification.attempts += 1;
      await repo.save(notification);

      if (!notification.encryptedPayload) {
        notification.status = NotificationStatus.FAILED;
        notification.errorCode = 'PAYLOAD_EMPTY';
        await repo.save(notification);
        return;
      }

      // Giải mã payload
      const payload = this.cryptoService.decrypt(notification.encryptedPayload);
      if (!payload) {
        notification.status = NotificationStatus.FAILED;
        notification.errorCode = 'DECRYPTION_FAILED';
        await repo.save(notification);
        return;
      }

      try {
        if (notification.type === NotificationType.INTERVIEW_INVITATION) {
          await this.mailService.sendInterviewInvitation({
            email: notification.recipient,
            candidateName: payload.candidateName as string | undefined,
            jobTitle: (payload.jobTitle as string) || 'Vị trí ứng tuyển',
            durationMinutes: (payload.durationMinutes as number) || 30,
            invitationExpiresAt: new Date(
              payload.invitationExpiresAt as string,
            ),
            invitationUrl: payload.invitationUrl as string,
          });
        } else if (notification.type === NotificationType.INTERVIEW_CANCELLED) {
          await this.mailService.sendInterviewCancelled({
            email: notification.recipient,
            candidateName: payload.candidateName as string | undefined,
            jobTitle: (payload.jobTitle as string) || 'Vị trí ứng tuyển',
            reason: payload.reason as string | undefined,
          });
        }

        // SMTP chấp nhận thành công -> status = ACCEPTED, xóa encryptedPayload
        notification.status = NotificationStatus.ACCEPTED;
        notification.acceptedAt = new Date();
        notification.encryptedPayload = null;
        notification.errorCode = null;
        await repo.save(notification);

        await this.auditService.record(
          {
            actorId: null,
            actorType: 'system',
            action: 'notification.accepted',
            targetType: 'notification',
            targetId: notification.id,
            ownerId: notification.ownerId,
            metadata: {
              interviewId: notification.interviewId,
              type: notification.type,
              attempts: notification.attempts,
            },
          },
          manager,
        );

        this.logger.log(
          `Notification ${notificationId} sent and accepted by SMTP.`,
        );
      } catch (error) {
        notification.status = NotificationStatus.FAILED;
        notification.errorCode =
          error instanceof Error
            ? error.message.substring(0, 100)
            : 'SMTP_SEND_FAILED';
        await repo.save(notification);

        await this.auditService.record(
          {
            actorId: null,
            actorType: 'system',
            action: 'notification.failed',
            targetType: 'notification',
            targetId: notification.id,
            ownerId: notification.ownerId,
            metadata: {
              interviewId: notification.interviewId,
              type: notification.type,
              errorCode: notification.errorCode,
              attempts: notification.attempts,
            },
          },
          manager,
        );

        this.logger.error(
          `Notification ${notificationId} failed during SMTP delivery`,
          error instanceof Error ? error.stack : error,
        );
        throw error; // Ném ra để BullMQ retry theo backoff nếu chưa hết attempts
      }
    });
  }
}
