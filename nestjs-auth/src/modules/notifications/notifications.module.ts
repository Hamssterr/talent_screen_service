import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationPayloadCryptoService } from './crypto/notification-payload-crypto.service';
import { NotificationDispatchService } from './notification-dispatch.service';
import { PermissionsModule } from '../admin/permissions/permissions.module';
import { AuditModule } from '../../platform/audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification]),
    PermissionsModule,
    AuditModule,
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationPayloadCryptoService,
    NotificationDispatchService,
  ],
  exports: [
    NotificationsService,
    NotificationPayloadCryptoService,
    NotificationDispatchService,
  ],
})
export class NotificationsModule {}
