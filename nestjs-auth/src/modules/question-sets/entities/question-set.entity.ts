import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
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
import { CvVersion } from '../../documents/entities/cv-version.entity';
import { QuestionSetItem } from './question-set-item.entity';
import { QuestionSetStatus } from '../enums/question-set-status.enum';
import { QuestionSetMode } from '../enums/question-set-mode.enum';
import { QuestionLanguage } from '../enums/question-language.enum';

@Entity('question_sets')
@Index(['applicationId', 'createdAt', 'id'])
@Index(['ownerId', 'createdAt', 'id'])
@Index(['status', 'createdAt'])
export class QuestionSet {
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

  @Column({ name: 'cv_version_id', type: 'uuid' })
  cvVersionId: string;

  @ManyToOne(() => CvVersion, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cv_version_id' })
  cvVersion?: CvVersion;

  @Column({ name: 'cv_profile_version', type: 'integer' })
  cvProfileVersion: number;

  @Column({ name: 'job_version', type: 'integer' })
  jobVersion: number;

  @Column({ name: 'profile_snapshot', type: 'jsonb' })
  profileSnapshot: Record<string, unknown>;

  @Column({ name: 'job_snapshot', type: 'jsonb' })
  jobSnapshot: Record<string, unknown>;

  @Column({
    type: 'enum',
    enum: QuestionLanguage,
    default: QuestionLanguage.VI,
  })
  language: QuestionLanguage;

  @Column({
    type: 'enum',
    enum: QuestionSetMode,
    default: QuestionSetMode.MANUAL,
  })
  mode: QuestionSetMode;

  @Column({
    type: 'enum',
    enum: QuestionSetStatus,
    default: QuestionSetStatus.DRAFT,
  })
  status: QuestionSetStatus;

  @Column({ type: 'integer', default: 1 })
  version: number;

  @Column({ name: 'generation_version', type: 'integer', default: 1 })
  generationVersion: number;

  @Column({ name: 'ai_run_id', type: 'uuid', nullable: true })
  aiRunId: string | null;

  @Column({ name: 'source_question_set_id', type: 'uuid', nullable: true })
  sourceQuestionSetId: string | null;

  @ManyToOne(() => QuestionSet, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'source_question_set_id' })
  sourceQuestionSet?: QuestionSet | null;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'approved_by' })
  approver?: User | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @OneToMany(() => QuestionSetItem, (item) => item.questionSet, {
    cascade: true,
  })
  items?: QuestionSetItem[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
