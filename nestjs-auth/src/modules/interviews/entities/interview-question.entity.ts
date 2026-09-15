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
import { Interview } from './interview.entity';
import { QuestionSource } from '../../question-sets/enums/question-source.enum';
import { QuestionDifficulty } from '../../question-sets/enums/question-difficulty.enum';

@Entity('interview_questions')
@Unique(['interviewId', 'position'])
@Index(['interviewId', 'position'])
export class InterviewQuestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'interview_id', type: 'uuid' })
  interviewId: string;

  @ManyToOne(() => Interview, (i) => i.questions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'interview_id' })
  interview?: Interview;

  @Column({ name: 'source_question_id', type: 'uuid', nullable: true })
  sourceQuestionId: string | null;

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

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
