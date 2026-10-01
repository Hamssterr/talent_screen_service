import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApplicationDecision } from './entities/application-decision.entity';
import { Application } from '../applications/entities/application.entity';
import { Interview } from '../interviews/entities/interview.entity';
import { InterviewSession } from '../interview-runtime/entities/interview-session.entity';
import { Evaluation } from '../reviews/entities/evaluation.entity';
import { Candidate } from '../candidates/entities/candidate.entity';
import { Job } from '../jobs/entities/job.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditModule } from '../../platform/audit/audit.module';
import { IdempotencyModule } from '../../platform/idempotency/idempotency.module';
import { PermissionsModule } from '../admin/permissions/permissions.module';
import { DecisionsController } from './decisions.controller';
import { DecisionsService } from './decisions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ApplicationDecision,
      Application,
      Interview,
      InterviewSession,
      Evaluation,
      Candidate,
      Job,
      Notification,
    ]),
    NotificationsModule,
    AuditModule,
    IdempotencyModule,
    PermissionsModule,
  ],
  controllers: [DecisionsController],
  providers: [DecisionsService],
  exports: [DecisionsService],
})
export class DecisionsModule {}
