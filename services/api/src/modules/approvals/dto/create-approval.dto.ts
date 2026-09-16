import { IsEnum, IsObject, IsOptional } from 'class-validator';
import { ApprovalActionType } from '../../../common/enums';

export class CreateApprovalDto {
  @IsEnum(ApprovalActionType)
  actionType: ApprovalActionType;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
