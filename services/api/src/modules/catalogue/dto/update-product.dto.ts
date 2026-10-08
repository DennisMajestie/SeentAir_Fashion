import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUrl, IsUUID, Min, ValidateIf } from 'class-validator';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** When provided it must be a known category; omit it to leave the value alone. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  category?: string;

  /** Changing price requires an approved PRICE_CHANGE request (server-side gate). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  basePrice?: number;

  @IsOptional()
  @IsUUID()
  collectionId?: string;

  /**
   * Change or clear the product photo. Send `null` to remove it (surfaces drop
   * back to a variant image or the placeholder); omit the field to leave the
   * current photo alone. `ValidateIf` lets `null` through the IsUrl check.
   */
  @IsOptional()
  @ValidateIf((o) => o.primaryImageUrl !== null)
  @IsUrl({ require_tld: false })
  primaryImageUrl?: string | null;

  @IsOptional()
  @IsUUID()
  approvalRequestId?: string;
}
