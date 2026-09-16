import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Brackets, DataSource, EntityManager, In } from 'typeorm';
import { User, UserStatus } from '../users/entities/user.entity';
import { ActionToken, TokenType } from '../auth/entities/action-token.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { Role } from './roles/entities/role.entity';
import { UserRoleAssignment } from './roles/entities/user-role-assignment.entity';
import { AuthorizationAuditLog } from './roles/entities/authorization-audit-log.entity';
import { TokenUtil } from '../../common/utils/token.util';
import { InviteUserDto } from './dto/invite-user.dto';
import { AssignUserRolesDto } from './dto/assign-user-roles.dto';
import {
  createPaginationResult,
  PaginationQueryDto,
} from '../../common/dto/pagination.dto';
import {
  EMAIL_PROVIDER_TOKEN,
  type EmailProvider,
} from '../../platform/email/email-provider.interface';
import { EmailTemplateService } from '../../platform/email/templates/email-template.service';

const ACTIVATION_TTL_MS = 48 * 60 * 60 * 1000;

@Injectable()
export class AdminUsersService {
  private readonly logger = new Logger(AdminUsersService.name);

  constructor(
    private readonly dataSource: DataSource,
    @Inject(EMAIL_PROVIDER_TOKEN)
    private readonly emailProvider: EmailProvider,
    private readonly templateService: EmailTemplateService,
  ) {}

  async list(query: PaginationQueryDto = new PaginationQueryDto()) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const [users, total] = await this.dataSource
      .getRepository(User)
      .findAndCount({
        relations: { roleAssignments: { role: true } },
        order: { createdAt: 'DESC' },
        skip,
        take: limit,
      });

    return createPaginationResult(
      users.map((user) => this.toResponse(user)),
      total,
      query,
    );
  }

  async findOne(id: string) {
    const user = await this.dataSource.getRepository(User).findOne({
      where: { id },
      relations: { roleAssignments: { role: true } },
    });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    return this.toResponse(user);
  }

  async invite(actorId: string, dto: InviteUserDto) {
    const email = dto.email.trim().toLowerCase();
    const name = dto.name.trim();
    const roleKeys = [
      ...new Set(dto.roleKeys.map((k) => k.trim().toLowerCase())),
    ];

    const { user, rawToken } = await this.dataSource.transaction(
      async (manager) => {
        const existing = await manager.getRepository(User).findOne({
          where: { email },
        });
        if (existing) {
          throw new ConflictException('Email đã tồn tại trên hệ thống');
        }

        const roles = await manager.getRepository(Role).find({
          where: { key: In(roleKeys), isActive: true },
        });
        if (roles.length !== roleKeys.length) {
          throw new BadRequestException(
            'Một hoặc nhiều role không tồn tại hoặc đã bị vô hiệu hóa',
          );
        }

        const created = manager.getRepository(User).create({
          email,
          name,
          status: UserStatus.PENDING,
          passwordHash: null,
        });
        const savedUser = await manager.getRepository(User).save(created);

        await manager.getRepository(UserRoleAssignment).save(
          roles.map((role) =>
            manager.getRepository(UserRoleAssignment).create({
              userId: savedUser.id,
              roleId: role.id,
              assignedById: actorId,
              expiresAt: null,
            }),
          ),
        );

        const token = TokenUtil.generateRawToken();
        await manager.getRepository(ActionToken).save(
          manager.getRepository(ActionToken).create({
            tokenHash: TokenUtil.hashToken(token),
            type: TokenType.ACCOUNT_ACTIVATION,
            userId: savedUser.id,
            expiresAt: new Date(Date.now() + ACTIVATION_TTL_MS),
            usedAt: null,
          }),
        );

        await manager.getRepository(AuthorizationAuditLog).save({
          actorId,
          action: 'user.invited',
          targetType: 'user',
          targetId: savedUser.id,
          metadata: { roleKeys: roles.map((r) => r.key) },
        });

        return { user: savedUser, rawToken: token };
      },
    );

    const sendSuccess = await this.sendInvitationEmail(
      user.id,
      user.email,
      user.name,
      rawToken,
    );
    const invitedUser = await this.findOne(user.id);

    return {
      message: sendSuccess
        ? 'Tạo lời mời người dùng thành công'
        : 'Tạo người dùng thành công nhưng gửi email mời thất bại. Vui lòng sử dụng tính năng gửi lại lời mời.',
      user: invitedUser,
    };
  }

  async resendInvitation(actorId: string, userId: string) {
    const { user, rawToken } = await this.dataSource.transaction(
      async (manager) => {
        const targetUser = await manager.getRepository(User).findOne({
          where: { id: userId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!targetUser) {
          throw new NotFoundException('Không tìm thấy người dùng');
        }
        if (
          targetUser.status !== UserStatus.PENDING ||
          targetUser.passwordHash
        ) {
          throw new ConflictException(
            'Tài khoản không ở trạng thái chờ kích hoạt',
          );
        }

        await manager
          .getRepository(ActionToken)
          .createQueryBuilder()
          .update()
          .set({ usedAt: new Date() })
          .where('user_id = :userId', { userId: targetUser.id })
          .andWhere('type = :type', { type: TokenType.ACCOUNT_ACTIVATION })
          .andWhere('"usedAt" IS NULL')
          .execute();

        const token = TokenUtil.generateRawToken();
        await manager.getRepository(ActionToken).save(
          manager.getRepository(ActionToken).create({
            tokenHash: TokenUtil.hashToken(token),
            type: TokenType.ACCOUNT_ACTIVATION,
            userId: targetUser.id,
            expiresAt: new Date(Date.now() + ACTIVATION_TTL_MS),
            usedAt: null,
          }),
        );

        await manager.getRepository(AuthorizationAuditLog).save({
          actorId,
          action: 'user.invitation_resent',
          targetType: 'user',
          targetId: targetUser.id,
          metadata: {},
        });

        return { user: targetUser, rawToken: token };
      },
    );

    const sendSuccess = await this.sendInvitationEmail(
      user.id,
      user.email,
      user.name,
      rawToken,
    );

    return {
      message: sendSuccess
        ? 'Gửi lại email mời kích hoạt thành công'
        : 'Cấp lại token thành công nhưng gửi email thất bại. Vui lòng thử lại.',
    };
  }

  async assignRoles(actorId: string, userId: string, dto: AssignUserRolesDto) {
    const roleKeys = [
      ...new Set(dto.roleKeys.map((k) => k.trim().toLowerCase())),
    ];

    await this.dataSource.transaction(async (manager) => {
      const user = await manager.getRepository(User).findOne({
        where: { id: userId },
      });
      if (!user) throw new NotFoundException('Không tìm thấy người dùng');

      const roles = await manager.getRepository(Role).find({
        where: { key: In(roleKeys), isActive: true },
      });
      if (roles.length !== roleKeys.length) {
        throw new BadRequestException(
          'Một hoặc nhiều role không tồn tại hoặc đã bị vô hiệu hóa',
        );
      }

      const existingAssignments = await manager
        .getRepository(UserRoleAssignment)
        .find({ where: { userId } });
      const existingRoleIdSet = new Set(
        existingAssignments.map((a) => a.roleId),
      );

      const newAssignments = roles
        .filter((r) => !existingRoleIdSet.has(r.id))
        .map((role) =>
          manager.getRepository(UserRoleAssignment).create({
            userId,
            roleId: role.id,
            assignedById: actorId,
            expiresAt: null,
          }),
        );

      if (newAssignments.length > 0) {
        await manager.getRepository(UserRoleAssignment).save(newAssignments);
      }

      await manager.getRepository(AuthorizationAuditLog).save({
        actorId,
        action: 'user.roles_assigned',
        targetType: 'user',
        targetId: userId,
        metadata: { roleKeys },
      });
    });

    const updated = await this.findOne(userId);
    return {
      message: 'Gán vai trò thành công',
      roles: updated.roles,
    };
  }

  async removeRole(actorId: string, userId: string, rawRoleKey: string) {
    const roleKey = rawRoleKey.trim().toLowerCase();

    if (actorId === userId && roleKey === 'admin') {
      throw new ForbiddenException(
        'Không thể tự thu hồi vai trò admin của chính mình',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      const user = await manager.getRepository(User).findOne({
        where: { id: userId },
      });
      if (!user) throw new NotFoundException('Không tìm thấy người dùng');

      const role = await manager.getRepository(Role).findOne({
        where: { key: roleKey, isActive: true },
      });
      if (!role) throw new NotFoundException('Không tìm thấy vai trò');

      if (roleKey === 'admin') {
        const activeAdmins = await this.getActiveAdminIds(manager);
        if (activeAdmins.includes(userId) && activeAdmins.length <= 1) {
          throw new ConflictException(
            'Không thể thu hồi vai trò của quản trị viên hoạt động cuối cùng',
          );
        }
      }

      const assignment = await manager
        .getRepository(UserRoleAssignment)
        .findOne({ where: { userId, roleId: role.id } });

      if (assignment) {
        await manager.getRepository(UserRoleAssignment).remove(assignment);
      }

      await manager.getRepository(AuthorizationAuditLog).save({
        actorId,
        action: 'user.role_revoked',
        targetType: 'user',
        targetId: userId,
        metadata: { roleKey },
      });
    });

    return { message: 'Thu hồi vai trò thành công' };
  }

  async disable(actorId: string, userId: string) {
    if (actorId === userId) {
      throw new ForbiddenException(
        'Không thể tự vô hiệu hóa tài khoản của chính mình',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      const user = await manager.getRepository(User).findOne({
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) throw new NotFoundException('Không tìm thấy người dùng');

      if (user.status === UserStatus.INACTIVE) {
        return;
      }

      const activeAdmins = await this.getActiveAdminIds(manager);
      if (activeAdmins.includes(userId) && activeAdmins.length <= 1) {
        throw new ConflictException(
          'Không thể vô hiệu hóa quản trị viên hoạt động cuối cùng',
        );
      }

      user.status = UserStatus.INACTIVE;
      await manager.getRepository(User).save(user);

      await manager
        .getRepository(RefreshToken)
        .createQueryBuilder()
        .update(RefreshToken)
        .set({ revokedAt: new Date() })
        .where('"userId" = :userId', { userId })
        .andWhere('"revokedAt" IS NULL')
        .execute();

      await manager.getRepository(AuthorizationAuditLog).save({
        actorId,
        action: 'user.disabled',
        targetType: 'user',
        targetId: userId,
        metadata: { userId },
      });
    });

    return { message: 'Vô hiệu hóa tài khoản thành công' };
  }

  private async getActiveAdminIds(manager: EntityManager): Promise<string[]> {
    const rows = await manager
      .getRepository(User)
      .createQueryBuilder('u')
      .innerJoin('u.roleAssignments', 'ur')
      .innerJoin('ur.role', 'r', 'r.isActive = true')
      .where("r.key = 'admin'")
      .andWhere("u.status = 'active'")
      .andWhere(
        new Brackets((qb) => {
          qb.where('ur.expiresAt IS NULL').orWhere(
            'ur.expiresAt > CURRENT_TIMESTAMP',
          );
        }),
      )
      .setLock('pessimistic_write')
      .select('u.id', 'id')
      .getRawMany<{ id: string }>();

    return rows.map((row) => row.id);
  }

  private async sendInvitationEmail(
    userId: string,
    email: string,
    name: string,
    token: string,
  ): Promise<boolean> {
    try {
      const { subject, html } = this.templateService.renderAccountInvitation({
        email,
        name,
        token,
      });
      const result = await this.emailProvider.sendEmail({
        to: email,
        subject,
        html,
      });
      if (!result.success) {
        this.logger.error(
          `Gửi email kích hoạt tài khoản thất bại cho user ${userId}: ${result.error}`,
        );
        return false;
      }
      return true;
    } catch (error) {
      this.logger.error(
        `Lỗi ngoại lệ khi gửi email kích hoạt cho user ${userId}`,
        error instanceof Error ? error.stack : error,
      );
      return false;
    }
  }

  private toResponse(user: User) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status,
      roles:
        user.roleAssignments?.map((assignment) => assignment.role.key) ?? [],
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
