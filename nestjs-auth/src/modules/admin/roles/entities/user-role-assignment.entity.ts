import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from '../../../users/entities/user.entity';
import { Role } from './role.entity';

@Entity('user_roles')
export class UserRoleAssignment {
  @PrimaryColumn('uuid', { name: 'user_id' })
  userId: string;

  @PrimaryColumn('uuid', { name: 'role_id' })
  roleId: string;

  @ManyToOne(() => User, (user) => user.roleAssignments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Role, (role) => role.userAssignments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'role_id' })
  role: Role;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_by' })
  assignedBy: User | null;

  @Column({ type: 'uuid', name: 'assigned_by', nullable: true })
  assignedById: string | null;

  @Index()
  @Column({ type: 'timestamp with time zone', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
