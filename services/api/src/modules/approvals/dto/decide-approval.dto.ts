import { IsIn } from 'class-validator';

export class DecideApprovalDto {
  @IsIn(['approved', 'rejected'])
  decision: 'approved' | 'rejected';
}
