import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { Permissions } from '../permissions/permissions.constants';
import { Permission } from '../permissions/entities/permission.entity';
import { Role } from './entities/role.entity';
import { RolePermission } from './entities/role-permission.entity';
import { AuthorizationAuditLog } from './entities/authorization-audit-log.entity';
import { CreateRoleDto } from './dto/create-role.dto';
import { BulkRolePermissionsDto } from './dto/bulk-role-permissions.dto';
import {
  createPaginationResult,
  PaginationQueryDto,
} from '../../../common/dto/pagination.dto';

const REQUIRED_ADMIN_PERMISSIONS = new Set<string>([
  Permissions.UsersInvite,
  Permissions.RolePermissionsManage,
  Permissions.UserRolesManage,
]);

@Injectable()
export class RolesService {
  constructor(private readonly dataSource: DataSource) {}

  async listRoles(query: PaginationQueryDto = new PaginationQueryDto()) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const [roles, total] = await this.dataSource
      .getRepository(Role)
      .findAndCount({
        relations: { rolePermissions: { permission: true } },
        order: { key: 'ASC' },
        skip,
        take: limit,
      });

    const items = roles.map((role) => ({
      id: role.id,
      key: role.key,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      isActive: role.isActive,
      version: role.version,
      permissions: role.rolePermissions
        .map((item) => item.permission.key)
        .sort(),
    }));

    return createPaginationResult(items, total, query);
  }

  async createRole(actorId: string, dto: CreateRoleDto) {
    const key = dto.key.trim().toLowerCase();
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Role);
      if (await repository.exists({ where: { key } })) {
        throw new ConflictException('Role key đã tồn tại');
      }
      const role = await repository.save(
        repository.create({
          key,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          isSystem: false,
          isActive: true,
        }),
      );
      await manager.getRepository(AuthorizationAuditLog).save({
        actorId,
        action: 'role.created',
        targetType: 'role',
        targetId: role.id,
        metadata: { key: role.key },
      });
      return role;
    });
  }

  async grantPermissions(
    actorId: string,
    roleId: string,
    permissionKeys: string[],
  ) {
    await this.mutatePermissions(actorId, {
      roleIds: [roleId],
      permissionKeys,
      mode: 'grant',
    });
    return this.findRole(roleId);
  }

  async revokePermission(
    actorId: string,
    roleId: string,
    permissionKey: string,
  ) {
    await this.mutatePermissions(actorId, {
      roleIds: [roleId],
      permissionKeys: [permissionKey],
      mode: 'revoke',
    });
    return this.findRole(roleId);
  }

  async mutatePermissions(actorId: string, dto: BulkRolePermissionsDto) {
    const roleIds = [...new Set(dto.roleIds)].sort();
    const permissionKeys = [...new Set(dto.permissionKeys)].sort();

    await this.dataSource.transaction(async (manager) => {
      const roles = await manager.getRepository(Role).find({
        where: { id: In(roleIds), isActive: true },
        order: { id: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });
      if (roles.length !== roleIds.length) {
        throw new BadRequestException('Có role không tồn tại hoặc đã bị tắt');
      }

      const permissions = await manager.getRepository(Permission).find({
        where: { key: In(permissionKeys), isActive: true },
      });
      if (permissions.length !== permissionKeys.length) {
        throw new BadRequestException(
          'Có permission không tồn tại hoặc đã bị tắt',
        );
      }

      if (
        dto.mode === 'revoke' &&
        roles.some((role) => role.key === 'admin') &&
        permissionKeys.some((key) => REQUIRED_ADMIN_PERMISSIONS.has(key))
      ) {
        throw new ConflictException(
          'Không thể thu hồi permission quản trị bắt buộc khỏi role admin',
        );
      }

      const rolePermissions = manager.getRepository(RolePermission);
      if (dto.mode === 'grant') {
        await rolePermissions.upsert(
          roles.flatMap((role) =>
            permissions.map((permission) => ({
              roleId: role.id,
              permissionId: permission.id,
              grantedById: actorId,
            })),
          ),
          ['roleId', 'permissionId'],
        );
      } else {
        await rolePermissions
          .createQueryBuilder()
          .delete()
          .where('role_id IN (:...roleIds)', { roleIds })
          .andWhere('permission_id IN (:...permissionIds)', {
            permissionIds: permissions.map((permission) => permission.id),
          })
          .execute();
      }

      await manager.getRepository(AuthorizationAuditLog).save({
        actorId,
        action:
          dto.mode === 'grant'
            ? 'role.permissions_granted'
            : 'role.permissions_revoked',
        targetType: 'role',
        targetId: roleIds.length === 1 ? roleIds[0] : null,
        metadata: { roleIds, permissionKeys },
      });
    });

    return { mode: dto.mode, roleIds, permissionKeys };
  }

  async listAuditLogs(query: PaginationQueryDto = new PaginationQueryDto()) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const [logs, total] = await this.dataSource
      .getRepository(AuthorizationAuditLog)
      .findAndCount({
        order: { createdAt: 'DESC' },
        skip,
        take: limit,
      });

    return createPaginationResult(logs, total, query);
  }

  private async findRole(roleId: string) {
    const role = await this.dataSource.getRepository(Role).findOne({
      where: { id: roleId },
      relations: { rolePermissions: { permission: true } },
    });
    if (!role) throw new NotFoundException('Không tìm thấy role');
    return {
      ...role,
      permissions: role.rolePermissions
        .map((item) => item.permission.key)
        .sort(),
      rolePermissions: undefined,
    };
  }
}
