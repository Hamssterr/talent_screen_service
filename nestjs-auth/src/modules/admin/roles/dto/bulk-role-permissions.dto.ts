import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';

export class BulkRolePermissionsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  roleIds: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/, { each: true })
  permissionKeys: string[];

  @IsIn(['grant', 'revoke'])
  mode: 'grant' | 'revoke';
}
