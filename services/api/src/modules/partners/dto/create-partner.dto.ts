import { IsNumber, IsUUID, Max, Min } from 'class-validator';

export class CreatePartnerDto {
  /** Must be an existing user with the partner_investor role. */
  @IsUUID()
  userId: string;

  /** Share of TOTAL shares (all partners together ≤ 40%). */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(40)
  equityPercentage: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  investedAmount: number;
}
