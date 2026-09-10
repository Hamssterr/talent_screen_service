import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuestionSet } from './entities/question-set.entity';
import { QuestionSetItem } from './entities/question-set-item.entity';
import { Application } from '../applications/entities/application.entity';
import { CvVersion } from '../documents/entities/cv-version.entity';
import { Job } from '../jobs/entities/job.entity';
import { QuestionSetsController } from './question-sets.controller';
import { QuestionSetsService } from './question-sets.service';
import { PermissionsModule } from '../admin/permissions/permissions.module';
import { AuditModule } from '../../platform/audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      QuestionSet,
      QuestionSetItem,
      Application,
      CvVersion,
      Job,
    ]),
    PermissionsModule,
    AuditModule,
  ],
  controllers: [QuestionSetsController],
  providers: [QuestionSetsService],
  exports: [QuestionSetsService],
})
export class QuestionSetsModule {}
