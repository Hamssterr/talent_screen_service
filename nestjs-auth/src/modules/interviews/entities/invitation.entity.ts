import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Interview } from './interview.entity';
import { InterviewAccessCredential } from './interview-access-credential.entity';

@Entity('invitations')
@Unique(['interviewId', 'invitationVersion'])
@Index(['interviewId', 'invitationVersion'])
export class Invitation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'interview_id', type: 'uuid' })
  interviewId: string;

  @ManyToOne(() => Interview, (i) => i.invitations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'interview_id' })
  interview?: Interview;

  @Column({ name: 'invitation_version', type: 'integer', default: 1 })
  invitationVersion: number;

  @Column({ name: 'token_hash', type: 'char', length: 64, unique: true })
  tokenHash: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ name: 'last_exchanged_at', type: 'timestamptz', nullable: true })
  lastExchangedAt: Date | null;

  @OneToMany(() => InterviewAccessCredential, (c) => c.invitation)
  credentials?: InterviewAccessCredential[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
