import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  PERMISSIONS_KEY,
  PERMISSION_MODE_KEY,
  PermissionKey,
} from '../permissions.constants';
import { PermissionMode } from '../decorators/permissions.decorator';
import { PermissionsService } from '../permissions.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<PermissionKey[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required?.length) return true;

    const request = context.switchToHttp().getRequest<{
      user?: { id?: string; sub?: string };
    }>();
    const userId = request.user?.id ?? request.user?.sub;
    if (!userId) throw new UnauthorizedException();

    const mode =
      this.reflector.getAllAndOverride<PermissionMode>(PERMISSION_MODE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'all';

    const allowed =
      mode === 'any'
        ? await this.permissionsService.hasAny(userId, required)
        : await this.permissionsService.hasAll(userId, required);

    if (!allowed) {
      throw new ForbiddenException({
        code: 'MISSING_PERMISSION',
        message: 'Bạn không có quyền thực hiện thao tác này',
      });
    }

    return true;
  }
}
