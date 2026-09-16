import { IsEnum } from 'class-validator';
import { RoleName } from '../../../common/enums';

export class UpdateRoleDto {
  @IsEnum(RoleName)
  role: RoleName;
}
