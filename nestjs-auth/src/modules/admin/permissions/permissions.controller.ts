import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { ICurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { Permissions } from './permissions.constants';
import { RequirePermissions } from './decorators/permissions.decorator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { PermissionsService } from './permissions.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get('admin/permissions')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.PermissionsRead)
  listPermissions(@Query() query: PaginationQueryDto) {
    return this.permissionsService.listPermissions(query);
  }

  @Get('authorization/me')
  async getMyAuthorization(@CurrentUser() user: ICurrentUser) {
    const [roles, permissions] = await Promise.all([
      this.permissionsService.getUserRoles(user.id),
      this.permissionsService.getEffectivePermissions(user.id),
    ]);

    return {
      success: true,
      data: {
        roles: roles.map((role) => role.key).sort(),
        permissions: [...permissions].sort(),
      },
    };
  }
}
