import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { Role } from './roles/entities/role.entity';
import { UserRoleAssignment } from './roles/entities/user-role-assignment.entity';
import { ActionToken } from '../auth/entities/action-token.entity';
import { AuthorizationAuditLog } from './roles/entities/authorization-audit-log.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { AuthModule } from '../auth/auth.module';
import { PermissionsModule } from './permissions/permissions.module';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Role,
      UserRoleAssignment,
      ActionToken,
      AuthorizationAuditLog,
      RefreshToken,
    ]),
    AuthModule,
    PermissionsModule,
  ],
  controllers: [AdminUsersController],
  providers: [AdminUsersService],
  exports: [AdminUsersService],
})
export class AdminModule {}
