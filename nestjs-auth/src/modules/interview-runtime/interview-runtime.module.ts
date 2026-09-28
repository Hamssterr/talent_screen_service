import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InterviewSession } from './entities/interview-session.entity';
import { InterviewTurn } from './entities/interview-turn.entity';
import { Answer } from './entities/answer.entity';
import { Interview } from '../interviews/entities/interview.entity';
import { InterviewQuestion } from '../interviews/entities/interview-question.entity';
import { InterviewAccessCredential } from '../interviews/entities/interview-access-credential.entity';
import { Application } from '../applications/entities/application.entity';
import { CandidateSessionController } from './controllers/candidate-session.controller';
import { InterviewSessionService } from './services/interview-session.service';
import { InterviewTurnService } from './services/interview-turn.service';
import { RuntimeTransitionService } from './services/runtime-transition.service';
import { RuntimeProjectionService } from './services/runtime-projection.service';
import { InterviewsModule } from '../interviews/interviews.module';
import { IdempotencyModule } from '../../platform/idempotency/idempotency.module';
import { AuditModule } from '../../platform/audit/audit.module';
import { AiModule } from '../ai/ai.module';
import { ConfigModule } from '@nestjs/config';
import { FollowUpAiService } from './services/follow-up-ai.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InterviewSession,
      InterviewTurn,
      Answer,
      Interview,
      InterviewQuestion,
      InterviewAccessCredential,
      Application,
    ]),
    forwardRef(() => InterviewsModule),
    IdempotencyModule,
    AuditModule,
    AiModule,
    ConfigModule,
  ],
  controllers: [CandidateSessionController],
  providers: [
    InterviewSessionService,
    InterviewTurnService,
    RuntimeTransitionService,
    RuntimeProjectionService,
    FollowUpAiService,
  ],
  exports: [
    InterviewSessionService,
    InterviewTurnService,
    RuntimeTransitionService,
    RuntimeProjectionService,
    FollowUpAiService,
  ],
})
export class InterviewRuntimeModule {}
