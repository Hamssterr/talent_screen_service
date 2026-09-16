import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { RateLimitModule } from './modules/rate-limit/rate-limit.module';
import { RolesModule } from './modules/admin/roles/roles.module';
import { PermissionsModule } from './modules/admin/permissions/permissions.module';
import { AdminModule } from './modules/admin/admin.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { CandidatesModule } from './modules/candidates/candidates.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { QuestionSetsModule } from './modules/question-sets/question-sets.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { InterviewsModule } from './modules/interviews/interviews.module';
import { InterviewRuntimeModule } from './modules/interview-runtime/interview-runtime.module';
import { StorageModule } from './platform/storage/storage.module';
import { EmailModule } from './platform/email/email.module';
import { ExternalProvidersModule } from './platform/external-providers/external-providers.module';
import { configuration, validateEnv } from './config';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { AuditModule } from './platform/audit/audit.module';
import { IdempotencyModule } from './platform/idempotency/idempotency.module';
import { TimeModule } from './platform/time/time.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    DatabaseModule,
    AuditModule,
    IdempotencyModule,
    TimeModule,
    StorageModule,
    ExternalProvidersModule,
    EmailModule,
    UsersModule,
    AuthModule,
    RateLimitModule,
    RolesModule,
    PermissionsModule,
    AdminModule,
    JobsModule,
    CandidatesModule,
    ApplicationsModule,
    DocumentsModule,
    QuestionSetsModule,
    NotificationsModule,
    InterviewsModule,
    InterviewRuntimeModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
