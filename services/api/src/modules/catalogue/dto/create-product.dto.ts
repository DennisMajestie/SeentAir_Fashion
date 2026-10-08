import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUrl, IsUUID, Min } from 'class-validator';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** Required: chosen from the categories list, so the catalogue stays consistent. */
  @IsString()
  @IsNotEmpty()
  category: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  basePrice: number;

  @IsOptional()
  @IsUUID()
  collectionId?: string;

  /**
   * The product's own photograph (URL or resolvable path). Shown on listings,
   * rails, category pills and search results; the storefront falls back to a
   * variant image only when this is absent.
   */
  @IsOptional()
  @IsUrl({ require_tld: false })
  primaryImageUrl?: string;
}
