import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Candidate } from './entities/candidate.entity';
import { CandidatesService } from './candidates.service';
import { CandidatesController } from './candidates.controller';
import { PermissionsModule } from '../admin/permissions/permissions.module';
import { AuditModule } from '../../platform/audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Candidate]),
    PermissionsModule,
    AuditModule,
  ],
  controllers: [CandidatesController],
  providers: [CandidatesService],
  exports: [CandidatesService, TypeOrmModule],
})
export class CandidatesModule {}
