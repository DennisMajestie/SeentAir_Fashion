import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateDeliveryDto {
  @IsUUID()
  orderId: string;

  /** 'gigl' uses the GIGL API; anything else is a manual carrier name. */
  @IsString()
  @IsNotEmpty()
  carrier: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  legNumber?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  weightKg?: number;

  @IsOptional()
  @IsString()
  zone?: string;
}
