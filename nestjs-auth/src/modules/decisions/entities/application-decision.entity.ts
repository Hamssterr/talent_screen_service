import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Application } from '../../applications/entities/application.entity';
import { Interview } from '../../interviews/entities/interview.entity';
import { InterviewSession } from '../../interview-runtime/entities/interview-session.entity';
import { Evaluation } from '../../reviews/entities/evaluation.entity';
import { ApplicationStatus } from '../../applications/enums/application-status.enum';
import { DecisionOutcome } from '../enums/decision-outcome.enum';

@Entity('application_decisions')
@Index(['applicationId'], { unique: true })
@Index(['ownerId', 'createdAt'])
@Index(['basisInterviewId'])
@Index(['basisHrReviewId'])
export class ApplicationDecision {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'owner_id' })
  owner?: User;

  @Column({ name: 'application_id', type: 'uuid', unique: true })
  applicationId: string;

  @ManyToOne(() => Application, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'application_id' })
  application?: Application;

  @Column({ name: 'basis_interview_id', type: 'uuid' })
  basisInterviewId: string;

  @ManyToOne(() => Interview, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'basis_interview_id' })
  basisInterview?: Interview;

  @Column({ name: 'basis_session_id', type: 'uuid' })
  basisSessionId: string;

  @ManyToOne(() => InterviewSession, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'basis_session_id' })
  basisSession?: InterviewSession;

  @Column({ name: 'basis_hr_review_id', type: 'uuid' })
  basisHrReviewId: string;

  @ManyToOne(() => Evaluation, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'basis_hr_review_id' })
  basisHrReview?: Evaluation;

  @Column({
    type: 'enum',
    enum: DecisionOutcome,
  })
  outcome: DecisionOutcome;

  @Column({ name: 'internal_reason', type: 'text' })
  internalReason: string;

  @Column({ name: 'candidate_message', type: 'text', nullable: true })
  candidateMessage: string | null;

  @Column({ name: 'notify_candidate', type: 'boolean', default: false })
  notifyCandidate: boolean;

  @Column({
    name: 'previous_status',
    type: 'enum',
    enum: ApplicationStatus,
  })
  previousStatus: ApplicationStatus;

  @Column({ name: 'decided_by', type: 'uuid' })
  decidedBy: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'decided_by' })
  decidedByUser?: User;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
