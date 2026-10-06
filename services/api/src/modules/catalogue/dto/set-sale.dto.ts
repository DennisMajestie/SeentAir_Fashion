import { IsDateString, IsNumber, IsUUID, Max, Min } from 'class-validator';
import { MAX_SALE_PERCENT } from '../sale-pricing';

/** Put a product on a timed sale. A sale is a price change, so it is approval-gated. */
export class SetSaleDto {
  /** Percentage off the normal retail price. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(MAX_SALE_PERCENT)
  percent: number;

  /** When the sale stops, ISO 8601. Required: a sale never runs open-ended. */
  @IsDateString()
  endsAt: string;

  /** The approved PRICE_CHANGE request that covers exactly this sale. */
  @IsUUID()
  approvalRequestId: string;
}
