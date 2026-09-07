import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { PermissionKey } from './permissions.constants';
import { Permission } from './entities/permission.entity';
import { Role } from '../roles/entities/role.entity';
import { UserRoleAssignment } from '../roles/entities/user-role-assignment.entity';
import {
  createPaginationResult,
  PaginatedResult,
  PaginationQueryDto,
} from '../../../common/dto/pagination.dto';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(UserRoleAssignment)
    private readonly userRoleRepository: Repository<UserRoleAssignment>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
  ) {}

  async getEffectivePermissions(userId: string): Promise<Set<string>> {
    const rows = await this.userRoleRepository
      .createQueryBuilder('assignment')
      .innerJoin('assignment.role', 'role', 'role.isActive = true')
      .innerJoin('role.rolePermissions', 'rolePermission')
      .innerJoin(
        'rolePermission.permission',
        'permission',
        'permission.isActive = true',
      )
      .where('assignment.userId = :userId', { userId })
      .andWhere(
        new Brackets((query) => {
          query
            .where('assignment.expiresAt IS NULL')
            .orWhere('assignment.expiresAt > CURRENT_TIMESTAMP');
        }),
      )
      .select('permission.key', 'key')
      .distinct(true)
      .getRawMany<{ key: string }>();

    return new Set(rows.map((row) => row.key));
  }

  async getUserRoles(userId: string): Promise<Role[]> {
    const assignments = await this.userRoleRepository.find({
      where: { userId },
      relations: { role: true },
    });

    const now = Date.now();
    return assignments
      .filter(
        (assignment) =>
          assignment.role.isActive &&
          (!assignment.expiresAt || assignment.expiresAt.getTime() > now),
      )
      .map((assignment) => assignment.role);
  }

  async hasAll(userId: string, required: PermissionKey[]): Promise<boolean> {
    const effective = await this.getEffectivePermissions(userId);
    return required.every((permission) => effective.has(permission));
  }

  async hasAny(userId: string, required: PermissionKey[]): Promise<boolean> {
    const effective = await this.getEffectivePermissions(userId);
    return required.some((permission) => effective.has(permission));
  }

  async listPermissions(
    query: PaginationQueryDto = new PaginationQueryDto(),
  ): Promise<PaginatedResult<Permission>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const [permissions, total] = await this.permissionRepository.findAndCount({
      order: { resource: 'ASC', action: 'ASC' },
      skip,
      take: limit,
    });

    return createPaginationResult(permissions, total, query);
  }
}
