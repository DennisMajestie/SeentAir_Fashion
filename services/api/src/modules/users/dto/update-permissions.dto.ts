import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, ValidateNested } from 'class-validator';
import { AccessLevel, ModuleName } from '../../../common/enums';

export class PermissionEntryDto {
  @IsEnum(ModuleName)
  module: ModuleName;

  @IsEnum(AccessLevel)
  accessLevel: AccessLevel;
}

/** Replace the whole permission row set for a role (PUT semantics). */
export class UpdatePermissionsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PermissionEntryDto)
  permissions: PermissionEntryDto[];
}