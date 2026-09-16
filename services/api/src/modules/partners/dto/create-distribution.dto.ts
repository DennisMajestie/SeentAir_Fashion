import { IsNotEmpty, IsNumber, IsString, IsUUID, Min } from 'class-validator';

export class CreateDistributionDto {
  /** e.g. '2026-Q3' */
  @IsString()
  @IsNotEmpty()
  period: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  totalProfit: number;

  /** Distributing profit moves funds — requires an approved request. */
  @IsUUID()
  approvalRequestId: string;
}
