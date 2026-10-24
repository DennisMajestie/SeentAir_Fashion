import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { DeliveryMethod } from '../../orders/entities/order.entity';

export class QuoteLineDto {
  /**
   * Which variant is being bought. Stored with the quote so order creation can
   * prove it is the same basket it was quoted for - without it every order would
   * fail the mismatch check.
   */
  @IsUUID()
  variantId: string;

  /**
   * The product's shipping band. Accepted as free text because it is only a
   * hint for picking a rate; an unknown value is treated as medium, never as an
   * error that would block a checkout.
   */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  sizeClass?: string;

  @IsInt()
  @Min(1)
  @Max(999)
  quantity: number;

  /**
   * The unit price the shopper is looking at. A HINT, never a source of truth:
   * the fee comes from the rate tables, and order creation re-reads prices from
   * the catalogue and rejects the quote as stale if they no longer match. A
   * client that lies about this price can only cause its own order to fail
   * verification, never to be charged a chosen amount.
   */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice: number;
}

/**
 * A quote request. Size class is only a hint; known variants are classified by
 * the catalogue. `subtotal` exists solely to evaluate the free-delivery
 * threshold and cannot create a discount on its own.
 */
export class QuoteRequestDto {
  @IsString()
  @MaxLength(120)
  state: string;

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => QuoteLineDto)
  lines: QuoteLineDto[];

  @IsEnum(DeliveryMethod)
  method: DeliveryMethod;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  subtotal: number;
}