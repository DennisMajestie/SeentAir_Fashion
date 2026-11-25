import { IsNotEmpty, IsNumber, IsString, IsUUID, Matches, Min } from 'class-validator';

export class CreateDistributionDto {
  /** e.g. '2026-Q3' */
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-Q[1-4]$/, { message: 'period must be a quarter, e.g. 2026-Q3' })
  period: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  totalProfit: number;

  /** Distributing profit moves funds — requires an approved request. */
  @IsUUID()
  approvalRequestId: string;
}
