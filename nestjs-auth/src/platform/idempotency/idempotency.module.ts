import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdempotencyKey } from './entities/idempotency-key.entity';
import { IdempotencyService } from './idempotency.service';
import { TimeModule } from '../time/time.module';

@Module({
  imports: [TypeOrmModule.forFeature([IdempotencyKey]), TimeModule],
  providers: [IdempotencyService],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}
