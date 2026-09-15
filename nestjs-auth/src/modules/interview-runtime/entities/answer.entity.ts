import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { InterviewTurn } from './interview-turn.entity';

@Entity('answers')
@Index(['turnId'], { unique: true })
export class Answer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'turn_id', type: 'uuid' })
  turnId: string;

  @OneToOne(() => InterviewTurn, (turn) => turn.answer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'turn_id' })
  turn?: InterviewTurn;

  @Column({ type: 'text', nullable: true })
  text: string | null;

  @Column({ name: 'is_skipped', type: 'boolean', default: false })
  isSkipped: boolean;

  @Column({ name: 'submitted_at', type: 'timestamptz' })
  submittedAt: Date;

  @Column({
    name: 'client_request_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  clientRequestId: string | null;

  @Column({ name: 'content_hash', type: 'char', length: 64 })
  contentHash: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
