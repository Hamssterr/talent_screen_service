import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
const { InjectQueue } = require('@nestjs/bullmq');
import { Queue } from 'bullmq';
import { Notification } from './entities/notification.entity';
import { NotificationStatus } from './enums/notification-status.enum';
import { NotificationType } from './enums/notification-type.enum';
import { NotificationPayloadCryptoService } from './crypto/notification-payload-crypto.service';
import { NotificationResponseDto } from './dto/notification-response.dto';
import {
  createPaginationResult,
  PaginatedResult,
  PaginationQueryDto,
} from '../../common/dto/pagination.dto';
import { ErrorCodes } from '../../common/errors/error-codes';
import { ActorContext } from '../../common/context/actor-context';
import { PermissionsService } from '../admin/permissions/permissions.service';
import { Permissions } from '../admin/permissions/permissions.constants';
import { AuditService } from '../../platform/audit/audit.service';

export const NOTIFICATION_QUEUE_NAME = 'interview-notification-queue';

export interface CreateNotificationParams {
  ownerId: string;
  interviewId?: string | null;
  invitationVersion?: number | null;
  type: NotificationType;
  recipient: string;
  dedupeKey: string;
  unencryptedPayload: Record<string, unknown>;
  payloadTtlMinutes?: number;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    private readonly cryptoService: NotificationPayloadCryptoService,
    @InjectQueue(NOTIFICATION_QUEUE_NAME)
    private readonly notificationQueue: Queue,
    private readonly permissionsService: PermissionsService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Tạo bản ghi notification pending và mã hóa payload (chạy trong transaction)
   */
  async createPendingNotification(
    params: CreateNotificationParams,
    manager?: EntityManager,
  ): Promise<Notification> {
    const repo = manager
      ? manager.getRepository(Notification)
      : this.notificationRepository;

    const encryptedPayload = this.cryptoService.encrypt(
      params.unencryptedPayload,
    );

    const ttlMinutes = params.payloadTtlMinutes ?? 10080; // default 7 days
    const payloadExpiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    const notification = repo.create({
      ownerId: params.ownerId,
      interviewId: params.interviewId ?? null,
      invitationVersion: params.invitationVersion ?? null,
      type: params.type,
      recipient: params.recipient,
      status: NotificationStatus.PENDING,
      dedupeKey: params.dedupeKey,
      attempts: 0,
      encryptedPayload,
      payloadExpiresAt,
    });

    return repo.save(notification);
  }

  /**
   * Enqueue notification ID vào BullMQ (gọi sau khi DB transaction đã commit)
   */
  async enqueueNotification(
    notificationId: string,
    dedupeKey: string,
  ): Promise<void> {
    try {
      await this.notificationQueue.add(
        'send-notification',
        { notificationId },
        {
          jobId: dedupeKey, // Chống duplicate job trong BullMQ
          removeOnComplete: true,
          removeOnFail: false,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
        },
      );
      this.logger.log(`Enqueued notification job for ${notificationId}`);
    } catch (error) {
      this.logger.error(
        `Lỗi khi enqueue notification ${notificationId}`,
        error instanceof Error ? error.stack : error,
      );
    }
  }

  /**
   * Lấy danh sách notifications của một Interview (phân trang offset)
   */
  async listByInterview(
    actor: ActorContext,
    interviewId: string,
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<NotificationResponseDto>> {
    const isAppAdmin = await this.permissionsService.hasAll(actor.userId, [
      Permissions.InterviewsManage,
    ]);

    const qb = this.notificationRepository
      .createQueryBuilder('n')
      .where('n.interview_id = :interviewId', { interviewId });

    if (!isAppAdmin) {
      qb.andWhere('n.owner_id = :ownerId', { ownerId: actor.userId });
    }

    qb.orderBy('n.created_at', 'DESC')
      .addOrderBy('n.id', 'DESC')
      .skip(query.skip)
      .take(query.limit ?? 20);

    const [items, totalItems] = await qb.getManyAndCount();

    const dtos = items.map((item) => this.mapToResponseDto(item));
    return createPaginationResult(dtos, totalItems, query);
  }

  /**
   * Manual retry gửi lại notification khi bị lỗi hoặc pending
   */
  async retry(
    actor: ActorContext,
    id: string,
  ): Promise<NotificationResponseDto> {
    const isAppAdmin = await this.permissionsService.hasAll(actor.userId, [
      Permissions.InterviewsManage,
    ]);

    const notification = await this.notificationRepository.findOne({
      where: { id },
    });

    if (!notification) {
      throw new NotFoundException({
        code: ErrorCodes.NOTIFICATION_NOT_FOUND,
        message: 'Không tìm thấy bản ghi notification',
      });
    }

    if (!isAppAdmin && notification.ownerId !== actor.userId) {
      throw new NotFoundException({
        code: ErrorCodes.NOTIFICATION_NOT_FOUND,
        message: 'Không tìm thấy bản ghi notification',
      });
    }

    // Chỉ cho phép retry các trạng thái pending, failed, unknown
    const retryableStatuses = [
      NotificationStatus.PENDING,
      NotificationStatus.FAILED,
      NotificationStatus.UNKNOWN,
    ];

    if (!retryableStatuses.includes(notification.status)) {
      throw new BadRequestException({
        code: ErrorCodes.NOTIFICATION_NOT_RETRYABLE,
        message: `Notification ở trạng thái ${notification.status} không thể gửi lại`,
      });
    }

    if (!notification.encryptedPayload) {
      throw new BadRequestException({
        code: ErrorCodes.NOTIFICATION_SECRET_UNAVAILABLE,
        message:
          'Dữ liệu payload mã hóa không còn khả dụng. Vui lòng sử dụng tính năng Resend Invitation để tạo link mới',
      });
    }

    if (
      notification.payloadExpiresAt &&
      new Date() > notification.payloadExpiresAt
    ) {
      throw new BadRequestException({
        code: ErrorCodes.NOTIFICATION_SECRET_UNAVAILABLE,
        message:
          'Payload mã hóa đã hết hạn. Vui lòng sử dụng tính năng Resend Invitation để tạo link mới',
      });
    }

    // Reset trạng thái về pending và xóa errorCode
    notification.status = NotificationStatus.PENDING;
    notification.errorCode = null;
    const saved = await this.notificationRepository.save(notification);

    await this.auditService.record({
      actorId: actor.userId,
      actorType: 'user',
      action: 'notification.retry_requested',
      targetType: 'notification',
      targetId: saved.id,
      ownerId: saved.ownerId,
      metadata: {
        interviewId: saved.interviewId,
        type: saved.type,
      },
      requestId: actor.requestId,
    });

    // Enqueue lại với retry dedupeKey
    await this.enqueueNotification(
      saved.id,
      `${saved.dedupeKey}:retry:${Date.now()}`,
    );

    return this.mapToResponseDto(saved);
  }

  mapToResponseDto(n: Notification): NotificationResponseDto {
    return {
      id: n.id,
      ownerId: n.ownerId,
      interviewId: n.interviewId,
      invitationVersion: n.invitationVersion,
      type: n.type,
      recipient: n.recipient,
      status: n.status,
      dedupeKey: n.dedupeKey,
      providerMessageId: n.providerMessageId,
      attempts: n.attempts,
      nextAttemptAt: n.nextAttemptAt,
      acceptedAt: n.acceptedAt,
      errorCode: n.errorCode,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    };
  }
}
