import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { ICurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Permissions } from './permissions/permissions.constants';
import { RequirePermissions } from './permissions/decorators/permissions.decorator';
import { PermissionsGuard } from './permissions/guards/permissions.guard';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { AdminUsersService } from './admin-users.service';
import { InviteUserDto } from './dto/invite-user.dto';
import { AssignUserRolesDto } from './dto/assign-user-roles.dto';

@Controller('admin/users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  @RequirePermissions(Permissions.UsersRead)
  list(@Query() query: PaginationQueryDto) {
    return this.adminUsersService.list(query);
  }

  @Get(':id')
  @RequirePermissions(Permissions.UsersRead)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminUsersService.findOne(id);
  }

  @Post('invitations')
  @RequirePermissions(Permissions.UsersInvite)
  invite(@CurrentUser() actor: ICurrentUser, @Body() dto: InviteUserDto) {
    return this.adminUsersService.invite(actor.id, dto);
  }

  @Post(':id/resend-invitation')
  @RequirePermissions(Permissions.UsersInvite)
  resendInvitation(
    @CurrentUser() actor: ICurrentUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.adminUsersService.resendInvitation(actor.id, id);
  }

  @Post(':id/roles')
  @RequirePermissions(Permissions.UserRolesManage)
  assignRoles(
    @CurrentUser() actor: ICurrentUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignUserRolesDto,
  ) {
    return this.adminUsersService.assignRoles(actor.id, id, dto);
  }

  @Delete(':id/roles/:roleKey')
  @RequirePermissions(Permissions.UserRolesManage)
  removeRole(
    @CurrentUser() actor: ICurrentUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('roleKey') roleKey: string,
  ) {
    return this.adminUsersService.removeRole(actor.id, id, roleKey);
  }

  @Post(':id/disable')
  @RequirePermissions(Permissions.UsersDisable)
  disable(
    @CurrentUser() actor: ICurrentUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.adminUsersService.disable(actor.id, id);
  }
}
