import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class UpsertPricingDto {
  @IsString()
  @IsNotEmpty()
  zone: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  baseFee: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  pricePerKg: number;
}
