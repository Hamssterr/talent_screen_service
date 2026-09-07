import { applyDecorators, SetMetadata } from '@nestjs/common';
import {
  PERMISSIONS_KEY,
  PERMISSION_MODE_KEY,
  PermissionKey,
} from '../permissions.constants';

export type PermissionMode = 'all' | 'any';

export const RequirePermissions = (...permissions: PermissionKey[]) =>
  applyDecorators(
    SetMetadata(PERMISSIONS_KEY, permissions),
    SetMetadata(PERMISSION_MODE_KEY, 'all' satisfies PermissionMode),
  );

export const RequireAnyPermission = (...permissions: PermissionKey[]) =>
  applyDecorators(
    SetMetadata(PERMISSIONS_KEY, permissions),
    SetMetadata(PERMISSION_MODE_KEY, 'any' satisfies PermissionMode),
  );
