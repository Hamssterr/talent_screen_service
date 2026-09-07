import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Permission } from './entities/permission.entity';
import { Role } from '../roles/entities/role.entity';
import { UserRoleAssignment } from '../roles/entities/user-role-assignment.entity';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';
import { PermissionsGuard } from './guards/permissions.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Permission, Role, UserRoleAssignment])],
  controllers: [PermissionsController],
  providers: [PermissionsService, PermissionsGuard],
  exports: [PermissionsService, PermissionsGuard, TypeOrmModule],
})
export class PermissionsModule {}
