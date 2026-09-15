import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Interview } from './entities/interview.entity';
import { InterviewQuestion } from './entities/interview-question.entity';
import { Invitation } from './entities/invitation.entity';
import { InterviewAccessCredential } from './entities/interview-access-credential.entity';
import { Application } from '../applications/entities/application.entity';
import { QuestionSet } from '../question-sets/entities/question-set.entity';
import { QuestionSetItem } from '../question-sets/entities/question-set-item.entity';
import { CvVersion } from '../documents/entities/cv-version.entity';
import { Job } from '../jobs/entities/job.entity';
import { Candidate } from '../candidates/entities/candidate.entity';

import { InterviewsController } from './controllers/interviews.controller';
import { CandidateInterviewAccessController } from './controllers/candidate-interview-access.controller';

import { InterviewsService } from './services/interviews.service';
import { InvitationsService } from './services/invitations.service';
import { CandidateAccessService } from './services/candidate-access.service';
import { InvitationTokenService } from './services/invitation-token.service';
import { InterviewLifecycleService } from './services/interview-lifecycle.service';

import { NotificationsModule } from '../notifications/notifications.module';
import { PermissionsModule } from '../admin/permissions/permissions.module';
import { AuditModule } from '../../platform/audit/audit.module';
import { IdempotencyModule } from '../../platform/idempotency/idempotency.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Interview,
      InterviewQuestion,
      Invitation,
      InterviewAccessCredential,
      Application,
      QuestionSet,
      QuestionSetItem,
      CvVersion,
      Job,
      Candidate,
    ]),
    NotificationsModule,
    PermissionsModule,
    AuditModule,
    IdempotencyModule,
  ],
  controllers: [InterviewsController, CandidateInterviewAccessController],
  providers: [
    InterviewsService,
    InvitationsService,
    CandidateAccessService,
    InvitationTokenService,
    InterviewLifecycleService,
  ],
  exports: [
    InterviewsService,
    InvitationsService,
    CandidateAccessService,
    InvitationTokenService,
    InterviewLifecycleService,
  ],
})
export class InterviewsModule {}
