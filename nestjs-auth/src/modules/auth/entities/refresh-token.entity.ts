import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { User } from '../../users/entities/user.entity';

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  tokenHash: string;

  @Index()
  @Column()
  userId: string;

  @Index()
  @Column()
  familyId: string;

  @ManyToOne(() => User, (user) => user.refreshTokens, {
    onDelete: 'CASCADE',
  })
  user: User;

  @Column({
    type: 'timestamp with time zone',
  })
  expiresAt: Date;

  @Column({
    type: 'timestamp with time zone',
    nullable: true,
  })
  revokedAt: Date | null;

  @Column({
    type: 'timestamp with time zone',
    nullable: true,
  })
  lastUsedAt: Date | null;

  @Column({
    type: 'varchar',
    nullable: true,
  })
  userAgent: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
