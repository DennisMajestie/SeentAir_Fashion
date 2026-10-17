import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsInt, IsNumber, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { DeliveryMethod } from '../../orders/entities/order.entity';

export class QuoteLineDto {
  /**
   * The product's shipping band. Accepted as free text because it is only a
   * hint for picking a rate; an unknown value is treated as medium, never as an
   * error that would block a checkout.
   */
  @IsString()
  @MaxLength(20)
  sizeClass: string;

  @IsInt()
  @Min(1)
  @Max(999)
  quantity: number;
}

/**
 * A quote request. It carries quantities and bands only - no prices - because
 * the fee comes from the rate tables. `subtotal` exists solely to evaluate the
 * free-delivery threshold and cannot create a discount on its own.
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