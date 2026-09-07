import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsString,
  Matches,
} from 'class-validator';

export class UpdateRolePermissionsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/, { each: true })
  permissionKeys: string[];
}
