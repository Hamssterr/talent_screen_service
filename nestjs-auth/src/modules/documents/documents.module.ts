import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CvVersion } from './entities/cv-version.entity';
import { CvVersionsService } from './cv-versions.service';
import { CvVersionsController } from './cv-versions.controller';
import { StorageModule } from '../../platform/storage/storage.module';
import { PermissionsModule } from '../admin/permissions/permissions.module';
import { AuditModule } from '../../platform/audit/audit.module';
import { IdempotencyModule } from '../../platform/idempotency/idempotency.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CvVersion]),
    StorageModule,
    PermissionsModule,
    AuditModule,
    IdempotencyModule,
  ],
  controllers: [CvVersionsController],
  providers: [CvVersionsService],
  exports: [CvVersionsService, TypeOrmModule],
})
export class DocumentsModule {}
