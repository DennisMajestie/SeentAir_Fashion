import { IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class UpdateTierDto {
  @IsOptional()
  @IsString()
  ruleDescription?: string;

  /** Changing a tier discount changes prices — requires an approved PRICE_CHANGE request. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @IsOptional()
  @IsUUID()
  approvalRequestId?: string;
}
