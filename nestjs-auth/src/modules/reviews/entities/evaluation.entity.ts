import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { EvaluationType } from '../enums/evaluation-type.enum';
import { Interview } from '../../interviews/entities/interview.entity';
import { InterviewSession } from '../../interview-runtime/entities/interview-session.entity';
import { AiRun } from '../../ai/entities/ai-run.entity';

@Entity('evaluations')
@Unique('uq_evaluations_interview_type_revision', [
  'interviewId',
  'type',
  'revision',
])
@Index('idx_evaluations_owner_interview', ['ownerId', 'interviewId'])
export class Evaluation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId: string;

  @Column({ name: 'interview_id', type: 'uuid' })
  interviewId: string;

  @ManyToOne(() => Interview, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'interview_id' })
  interview?: Interview;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  @ManyToOne(() => InterviewSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session?: InterviewSession;

  @Column({
    type: 'varchar',
    length: 30,
  })
  type: EvaluationType;

  @Column({ type: 'integer', default: 1 })
  revision: number;

  @Column({ name: 'schema_version', type: 'integer', default: 1 })
  schemaVersion: number;

  @Column({ type: 'jsonb' })
  content: Record<string, any>;

  @Column({ name: 'ai_run_id', type: 'uuid', nullable: true })
  aiRunId: string | null;

  @ManyToOne(() => AiRun, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ai_run_id' })
  aiRun?: AiRun | null;

  @Column({ name: 'input_hash', type: 'varchar', length: 64, nullable: true })
  inputHash: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
