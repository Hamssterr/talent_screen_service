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
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { ICurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesService } from './roles.service';
import { Permissions } from '../permissions/permissions.constants';
import { RequirePermissions } from '../permissions/decorators/permissions.decorator';
import { PermissionsGuard } from '../permissions/guards/permissions.guard';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { ResponseMessage } from '../../../common/decorators/response-message.decorator';
import { BulkRolePermissionsDto } from './dto/bulk-role-permissions.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RolesController {
  constructor(private readonly service: RolesService) {}

  @Get('roles')
  @RequirePermissions(Permissions.RolesRead)
  @ResponseMessage('Lấy danh sách role thành công')
  listRoles(@Query() query: PaginationQueryDto) {
    return this.service.listRoles(query);
  }

  @Post('roles')
  @RequirePermissions(Permissions.RolesCreate)
  @ResponseMessage('Tạo role mới thành công')
  createRole(@CurrentUser() actor: ICurrentUser, @Body() dto: CreateRoleDto) {
    return this.service.createRole(actor.id, dto);
  }

  @Post('roles/:roleId/permissions')
  @RequirePermissions(Permissions.RolePermissionsManage)
  @ResponseMessage('Cấp quyền cho role thành công')
  grantPermissions(
    @CurrentUser() actor: ICurrentUser,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Body() dto: UpdateRolePermissionsDto,
  ) {
    return this.service.grantPermissions(actor.id, roleId, dto.permissionKeys);
  }

  @Delete('roles/:roleId/permissions/:permissionKey')
  @RequirePermissions(Permissions.RolePermissionsManage)
  @ResponseMessage('Thu hồi quyền khỏi role thành công')
  revokePermission(
    @CurrentUser() actor: ICurrentUser,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Param('permissionKey') permissionKey: string,
  ) {
    return this.service.revokePermission(actor.id, roleId, permissionKey);
  }

  @Post('role-permissions/bulk')
  @RequirePermissions(Permissions.RolePermissionsManage)
  @ResponseMessage('Cập nhật quyền thành công')
  mutatePermissions(
    @CurrentUser() actor: ICurrentUser,
    @Body() dto: BulkRolePermissionsDto,
  ) {
    return this.service.mutatePermissions(actor.id, dto);
  }

  @Get('audit-logs')
  @RequirePermissions(Permissions.AuditRead)
  listAuditLogs(@Query() query: PaginationQueryDto) {
    return this.service.listAuditLogs(query);
  }
}
