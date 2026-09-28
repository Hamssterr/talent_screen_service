import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AiRunStatus } from '../enums/ai-run-status.enum';
import { AiTask } from '../enums/ai-task.enum';

@Entity('ai_runs')
@Index(['aggregateType', 'aggregateId', 'createdAt'])
@Index(['task', 'status', 'createdAt'])
export class AiRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: AiTask,
  })
  task: AiTask;

  @Column({ type: 'varchar', length: 50, default: 'gemini' })
  provider: string;

  @Column({ type: 'varchar', length: 100 })
  model: string;

  @Column({ name: 'aggregate_type', type: 'varchar', length: 50 })
  aggregateType: string;

  @Column({ name: 'aggregate_id', type: 'uuid' })
  aggregateId: string;

  @Column({ name: 'prompt_version', type: 'varchar', length: 50 })
  promptVersion: string;

  @Column({ name: 'schema_version', type: 'varchar', length: 50 })
  schemaVersion: string;

  @Column({ name: 'input_hash', type: 'varchar', length: 64 })
  inputHash: string;

  @Column({
    type: 'enum',
    enum: AiRunStatus,
    default: AiRunStatus.PROCESSING,
  })
  status: AiRunStatus;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'latency_ms', type: 'integer', nullable: true })
  latencyMs: number | null;

  @Column({ name: 'input_tokens', type: 'integer', nullable: true })
  inputTokens: number | null;

  @Column({ name: 'output_tokens', type: 'integer', nullable: true })
  outputTokens: number | null;

  @Column({ name: 'error_code', type: 'varchar', length: 100, nullable: true })
  errorCode: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
