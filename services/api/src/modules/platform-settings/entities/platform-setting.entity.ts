import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { numericTransformer } from '../../../common/numeric.transformer';

/**
 * The single row of platform settings (see the CreatePlatformSettings
 * migration). Always read it through PlatformSettingsService, never directly:
 * the service merges the env kill-switch on top and caches the result, so a
 * direct repository read could disagree with what the application enforces.
 */
@Entity('platform_settings')
export class PlatformSetting {
  /** Always 1. The check constraint in the migration enforces it. */
  @PrimaryColumn({ type: 'integer' })
  id: number;

  /** Master switch for delivery fees. Off by default: nothing extra is charged. */
  @Column({ name: 'shipping_enabled', type: 'boolean', default: false })
  shippingEnabled: boolean;

  /** Spend at or above this ships free. Null means no free-delivery offer. */
  @Column({
    name: 'free_delivery_threshold',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  freeDeliveryThreshold: number | null;

  /** How long a delivery quote stays usable. */
  @Column({ name: 'quote_expiry_minutes', type: 'integer', default: 1440 })
  quoteExpiryMinutes: number;

  @Column({ name: 'vat_enabled', type: 'boolean', default: false })
  vatEnabled: boolean;

  /** Percent, 0-100. Constrained in the database as well as the DTO. */
  @Column({
    name: 'vat_rate_percent',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  vatRatePercent: number;

  @Column({ name: 'prices_include_vat', type: 'boolean', default: false })
  pricesIncludeVat: boolean;

  @Column({ name: 'delivery_taxable', type: 'boolean', default: false })
  deliveryTaxable: boolean;

  /** Master coupon switch. Requires the logistics FULL level to change. */
  @Column({ name: 'coupons_enabled', type: 'boolean', default: false })
  couponsEnabled: boolean;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;
}