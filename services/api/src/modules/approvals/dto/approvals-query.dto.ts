import 'reflect-metadata';
import { IsEnum, IsOptional } from 'class-validator';
import { ApprovalActionType, ApprovalStatus } from '../../../common/enums';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

/** Whitelisted filters for the admin approval history list. */
export class ApprovalsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ApprovalStatus)
  status?: ApprovalStatus;

  @IsOptional()
  @IsEnum(ApprovalActionType)
  actionType?: ApprovalActionType;
}
