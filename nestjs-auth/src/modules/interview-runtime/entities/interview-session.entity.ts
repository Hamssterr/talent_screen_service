import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Interview } from '../../interviews/entities/interview.entity';
import { InterviewTurn } from './interview-turn.entity';
import { SessionStatus } from '../enums/session-status.enum';
import { RuntimeState } from '../enums/runtime-state.enum';
import { SessionEndReason } from '../enums/session-end-reason.enum';

@Entity('interview_sessions')
@Index(['interviewId'], { unique: true })
export class InterviewSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'interview_id', type: 'uuid' })
  interviewId: string;

  @OneToOne(() => Interview, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'interview_id' })
  interview?: Interview;

  @Column({
    type: 'enum',
    enum: SessionStatus,
    default: SessionStatus.IN_PROGRESS,
  })
  status: SessionStatus;

  @Column({
    name: 'runtime_state',
    type: 'enum',
    enum: RuntimeState,
    default: RuntimeState.AWAITING_ANSWER,
  })
  runtimeState: RuntimeState;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt: Date;

  @Column({ name: 'deadline_at', type: 'timestamptz' })
  deadlineAt: Date;

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt: Date | null;

  @Column({
    name: 'end_reason',
    type: 'enum',
    enum: SessionEndReason,
    nullable: true,
  })
  endReason: SessionEndReason | null;

  @Column({ name: 'current_turn_id', type: 'uuid', nullable: true })
  currentTurnId: string | null;

  @OneToOne(() => InterviewTurn, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'current_turn_id' })
  currentTurn?: InterviewTurn | null;

  @Column({ name: 'follow_ups_used', type: 'integer', default: 0 })
  followUpsUsed: number;

  @Column({ type: 'integer', default: 1 })
  version: number;

  @Column({ name: 'advance_deadline_at', type: 'timestamptz', nullable: true })
  advanceDeadlineAt: Date | null;

  @Column({ name: 'consent_version', type: 'varchar', length: 50 })
  consentVersion: string;

  @Column({ name: 'consented_at', type: 'timestamptz' })
  consentedAt: Date;

  @OneToMany(() => InterviewTurn, (turn) => turn.session)
  turns?: InterviewTurn[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
