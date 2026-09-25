import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class DecideApprovalDto {
  @IsIn(['approved', 'rejected'])
  decision: 'approved' | 'rejected';

  /** Why the approver decided as they did. The admin UI requires it for rejections. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  justification?: string;
}
