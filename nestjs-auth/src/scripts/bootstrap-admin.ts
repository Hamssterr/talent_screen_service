import { config } from 'dotenv';
import * as bcrypt from 'bcrypt';
import { AppDataSource } from '../database/data-source';
import { User, UserStatus } from '../modules/users/entities/user.entity';
import { Role } from '../modules/admin/roles/entities/role.entity';
import { UserRoleAssignment } from '../modules/admin/roles/entities/user-role-assignment.entity';
import { AuthorizationAuditLog } from '../modules/admin/roles/entities/authorization-audit-log.entity';

config();

async function bootstrapAdmin() {
  const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  const name = process.env.INITIAL_ADMIN_NAME?.trim() || 'Administrator';

  if (!email || !password || password.length < 8) {
    throw new Error(
      'Cần INITIAL_ADMIN_EMAIL và INITIAL_ADMIN_PASSWORD có ít nhất 8 ký tự',
    );
  }

  await AppDataSource.initialize();
  try {
    await AppDataSource.transaction(async (manager) => {
      const adminRole = await manager.getRepository(Role).findOne({
        where: { key: 'admin', isActive: true },
      });
      if (!adminRole) {
        throw new Error('Chưa có role admin. Hãy chạy migration trước.');
      }

      let user = await manager
        .getRepository(User)
        .createQueryBuilder('user')
        .addSelect('user.passwordHash')
        .where('LOWER(user.email) = :email', { email })
        .getOne();

      if (!user) {
        user = manager.getRepository(User).create({
          email,
          name,
          passwordHash: await bcrypt.hash(password, 12),
          status: UserStatus.ACTIVE,
        });
      } else {
        if (!user.passwordHash)
          user.passwordHash = await bcrypt.hash(password, 12);
        user.status = UserStatus.ACTIVE;
      }
      user = await manager.getRepository(User).save(user);

      await manager.getRepository(UserRoleAssignment).upsert(
        {
          userId: user.id,
          roleId: adminRole.id,
          assignedById: null,
          expiresAt: null,
        },
        ['userId', 'roleId'],
      );
      await manager.getRepository(AuthorizationAuditLog).save({
        actorId: null,
        action: 'system.admin_bootstrapped',
        targetType: 'user',
        targetId: user.id,
        metadata: { email },
      });
    });
    console.log(
      'Admin bootstrap hoàn tất. Hãy xóa INITIAL_ADMIN_PASSWORD khỏi env.',
    );
  } finally {
    await AppDataSource.destroy();
  }
}

bootstrapAdmin().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
