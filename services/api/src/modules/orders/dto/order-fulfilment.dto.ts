import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class OrderFulfilmentDto {
  @IsOptional()
  @IsObject()
  shippingAddress?: Record<string, unknown>;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  grossWeightKg?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  palletRef?: string;

  /** Generate (and return) the QR stencil reference when true. */
  @IsOptional()
  @IsBoolean()
  generateQrStencil?: boolean;
}

export class FulfilmentResult {
  @IsOptional()
  qrStencilRef?: string;

  @ValidateNested()
  @Type(() => OrderFulfilmentDto)
  fulfilment!: OrderFulfilmentDto;
}