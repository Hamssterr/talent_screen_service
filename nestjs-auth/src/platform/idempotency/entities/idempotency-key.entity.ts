import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

export type IdempotencyState = 'processing' | 'completed';

@Entity('idempotency_keys')
@Unique('UQ_idempotency_actor_route_key', ['actorScope', 'route', 'key'])
export class IdempotencyKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'actor_scope', type: 'varchar', length: 120 })
  actorScope: string;

  @Column({ type: 'varchar', length: 255 })
  route: string;

  @Column({ type: 'varchar', length: 255 })
  key: string;

  @Column({ name: 'request_hash', type: 'varchar', length: 64 })
  requestHash: string;

  @Column({ name: 'response_status', type: 'integer', nullable: true })
  responseStatus: number | null;

  @Column({ name: 'response_body', type: 'jsonb', nullable: true })
  responseBody: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 20 })
  state: IdempotencyState;

  @Index('IDX_idempotency_keys_expires_at')
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
