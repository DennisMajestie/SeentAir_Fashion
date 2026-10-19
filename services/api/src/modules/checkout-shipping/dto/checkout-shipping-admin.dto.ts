import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DeliveryMethod } from '../../orders/entities/order.entity';
import { ProductSizeClass } from '../shipping-size-class';

/**
 * Required on every admin write that changes a price or a zone.
 *
 * The global ValidationPipe runs with `forbidNonWhitelisted`, so a DTO that
 * omits this field rejects the request outright rather than ignoring it - which
 * is why it has to be declared here and not merely accepted by the service.
 * It is stored with the audit entry, so an operator has to say why a price moved.
 */
class ReasonField {
  @IsString()
  @MaxLength(500)
  reason: string;
}

export class ZoneStateDto {
  /** Stable key from the canonical state list, e.g. 'lag'. */
  @IsString()
  @MaxLength(80)
  stateKey: string;

  /** Display name, e.g. 'Lagos'. */
  @IsString()
  @MaxLength(120)
  state: string;
}

export class CreateZoneDto extends ReasonField {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(36)
  @ValidateNested({ each: true })
  @Type(() => ZoneStateDto)
  states: ZoneStateDto[];
}

export class UpdateZoneDto extends ReasonField {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(36)
  @ValidateNested({ each: true })
  @Type(() => ZoneStateDto)
  states?: ZoneStateDto[];
}

export class RemoveZoneDto extends ReasonField {}

export class CreateRateDto extends ReasonField {
  @IsUUID()
  zoneId: string;

  @IsEnum(ProductSizeClass)
  sizeClass: ProductSizeClass;

  @IsEnum(DeliveryMethod)
  method: DeliveryMethod;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  fee: number;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
