import { User } from '../../users/entities/user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum TokenType {
  PASSWORD_RESET = 'PASSWORD_RESET',
  ACCOUNT_ACTIVATION = 'ACCOUNT_ACTIVATION',
}

@Entity('action_tokens')
export class ActionToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: TokenType,
  })
  type: TokenType;

  @Index()
  @Column({ type: 'varchar', unique: true })
  tokenHash: string;

  @Column({ type: 'timestamp with time zone' })
  expiresAt: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  usedAt: Date | null;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string;

  @Index()
  @ManyToOne(() => User, (user) => user.actionTokens, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @CreateDateColumn()
  createdAt: Date;
}
