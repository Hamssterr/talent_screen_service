import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Permission } from '../../permissions/entities/permission.entity';
import { Role } from './role.entity';
import { User } from '../../../users/entities/user.entity';

@Entity('role_permissions')
export class RolePermission {
  @PrimaryColumn('uuid', { name: 'role_id' })
  roleId: string;

  @PrimaryColumn('uuid', { name: 'permission_id' })
  permissionId: string;

  @ManyToOne(() => Role, (role) => role.rolePermissions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'role_id' })
  role: Role;

  @ManyToOne(() => Permission, (permission) => permission.rolePermissions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'permission_id' })
  permission: Permission;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'granted_by' })
  grantedBy: User | null;

  @Column({ type: 'uuid', name: 'granted_by', nullable: true })
  grantedById: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
