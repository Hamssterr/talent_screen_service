import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationStatus } from './enums/notification-status.enum';
import { NotificationType } from './enums/notification-type.enum';
import { NotificationPayloadCryptoService } from './crypto/notification-payload-crypto.service';
import {
  EMAIL_PROVIDER_TOKEN,
  type EmailProvider,
} from '../../platform/email/email-provider.interface';
import { EmailTemplateService } from '../../platform/email/templates/email-template.service';
import { AuditService } from '../../platform/audit/audit.service';
import { ProviderErrorCode } from '../../platform/external-providers/errors/provider-error-code';

export interface DispatchNotificationResult {
  notification: Notification;
  canRetry: boolean;
}

@Injectable()
export class NotificationDispatchService {
  private readonly logger = new Logger(NotificationDispatchService.name);
  private readonly sendingStaleMs: number;

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly cryptoService: NotificationPayloadCryptoService,
    private readonly templateService: EmailTemplateService,
    @Inject(EMAIL_PROVIDER_TOKEN)
    private readonly emailProvider: EmailProvider,
    private readonly auditService: AuditService,
  ) {
    this.sendingStaleMs = this.configService.get<number>(
      'notifications.sendingStaleMs',
      120000,
    );
  }

  /**
   * Dispatch trực tiếp một notification sau khi business transaction đã commit
   * Đảm bảo:
   * - Claim trong transaction ngắn với pessimistic_write
   * - Chỉ pending, failed, unknown hoặc sending đã stale mới được claim
   * - accepted, delivered, suppressed KHÔNG claim lại
   * - External call chạy HOÀN TOÀN ngoài DB transaction
   * - Kết quả cập nhật an toàn bằng conditional status check để tránh late overwrite
   */
  async dispatch(
    notificationId: string,
  ): Promise<DispatchNotificationResult | null> {
    this.logger.log(`Dispatching notification ID: ${notificationId}`);

    // PHA 1: Claim Notification trong transaction ngắn
    const claimResult = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Notification);

      // Lock row bằng pessimistic_write
      const notification = await repo
        .createQueryBuilder('n')
        .setLock('pessimistic_write')
        .where('n.id = :id', { id: notificationId })
        .getOne();

      if (!notification) {
        return { status: 'NOT_FOUND' as const };
      }

      // 1. Kiểm tra trạng thái terminal
      if (
        notification.status === NotificationStatus.ACCEPTED ||
        notification.status === NotificationStatus.DELIVERED ||
        notification.status === NotificationStatus.SUPPRESSED
      ) {
        return {
          status: 'TERMINAL' as const,
          notification,
          canRetry: false,
        };
      }

      const now = new Date();

      // 2. Kiểm tra nếu đang ở SENDING: chỉ reclaim nếu đã stale
      if (notification.status === NotificationStatus.SENDING) {
        const lastAttempt = notification.lastAttemptAt?.getTime() || 0;
        const isStale = now.getTime() - lastAttempt > this.sendingStaleMs;
        if (!isStale) {
          this.logger.warn(
            `Notification ${notificationId} is currently being sent by another concurrent request`,
          );
          return {
            status: 'CONCURRENT_LOCKED' as const,
            notification,
            canRetry: false,
          };
        }
        this.logger.warn(
          `Notification ${notificationId} sending status is stale (> ${this.sendingStaleMs}ms). Reclaiming...`,
        );
      }

      // 3. Kiểm tra payload
      if (!notification.encryptedPayload) {
        notification.status = NotificationStatus.FAILED;
        notification.errorCode = 'NOTIFICATION_SECRET_UNAVAILABLE';
        await repo.save(notification);
        return {
          status: 'PAYLOAD_UNAVAILABLE' as const,
          notification,
          canRetry: false,
        };
      }

      if (
        notification.payloadExpiresAt &&
        now > notification.payloadExpiresAt
      ) {
        notification.status = NotificationStatus.FAILED;
        notification.errorCode = 'NOTIFICATION_SECRET_UNAVAILABLE';
        await repo.save(notification);
        return {
          status: 'PAYLOAD_EXPIRED' as const,
          notification,
          canRetry: false,
        };
      }

      // Giải mã payload
      const payload = this.cryptoService.decrypt(notification.encryptedPayload);
      if (!payload) {
        notification.status = NotificationStatus.FAILED;
        notification.errorCode = 'DECRYPTION_FAILED';
        await repo.save(notification);
        return {
          status: 'DECRYPTION_FAILED' as const,
          notification,
          canRetry: false,
        };
      }

      // 4. Set SENDING, tăng attempts, lưu lastAttemptAt và commit
      notification.status = NotificationStatus.SENDING;
      notification.attempts += 1;
      notification.lastAttemptAt = now;
      const claimed = await repo.save(notification);

      return {
        status: 'CLAIMED' as const,
        notification: claimed,
        payload,
        claimedAttempt: claimed.attempts,
      };
    });

    if (claimResult.status === 'NOT_FOUND') {
      this.logger.warn(`Notification ${notificationId} not found`);
      return null;
    }

    if (claimResult.status !== 'CLAIMED') {
      return {
        notification: claimResult.notification,
        canRetry: claimResult.canRetry,
      };
    }

    const {
      notification: claimedNotification,
      payload,
      claimedAttempt,
    } = claimResult;

    // PHA 2: Chuẩn bị template email
    let emailContent: { subject: string; html: string };
    try {
      if (claimedNotification.type === NotificationType.INTERVIEW_INVITATION) {
        emailContent = this.templateService.renderInterviewInvitation({
          email: claimedNotification.recipient,
          candidateName: payload.candidateName as string | undefined,
          jobTitle: (payload.jobTitle as string) || 'Vị trí ứng tuyển',
          durationMinutes: (payload.durationMinutes as number) || 30,
          invitationExpiresAt: new Date(payload.invitationExpiresAt as string),
          invitationUrl: payload.invitationUrl as string,
        });
      } else if (
        claimedNotification.type === NotificationType.INTERVIEW_CANCELLED
      ) {
        emailContent = this.templateService.renderInterviewCancelled({
          email: claimedNotification.recipient,
          candidateName: payload.candidateName as string | undefined,
          jobTitle: (payload.jobTitle as string) || 'Vị trí ứng tuyển',
          reason: payload.reason as string | undefined,
        });
      } else {
        return this.finalizeFailed(
          claimedNotification.id,
          claimedAttempt,
          'UNKNOWN_NOTIFICATION_TYPE',
          'Loại thông báo không được hỗ trợ',
        );
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return this.finalizeFailed(
        claimedNotification.id,
        claimedAttempt,
        'TEMPLATE_RENDER_FAILED',
        errMsg,
      );
    }

    // PHA 3: Gọi EmailProvider với Timeout - HOÀN TOÀN ngoài DB transaction & row lock
    const sendResult = await this.emailProvider.sendEmail({
      to: claimedNotification.recipient,
      subject: emailContent.subject,
      html: emailContent.html,
      dedupeKey: claimedNotification.dedupeKey,
    });

    // PHA 4: Cập nhật kết quả vào DB bằng transaction ngắn với điều kiện version / attempt
    return this.finalizeDispatchResult(
      claimedNotification,
      claimedAttempt,
      sendResult,
    );
  }

  /**
   * Cập nhật kết quả gửi email an toàn vào DB
   */
  private async finalizeDispatchResult(
    claimedNotification: Notification,
    claimedAttempt: number,
    sendResult: {
      success: boolean;
      messageId?: string;
      error?: string;
      errorCode?: string;
      acceptedAt?: Date;
      isUnknown?: boolean;
    },
  ): Promise<DispatchNotificationResult> {
    const updated = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Notification);

      // Lock row để kiểm tra attempt
      const current = await repo
        .createQueryBuilder('n')
        .setLock('pessimistic_write')
        .where('n.id = :id', { id: claimedNotification.id })
        .getOne();

      if (!current) {
        return claimedNotification;
      }

      // Nếu attempts của DB đã lớn hơn claimedAttempt -> Một lần retry khác đã diễn ra!
      // Không ghi đè late result lên state mới hơn
      if (current.attempts > claimedAttempt) {
        this.logger.warn(
          `Ignoring late provider response for notification ${current.id}. DB attempt=${current.attempts}, claimedAttempt=${claimedAttempt}`,
        );
        return current;
      }

      const now = new Date();
      if (sendResult.success) {
        current.status = NotificationStatus.ACCEPTED;
        current.acceptedAt = sendResult.acceptedAt || now;
        current.providerMessageId = sendResult.messageId || null;
        current.errorCode = null;
        current.encryptedPayload = null; // Policy: xóa encrypted payload sau khi gửi thành công để bảo mật
      } else {
        // Phân loại FAILED hoặc UNKNOWN
        if (
          sendResult.isUnknown ||
          sendResult.errorCode === ProviderErrorCode.TIMEOUT
        ) {
          current.status = NotificationStatus.UNKNOWN;
          current.errorCode = ProviderErrorCode.TIMEOUT;
        } else {
          current.status = NotificationStatus.FAILED;
          current.errorCode = sendResult.errorCode || 'EMAIL_SEND_FAILED';
        }
      }

      return repo.save(current);
    });

    // Audit log (An toàn: Không log recipient hoặc secret payload)
    await this.auditService.record({
      actorId: null,
      actorType: 'system',
      action: sendResult.success
        ? 'notification.accepted'
        : 'notification.failed',
      targetType: 'notification',
      targetId: updated.id,
      ownerId: updated.ownerId,
      metadata: {
        interviewId: updated.interviewId,
        type: updated.type,
        status: updated.status,
        attempts: updated.attempts,
        errorCode: updated.errorCode,
        providerMessageId: updated.providerMessageId,
      },
    });

    const canRetry =
      updated.status === NotificationStatus.FAILED ||
      updated.status === NotificationStatus.UNKNOWN;

    return {
      notification: updated,
      canRetry,
    };
  }

  private async finalizeFailed(
    notificationId: string,
    claimedAttempt: number,
    errorCode: string,
    errorMessage: string,
  ): Promise<DispatchNotificationResult> {
    const updated = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Notification);
      const current = await repo.findOne({ where: { id: notificationId } });
      if (!current || current.attempts > claimedAttempt) {
        return current || ({} as Notification);
      }
      current.status = NotificationStatus.FAILED;
      current.errorCode = errorCode;
      return repo.save(current);
    });

    this.logger.error(
      `Notification ${notificationId} failed dispatch: [${errorCode}] ${errorMessage}`,
    );

    return {
      notification: updated,
      canRetry: false,
    };
  }
}
