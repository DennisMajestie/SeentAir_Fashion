import { IsOptional, IsString, IsObject, IsUrl, IsEnum } from 'class-validator';
import { AvailabilityStatus } from '../entities/product-variant.entity';

export class UpdateVariantDto {
  @IsOptional()
  @IsString()
  size?: string;

  @IsOptional()
  @IsString()
  colour?: string;

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