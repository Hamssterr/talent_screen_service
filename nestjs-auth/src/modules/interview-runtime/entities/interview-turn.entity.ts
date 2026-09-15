import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { InterviewSession } from './interview-session.entity';
import { InterviewQuestion } from '../../interviews/entities/interview-question.entity';
import { Answer } from './answer.entity';
import { TurnKind } from '../enums/turn-kind.enum';
import { TurnStatus } from '../enums/turn-status.enum';

@Entity('interview_turns')
@Unique(['sessionId', 'sequenceNo'])
@Unique(['sessionId', 'rootQuestionId', 'followUpIndex'])
@Index(['sessionId', 'sequenceNo'])
export class InterviewTurn {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  @ManyToOne(() => InterviewSession, (session) => session.turns, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'session_id' })
  session?: InterviewSession;

  @Column({ name: 'root_question_id', type: 'uuid' })
  rootQuestionId: string;

  @ManyToOne(() => InterviewQuestion, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'root_question_id' })
  rootQuestion?: InterviewQuestion;

  @Column({ name: 'parent_turn_id', type: 'uuid', nullable: true })
  parentTurnId: string | null;

  @ManyToOne(() => InterviewTurn, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'parent_turn_id' })
  parentTurn?: InterviewTurn | null;

  @Column({ name: 'sequence_no', type: 'integer' })
  sequenceNo: number;

  @Column({
    type: 'enum',
    enum: TurnKind,
    default: TurnKind.MAIN,
  })
  kind: TurnKind;

  @Column({ name: 'follow_up_index', type: 'integer', default: 0 })
  followUpIndex: number;

  @Column({ type: 'text' })
  text: string;

  @Column({
    type: 'enum',
    enum: TurnStatus,
    default: TurnStatus.OPEN,
  })
  status: TurnStatus;

  @Column({ name: 'presented_at', type: 'timestamptz' })
  presentedAt: Date;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @Column({ name: 'ai_run_id', type: 'uuid', nullable: true })
  aiRunId: string | null;

  @OneToOne(() => Answer, (answer) => answer.turn)
  answer?: Answer;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
