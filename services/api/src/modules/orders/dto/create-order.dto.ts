import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { OrderChannel } from '../entities/order.entity';
import { ShippingAddressDto } from './shipping-address.dto';

export class OrderItemDto {
  @IsUUID()
  variantId: string;

  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  /** Staff only — customers/wholesalers get their channel from their role. */
  @IsOptional()
  @IsEnum(OrderChannel)
  channel?: OrderChannel;

  /** Staff only — attach an in-store order to a customer account (optional). */
  @IsOptional()
  @IsUUID()
  customerId?: string;

  /** Marketing source this sale came from (instagram, whatsapp, tiktok, direct, …). */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  source?: string;

  /** Delivery destination (address line, city, state, phone, …). */
  @IsOptional()
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress?: ShippingAddressDto;
}
