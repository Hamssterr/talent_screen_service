import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CvVersion } from './entities/cv-version.entity';
import { CvVersionsService } from './services/cv-versions.service';
import { CvVersionsController } from './cv-versions.controller';
import { CvExtractionStateService } from './services/cv-extraction-state.service';
import { CvProfileAiService } from './services/cv-profile-ai.service';
import { PdfTextExtractorService } from './extraction/pdf-text-extractor.service';
import { StorageModule } from '../../platform/storage/storage.module';
import { PermissionsModule } from '../admin/permissions/permissions.module';
import { AuditModule } from '../../platform/audit/audit.module';
import { IdempotencyModule } from '../../platform/idempotency/idempotency.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CvVersion]),
    StorageModule,
    PermissionsModule,
    AuditModule,
    IdempotencyModule,
    AiModule,
  ],
  controllers: [CvVersionsController],
  providers: [
    CvVersionsService,
    PdfTextExtractorService,
    CvExtractionStateService,
    CvProfileAiService,
  ],
  exports: [CvVersionsService, CvProfileAiService, TypeOrmModule],
})
export class DocumentsModule {}
