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
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DeliveryMethod, OrderChannel } from '../entities/order.entity';
import { GuestContactDto } from './guest-contact.dto';
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

  /**
   * Delivery destination. Optional at this layer because a staff-recorded
   * in-store sale is handed over the counter and has nowhere to ship to; for
   * every retail and wholesale order OrdersService requires it, since GIGL
   * cannot route a parcel without one.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress?: ShippingAddressDto;

  /**
   * Guest checkout only — who to email and address the parcel to when there is
   * no account. Rejected when the request carries a JWT: a signed-in customer's
   * identity comes from the token, never the body.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => GuestContactDto)
  guest?: GuestContactDto;

  /**
   * Wholesale checkout: the buyer's requested fulfilment. Optional so every
   * other channel is unaffected; the wholesale portal sends it on every order.
   */
  @IsOptional()
  @IsEnum(DeliveryMethod)
  deliveryMethod?: DeliveryMethod;

  /**
   * Wholesale checkout: the buyer's free-text note for the factory desk.
   * Separate from deliveryNote, which staff write at pack-out.
   */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  customerNote?: string;
}
