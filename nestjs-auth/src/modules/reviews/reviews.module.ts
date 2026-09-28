import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Evaluation } from './entities/evaluation.entity';
import { Interview } from '../interviews/entities/interview.entity';
import { InterviewSession } from '../interview-runtime/entities/interview-session.entity';
import { InterviewQuestion } from '../interviews/entities/interview-question.entity';
import { InterviewTurn } from '../interview-runtime/entities/interview-turn.entity';
import { Answer } from '../interview-runtime/entities/answer.entity';
import { Application } from '../applications/entities/application.entity';
import { Job } from '../jobs/entities/job.entity';
import { InterviewsModule } from '../interviews/interviews.module';
import { AiModule } from '../ai/ai.module';
import { IdempotencyModule } from '../../platform/idempotency/idempotency.module';
import { AuditModule } from '../../platform/audit/audit.module';
import { PermissionsModule } from '../admin/permissions/permissions.module';
import { ReviewsController } from './reviews.controller';
import { InterviewSummaryService } from './services/interview-summary.service';
import { EvaluationsService } from './services/evaluations.service';
import { TranscriptProjectionService } from './services/transcript-projection.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Evaluation,
      Interview,
      InterviewSession,
      InterviewQuestion,
      InterviewTurn,
      Answer,
      Application,
      Job,
    ]),
    forwardRef(() => InterviewsModule),
    AiModule,
    IdempotencyModule,
    AuditModule,
    PermissionsModule,
    ConfigModule,
  ],
  controllers: [ReviewsController],
  providers: [
    InterviewSummaryService,
    EvaluationsService,
    TranscriptProjectionService,
  ],
  exports: [
    InterviewSummaryService,
    EvaluationsService,
    TranscriptProjectionService,
  ],
})
export class ReviewsModule {}
