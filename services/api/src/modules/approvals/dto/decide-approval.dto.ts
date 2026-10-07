import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class DecideApprovalDto {
  @IsIn(['approved', 'rejected'])
  decision: 'approved' | 'rejected';

  /** Why the approver decided as they did. The admin UI requires it for rejections. */
  // An empty string means "no reason given": fold it to undefined so @IsOptional
  // skips it. Approving sends no reason, and without this the "" the client used
  // to send failed @IsNotEmpty and the decision was rejected with a 400.
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  justification?: string;
}
