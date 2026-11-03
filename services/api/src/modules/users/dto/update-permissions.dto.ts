import { Type } from 'class-transformer';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
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
  @ArrayMinSize(Object.values(ModuleName).length)
  @ArrayMaxSize(Object.values(ModuleName).length)
  @ValidateNested({ each: true })
  @Type(() => PermissionEntryDto)
  permissions: PermissionEntryDto[];

  @IsOptional()
  @IsString()
  @Matches(/^[a-f\d]{64}$/i)
  baseVersion?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(300)
  reason?: string;
}
