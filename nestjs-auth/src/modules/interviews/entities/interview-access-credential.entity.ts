import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Invitation } from './invitation.entity';

@Entity('interview_access_credentials')
@Index(['invitationId', 'createdAt'])
export class InterviewAccessCredential {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'invitation_id', type: 'uuid' })
  invitationId: string;

  @ManyToOne(() => Invitation, (inv) => inv.credentials, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'invitation_id' })
  invitation?: Invitation;

  @Column({ name: 'token_hash', type: 'char', length: 64, unique: true })
  tokenHash: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ name: 'last_seen_at', type: 'timestamptz', nullable: true })
  lastSeenAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
