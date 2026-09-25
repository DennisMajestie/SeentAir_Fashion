import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Min,
} from 'class-validator';
import { AvailabilityStatus } from '../entities/product-variant.entity';

export class CreateVariantDto {
  @IsOptional()
  @IsString()
  size?: string;

  @IsOptional()
  @IsString()
  colour?: string;

  @IsString()
  @IsNotEmpty()
  sku: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  priceOverride?: number;

  @IsOptional()
  @IsUrl({ require_tld: false })
  imageUrl?: string;

  @IsOptional()
  @IsEnum(AvailabilityStatus)
  availabilityStatus?: AvailabilityStatus;

  @IsOptional()
  @IsString()
  fitNote?: string;

  /** Graded pattern dimensions keyed by size. */
  @IsOptional()
  @IsObject()
  patternGeometry?: Record<string, unknown>;

  @IsOptional()
  @IsUrl({ require_tld: false })
  dxfUrl?: string;

  @IsOptional()
  @IsString()
  storageLocation?: string;
}
