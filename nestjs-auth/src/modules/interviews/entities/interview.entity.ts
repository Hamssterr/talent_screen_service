import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Application } from '../../applications/entities/application.entity';
import { QuestionSet } from '../../question-sets/entities/question-set.entity';
import { CvVersion } from '../../documents/entities/cv-version.entity';
import { InterviewQuestion } from './interview-question.entity';
import { Invitation } from './invitation.entity';
import { InterviewStatus } from '../enums/interview-status.enum';
import { InterviewLanguage } from '../enums/interview-language.enum';

@Entity('interviews')
@Index(['applicationId', 'createdAt', 'id'])
@Index(['ownerId', 'createdAt', 'id'])
@Index(['status', 'createdAt'])
export class Interview {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'owner_id' })
  owner?: User;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId: string;

  @ManyToOne(() => Application, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'application_id' })
  application?: Application;

  @Column({ name: 'question_set_id', type: 'uuid' })
  questionSetId: string;

  @ManyToOne(() => QuestionSet, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'question_set_id' })
  questionSet?: QuestionSet;

  @Column({ name: 'cv_version_id', type: 'uuid' })
  cvVersionId: string;

  @ManyToOne(() => CvVersion, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cv_version_id' })
  cvVersion?: CvVersion;

  @Column({ name: 'round_no', type: 'integer', default: 1 })
  roundNo: number;

  @Column({
    type: 'enum',
    enum: InterviewStatus,
    default: InterviewStatus.INVITED,
  })
  status: InterviewStatus;

  @Column({ name: 'invitation_expires_at', type: 'timestamptz' })
  invitationExpiresAt: Date;

  @Column({ name: 'duration_minutes', type: 'integer' })
  durationMinutes: number;

  @Column({ type: 'integer', default: 1 })
  version: number;

  @Column({ name: 'invitation_version', type: 'integer', default: 1 })
  invitationVersion: number;

  @Column({
    type: 'enum',
    enum: InterviewLanguage,
    default: InterviewLanguage.VI,
  })
  language: InterviewLanguage;

  @Column({ name: 'max_follow_ups_total', type: 'integer', default: 0 })
  maxFollowUpsTotal: number;

  @Column({ name: 'profile_snapshot', type: 'jsonb' })
  profileSnapshot: Record<string, unknown>;

  @Column({ name: 'job_snapshot', type: 'jsonb' })
  jobSnapshot: Record<string, unknown>;

  @Column({ name: 'cancel_reason', type: 'text', nullable: true })
  cancelReason: string | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @OneToMany(() => InterviewQuestion, (q) => q.interview, { cascade: true })
  questions?: InterviewQuestion[];

  @OneToMany(() => Invitation, (inv) => inv.interview)
  invitations?: Invitation[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
