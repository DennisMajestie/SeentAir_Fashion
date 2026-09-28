import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { ShippingAddressDto } from './shipping-address.dto';

export class OrderFulfilmentDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress?: ShippingAddressDto;

  /** Handover instructions for the waybill — "gate code, call on arrival".
      Deliberately separate from the address: it is not routable data. */
  @IsOptional()
  @IsString()
  deliveryNote?: string;

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
