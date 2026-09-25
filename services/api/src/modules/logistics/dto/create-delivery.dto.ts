import { ArrayNotEmpty, IsArray, IsInt, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ConsignmentItemDto {
  @IsString()
  @IsNotEmpty()
  sku: string;

  @IsInt()
  @Min(1)
  quantity: number;
}

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

  /** Consignment contents — what travels on this leg. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConsignmentItemDto)
  contents?: ConsignmentItemDto[];

  @IsOptional()
  @IsString()
  driverName?: string;

  @IsOptional()
  @IsString()
  driverPhone?: string;
}
