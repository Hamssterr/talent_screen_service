import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_audit_logs_actor_id')
  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  @Column({ name: 'actor_type', type: 'varchar', length: 50, default: 'user' })
  actorType: string;

  @Index('IDX_audit_logs_action')
  @Column({ type: 'varchar', length: 100 })
  action: string;

  @Column({ name: 'target_type', type: 'varchar', length: 80 })
  targetType: string;

  @Index('IDX_audit_logs_target_id')
  @Column({ name: 'target_id', type: 'uuid', nullable: true })
  targetId: string | null;

  @Index('IDX_audit_logs_owner_id')
  @Column({ name: 'owner_id', type: 'uuid', nullable: true })
  ownerId: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata: Record<string, unknown>;

  @Column({ name: 'request_id', type: 'varchar', length: 100, nullable: true })
  requestId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
