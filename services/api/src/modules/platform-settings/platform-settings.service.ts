import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../common/interfaces';
import { AuditService } from '../audit/audit.service';
import { UpdatePlatformSettingsDto } from './dto/update-platform-settings.dto';
import { PlatformSetting } from './entities/platform-setting.entity';

/**
 * What the rest of the application sees. The kill-switch has already been
 * applied here, so no caller has to remember to check it.
 */
export interface EffectiveSettings {
  shippingEnabled: boolean;
  freeDeliveryThreshold: number | null;
  quoteExpiryMinutes: number;
  vatEnabled: boolean;
  vatRatePercent: number;
  pricesIncludeVat: boolean;
  deliveryTaxable: boolean;
  /** Master coupon switch. Off until an operator turns it on. */
  couponsEnabled: boolean;
}

const SETTINGS_ROW_ID = 1;

/**
 * Reads and edits the platform settings row.
 *
 * The row is tiny and read on nearly every quote, so it is cached in memory and
 * the cache is dropped the moment a setting is edited. The env kill-switch is
 * merged on the way out rather than stored, so an operator who has turned a
 * feature on in the dashboard can still be stopped in an emergency without a
 * redeploy and without touching the database.
 */
@Injectable()
export class PlatformSettingsService {
  private readonly logger = new Logger(PlatformSettingsService.name);
  private cached: EffectiveSettings | null = null;

  constructor(
    @InjectRepository(PlatformSetting)
    private readonly repo: Repository<PlatformSetting>,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  /** True when the environment has switched a feature off regardless of the row. */
  private killSwitched(name: string): boolean {
    const raw = this.config.get<string>(name);
    return raw === 'true' || raw === '1';
  }

  private toEffective(row: PlatformSetting): EffectiveSettings {
    return {
      shippingEnabled: row.shippingEnabled && !this.killSwitched('CHECKOUT_SHIPPING_KILL_SWITCH'),
      freeDeliveryThreshold: row.freeDeliveryThreshold,
      quoteExpiryMinutes: row.quoteExpiryMinutes,
      vatEnabled: row.vatEnabled && !this.killSwitched('CHECKOUT_VAT_KILL_SWITCH'),
      vatRatePercent: row.vatRatePercent,
      pricesIncludeVat: row.pricesIncludeVat,
      deliveryTaxable: row.deliveryTaxable,
      couponsEnabled: row.couponsEnabled && !this.killSwitched('COUPONS_KILL_SWITCH'),
    };
  }

  /** The settings as they should be enforced, kill-switch included. */
  async get(): Promise<EffectiveSettings> {
    if (this.cached) return this.cached;
    let row = await this.repo.findOne({ where: { id: SETTINGS_ROW_ID } });
    if (!row) {
      row = await this.repo.save(this.repo.create({ id: SETTINGS_ROW_ID }));
    }
    this.cached = this.toEffective(row);
    return this.cached;
  }

  /** Drops the cache. Called on every edit; exposed for tests. */
  invalidate(): void {
    this.cached = null;
  }

  /**
   * Applies a partial edit, records who changed what and why, then invalidates
   * so the next read sees it. The audit write happens before the cache is
   * dropped, so a failed audit never leaves an unlogged live setting.
   */
  async update(
    dto: UpdatePlatformSettingsDto,
    actor: AuthenticatedUser,
  ): Promise<EffectiveSettings> {
    const before = await this.get();

    const row = await this.repo.findOneOrFail({ where: { id: SETTINGS_ROW_ID } });
    if (dto.shippingEnabled !== undefined) row.shippingEnabled = dto.shippingEnabled;
    if (dto.freeDeliveryThreshold !== undefined) {
      row.freeDeliveryThreshold =
        dto.freeDeliveryThreshold === null ? null : dto.freeDeliveryThreshold;
    }
    if (dto.quoteExpiryMinutes !== undefined) row.quoteExpiryMinutes = dto.quoteExpiryMinutes;
    if (dto.vatEnabled !== undefined) row.vatEnabled = dto.vatEnabled;
    if (dto.vatRatePercent !== undefined) row.vatRatePercent = dto.vatRatePercent;
    if (dto.pricesIncludeVat !== undefined) row.pricesIncludeVat = dto.pricesIncludeVat;
    if (dto.deliveryTaxable !== undefined) row.deliveryTaxable = dto.deliveryTaxable;
    if (dto.couponsEnabled !== undefined) row.couponsEnabled = dto.couponsEnabled;
    row.updatedBy = actor.id;

    const saved = await this.repo.save(row);
    const after = this.toEffective(saved);

    await this.audit.record({
      actorId: actor.id,
      action: 'platform_settings.update',
      beforeState: { reason: dto.reason, settings: before },
      afterState: { settings: after },
    });

    this.invalidate();
    this.logger.log(`platform settings updated by ${actor.id}`);
    return after;
  }
}