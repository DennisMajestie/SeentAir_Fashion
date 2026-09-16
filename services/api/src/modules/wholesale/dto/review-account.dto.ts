import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { WholesaleAccountStatus } from '../entities/wholesale-account.entity';

export class ReviewAccountDto {
  @IsIn([WholesaleAccountStatus.APPROVED, WholesaleAccountStatus.REJECTED])
  status: WholesaleAccountStatus.APPROVED | WholesaleAccountStatus.REJECTED;

  /** Tier assignment is manual until Open Question #2 defines the criteria. */
  @IsOptional()
  @IsUUID()
  tierId?: string;
}
