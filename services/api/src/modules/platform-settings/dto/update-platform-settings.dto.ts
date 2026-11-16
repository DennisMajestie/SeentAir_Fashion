import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * A settings edit. Every field is optional so an operator can change one thing
 * without restating the rest, but `reason` is always required: a commercial
 * change to pricing or tax is exactly the kind of edit that has to be
 * explainable months later.
 */
export class UpdatePlatformSettingsDto {
  @IsOptional()
  @IsBoolean()
  shippingEnabled?: boolean;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  freeDeliveryThreshold?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60 * 24 * 30)
  quoteExpiryMinutes?: number;

  @IsOptional()
  @IsBoolean()
  vatEnabled?: boolean;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  vatRatePercent?: number;

  @IsOptional()
  @IsBoolean()
  pricesIncludeVat?: boolean;

  @IsOptional()
  @IsBoolean()
  deliveryTaxable?: boolean;

  /** Master coupon switch. Requires the logistics FULL level to change. */
  @IsOptional()
  @IsBoolean()
  couponsEnabled?: boolean;

  /**
   * The WhatsApp link customers use for assistance. Must be an http(s) URL
   * (wa.me / wa.link both qualify); an empty string clears it.
   */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  @Matches(/^https:\/\/\S+$/i, {
    message: 'supportWhatsappUrl must be a https link (for example https://wa.me/234…)',
  })
  supportWhatsappUrl?: string | null;

  @IsString()
  @MaxLength(500)
  reason: string;
}