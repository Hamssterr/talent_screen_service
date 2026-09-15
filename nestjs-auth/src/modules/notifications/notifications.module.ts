import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Notification } from './entities/notification.entity';
import {
  NotificationsService,
  NOTIFICATION_QUEUE_NAME,
} from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationProcessor } from './notification.processor';
import { NotificationPayloadCryptoService } from './crypto/notification-payload-crypto.service';
import { PermissionsModule } from '../admin/permissions/permissions.module';
import { AuditModule } from '../../platform/audit/audit.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification]),
    BullModule.registerQueue({
      name: NOTIFICATION_QUEUE_NAME,
    }),
    PermissionsModule,
    AuditModule,
    MailModule,
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationPayloadCryptoService,
    NotificationProcessor,
  ],
  exports: [NotificationsService, NotificationPayloadCryptoService],
})
export class NotificationsModule {}
