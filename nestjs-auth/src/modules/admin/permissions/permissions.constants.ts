export const PERMISSIONS_KEY = 'required_permissions';
export const PERMISSION_MODE_KEY = 'permission_mode';

export const Permissions = {
  UsersRead: 'users:read',
  UsersInvite: 'users:invite',
  UsersUpdate: 'users:update',
  UsersDisable: 'users:disable',
  RolesRead: 'roles:read',
  RolesCreate: 'roles:create',
  RolesUpdate: 'roles:update',
  RolesDisable: 'roles:disable',
  PermissionsRead: 'permissions:read',
  RolePermissionsManage: 'role-permissions:manage',
  UserRolesManage: 'user-roles:manage',
  AuditRead: 'audit:read',
  JobsRead: 'jobs:read',
  JobsCreate: 'jobs:create',
  JobsUpdate: 'jobs:update',
  JobsClose: 'jobs:close',
  JobsManage: 'jobs:manage',
} as const;

export type PermissionKey = (typeof Permissions)[keyof typeof Permissions];

export const SYSTEM_ROLE_KEYS = ['admin', 'hr', 'user'] as const;
