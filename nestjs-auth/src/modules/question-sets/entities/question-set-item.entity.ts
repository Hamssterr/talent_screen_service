import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { QuestionSet } from './question-set.entity';
import { QuestionSource } from '../enums/question-source.enum';
import { QuestionDifficulty } from '../enums/question-difficulty.enum';

@Entity('question_set_items')
@Unique(['questionSetId', 'position'])
@Index(['questionSetId', 'position'])
export class QuestionSetItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'question_set_id', type: 'uuid' })
  questionSetId: string;

  @ManyToOne(() => QuestionSet, (qs) => qs.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'question_set_id' })
  questionSet?: QuestionSet;

  @Column({ type: 'integer' })
  position: number;

  @Column({ type: 'text' })
  text: string;

  @Column({
    type: 'enum',
    enum: QuestionSource,
    default: QuestionSource.MANUAL,
  })
  source: QuestionSource;

  @Column({ type: 'varchar', length: 150, nullable: true })
  competency: string | null;

  @Column({
    name: 'evaluation_criterion_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  evaluationCriterionId: string | null;

  @Column({
    type: 'enum',
    enum: QuestionDifficulty,
    default: QuestionDifficulty.INTERMEDIATE,
  })
  difficulty: QuestionDifficulty;

  @Column({ name: 'allow_follow_up', type: 'boolean', default: true })
  allowFollowUp: boolean;

  @Column({ name: 'max_follow_ups', type: 'integer', default: 1 })
  maxFollowUps: number;

  @Column({ name: 'evidence_refs', type: 'jsonb', nullable: true })
  evidenceRefs: unknown[] | null;

  @Column({ name: 'review_notes', type: 'text', nullable: true })
  reviewNotes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
