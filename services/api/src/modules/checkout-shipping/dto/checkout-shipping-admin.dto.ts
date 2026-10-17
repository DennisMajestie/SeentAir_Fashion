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

export class CreateZoneDto {
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

export class UpdateZoneDto {
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

export class CreateRateDto {
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