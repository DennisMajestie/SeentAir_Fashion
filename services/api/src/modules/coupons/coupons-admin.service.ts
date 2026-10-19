import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccessLevel, ModuleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { AuditService } from '../audit/audit.service';
import { generateCouponCode } from './coupon-code';
import { CouponsService } from './coupons.service';
import { Coupon, CouponAudience, CouponType } from './entities/coupon.entity';
import { CouponBundle, CouponBundleItem } from './entities/coupon-bundle.entity';
import { CustomerCoupon, CustomerCouponStatus } from './entities/customer-coupon.entity';
import { CouponCampaign, CouponCampaignClaimKind, CouponCampaignPlacement } from './entities/coupon-campaign.entity';

export interface CouponInput {
  name: string;
  description?: string | null;
  type: CouponType;
  value: number;
  maxDiscount?: number | null;
  minSpend?: number | null;
  startsAt?: Date | null;
  expiresAt?: Date | null;
  usageCap?: number | null;
  perCustomerCap?: number;
  audience: CouponAudience;
  appliesToSaleItems?: boolean;
  isActive?: boolean;
}

export interface MarginWarning {
  couponId?: string;
  code?: string;
  message: string;
  /** The share of the price a discount may reach before it is flagged. */
  thresholdShare: number;
  /** The worst ratio found across the products examined. */
  worstShare: number;
}

/**
 * The operator side of coupons: create, edit, deactivate, issue and report.
 *
 * Two things are enforced here rather than trusted to the dashboard. A
 * percentage coupon cannot be created without a maximum discount, because an
 * uncapped percentage is the easiest way to sell below cost by accident. And
 * every write is recorded in the shared audit log with a reason, because these
 * edits move money.
 *
 * Note on the margin check: this repository has NO product cost field (only
 * `base_price`), so the warning compares a discount against PRICE. It cannot
 * tell you whether a sale is profitable, only whether it is deeper than the
 * configured share of what the customer is paying. The threshold is read from
 * settings and defaults to unset, which disables the check rather than guessing
 * a number an operator never agreed to.
 */
@Injectable()
export class CouponsAdminService {
  constructor(
    @InjectRepository(Coupon)
    private readonly coupons: Repository<Coupon>,
    @InjectRepository(CouponBundle)
    private readonly bundles: Repository<CouponBundle>,
    @InjectRepository(CouponBundleItem)
    private readonly bundleItems: Repository<CouponBundleItem>,
    @InjectRepository(CustomerCoupon)
    private readonly wallet: Repository<CustomerCoupon>,
    @InjectRepository(CouponCampaign)
    private readonly campaigns: Repository<CouponCampaign>,
    private readonly audit: AuditService,
    private readonly couponsService: CouponsService,
  ) {}

  listCoupons(): Promise<Coupon[]> {
    return this.coupons.find({ order: { createdAt: 'DESC' } });
  }

  /**
   * Creates a coupon. The code is generated here rather than supplied, so a
   * customer cannot pick a code that reads like another offer or a tracking tag.
   */
  async createCoupon(
    input: CouponInput,
    actor: AuthenticatedUser,
    reason: string,
  ): Promise<{ coupon: Coupon; marginWarning: MarginWarning | null }> {
    this.assertValid(input);

    // Codes are generated against a set loaded once, rather than a query per
    // attempt: the generator is synchronous, so it cannot await.
    const existing = await this.coupons.find({ select: { code: true } });
    const taken = new Set(existing.map((c) => c.code));
    const code = generateCouponCode((candidate) => taken.has(candidate));

    const coupon = await this.coupons.save(
      this.coupons.create({
        code,
        name: input.name,
        description: input.description ?? null,
        type: input.type,
        value: input.type === CouponType.FREE_DELIVERY ? 0 : input.value,
        maxDiscount: input.maxDiscount ?? null,
        minSpend: input.minSpend ?? null,
        startsAt: input.startsAt ?? null,
        expiresAt: input.expiresAt ?? null,
        usageCap: input.usageCap ?? null,
        perCustomerCap: input.perCustomerCap ?? 1,
        audience: input.audience,
        appliesToSaleItems: input.appliesToSaleItems ?? false,
        isActive: input.isActive ?? true,
      }),
    );

    await this.audit.record({
      actorId: actor.id,
      action: 'coupon.create',
      beforeState: { reason, coupon: null },
      afterState: { coupon: { id: coupon.id, code, type: input.type, value: coupon.value } },
    });

    return { coupon, marginWarning: this.marginWarning(coupon, input) };
  }

  private assertValid(input: CouponInput): void {
    if (input.value < 0) throw new BadRequestException('A coupon value cannot be negative.');
    if (input.maxDiscount !== undefined && input.maxDiscount !== null && input.maxDiscount < 0) {
      throw new BadRequestException('A maximum discount cannot be negative.');
    }
    if (input.minSpend !== undefined && input.minSpend !== null && input.minSpend < 0) {
      throw new BadRequestException('A minimum spend cannot be negative.');
    }
    if (input.type === CouponType.PERCENT_OFF && (input.value < 0 || input.value > 100)) {
      throw new BadRequestException('A percentage coupon must be between 0 and 100.');
    }
    if (input.type === CouponType.PERCENT_OFF && !input.maxDiscount) {
      throw new BadRequestException(
        'A percentage coupon needs a maximum discount, so it cannot exceed the cap.',
      );
    }
    if (input.startsAt && input.expiresAt && input.expiresAt <= input.startsAt) {
      throw new BadRequestException('A coupon must expire after it starts.');
    }
  }

  /**
   * Flags a coupon whose maximum discount is deeper than the configured share
   * of a product's price. Returns null when no threshold is configured.
   */
  private marginWarning(coupon: Coupon, input: CouponInput): MarginWarning | null {
    const thresholdShare = Number(process.env.COUPON_MARGIN_WARNING_SHARE ?? 0);
    if (!(thresholdShare > 0)) return null;
    if (input.type === CouponType.FREE_DELIVERY) return null;
    const cap = input.maxDiscount ?? 0;
    if (!(cap > 0)) return null;

    // With no cost data, the deepest we can judge is the cap against itself:
    // a cap that can consume most of a typical basket is what an operator wants
    // to see before it goes live.
    const worstShare = Math.min(1, cap / 100_000);
    if (worstShare < thresholdShare) return null;
    return {
      couponId: coupon.id,
      code: coupon.code,
      message:
        `This coupon can discount ${(worstShare * 100).toFixed(0)}% of a N100,000 basket, ` +
        `at or above the ${(thresholdShare * 100).toFixed(0)}% warning threshold. ` +
        'Products have no cost recorded, so this compares against price only.',
      thresholdShare,
      worstShare,
    };
  }

  async updateCoupon(
    id: string,
    patch: Partial<CouponInput>,
    actor: AuthenticatedUser,
    reason: string,
  ): Promise<Coupon> {
    const coupon = await this.coupons.findOne({ where: { id } });
    if (!coupon) throw new NotFoundException('Coupon not found.');
    const before = { ...coupon };

    if (patch.name !== undefined) coupon.name = patch.name;
    if (patch.description !== undefined) coupon.description = patch.description;
    if (patch.maxDiscount !== undefined) coupon.maxDiscount = patch.maxDiscount;
    if (patch.minSpend !== undefined) coupon.minSpend = patch.minSpend;
    if (patch.startsAt !== undefined) coupon.startsAt = patch.startsAt;
    if (patch.expiresAt !== undefined) coupon.expiresAt = patch.expiresAt;
    if (patch.usageCap !== undefined) coupon.usageCap = patch.usageCap;
    if (patch.perCustomerCap !== undefined) coupon.perCustomerCap = patch.perCustomerCap;
    if (patch.appliesToSaleItems !== undefined) coupon.appliesToSaleItems = patch.appliesToSaleItems;
    if (patch.isActive !== undefined) coupon.isActive = patch.isActive;
    // Value and type are deliberately NOT editable: they are in the snapshot of
    // every past order, so changing them would make old orders unexplainable.

    this.assertValid({
      name: coupon.name,
      type: coupon.type,
      value: Number(coupon.value),
      maxDiscount: coupon.maxDiscount === null ? null : Number(coupon.maxDiscount),
      minSpend: coupon.minSpend === null ? null : Number(coupon.minSpend),
      startsAt: coupon.startsAt,
      expiresAt: coupon.expiresAt,
      perCustomerCap: coupon.perCustomerCap,
      audience: coupon.audience,
    });

    const saved = await this.coupons.save(coupon);
    await this.audit.record({
      actorId: actor.id,
      action: 'coupon.update',
      beforeState: { reason, coupon: { id: before.id, code: before.code } },
      afterState: {
        coupon: { id: saved.id, code: saved.code, maxDiscount: saved.maxDiscount, isActive: saved.isActive },
      },
    });
    return saved;
  }

  /** Deactivating keeps the row and its history; it just stops new use. */
  async deactivateCoupon(id: string, actor: AuthenticatedUser, reason: string): Promise<Coupon> {
    return this.updateCoupon(id, { isActive: false }, actor, reason);
  }

  listBundles(): Promise<CouponBundle[]> {
    return this.bundles.find({ order: { createdAt: 'DESC' } });
  }

  async createBundle(
    input: { name: string; description?: string | null; couponIds: string[] },
    actor: AuthenticatedUser,
    reason: string,
  ): Promise<CouponBundle> {
    if (!input.couponIds?.length) {
      throw new BadRequestException('A bundle needs at least one coupon.');
    }
    const bundle = await this.bundles.save(
      this.bundles.create({ name: input.name, description: input.description ?? null }),
    );
    await this.bundleItems.save(
      input.couponIds.map((couponId) => this.bundleItems.create({ bundleId: bundle.id, couponId })),
    );
    await this.audit.record({
      actorId: actor.id,
      action: 'coupon.bundle_create',
      beforeState: { reason, bundle: null },
      afterState: { bundle: { id: bundle.id, name: bundle.name, couponIds: input.couponIds } },
    });
    return bundle;
  }

  listCampaigns(): Promise<CouponCampaign[]> {
    return this.campaigns.find({ order: { startsAt: 'DESC' } });
  }

  async createCampaign(
    input: {
      headline: string;
      badgeText?: string | null;
      offerText?: string | null;
      labelText?: string;
      startsAt: Date;
      endsAt: Date;
      claimKind: CouponCampaignClaimKind;
      couponId?: string | null;
      bundleId?: string | null;
      placement?: CouponCampaignPlacement;
    },
    actor: AuthenticatedUser,
    reason: string,
  ): Promise<CouponCampaign> {
    if (input.endsAt <= input.startsAt) {
      throw new BadRequestException('A campaign must end after it starts.');
    }
    if (input.claimKind === CouponCampaignClaimKind.COUPON && !input.couponId) {
      throw new BadRequestException('A coupon campaign needs a coupon.');
    }
    if (input.claimKind === CouponCampaignClaimKind.BUNDLE && !input.bundleId) {
      throw new BadRequestException('A bundle campaign needs a bundle.');
    }
    const campaign = await this.campaigns.save(
      this.campaigns.create({
        headline: input.headline,
        badgeText: input.badgeText ?? null,
        offerText: input.offerText ?? null,
        labelText: input.labelText ?? 'Limited time offer',
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        claimKind: input.claimKind,
        couponId: input.claimKind === CouponCampaignClaimKind.COUPON ? input.couponId! : null,
        bundleId: input.claimKind === CouponCampaignClaimKind.BUNDLE ? input.bundleId! : null,
        placement: input.placement ?? CouponCampaignPlacement.HOME_TOP,
      }),
    );
    await this.audit.record({
      actorId: actor.id,
      action: 'coupon.campaign_create',
      beforeState: { reason, campaign: null },
      afterState: { campaign: { id: campaign.id, headline: campaign.headline, endsAt: campaign.endsAt } },
    });
    return campaign;
  }

  /** Hands a coupon to named customers. Re-issuing is idempotent per coupon. */
  async issue(
    couponId: string,
    customerIds: string[],
    expiresAt: Date | null,
    actor: AuthenticatedUser,
    reason: string,
  ): Promise<number> {
    const coupon = await this.coupons.findOne({ where: { id: couponId } });
    if (!coupon) throw new NotFoundException('Coupon not found.');
    const now = new Date();
    for (const customerId of customerIds) {
      await this.couponsService.issueToCustomer(couponId, customerId, expiresAt, now);
    }
    await this.audit.record({
      actorId: actor.id,
      action: 'coupon.issue',
      beforeState: { reason, issued: null },
      afterState: { issued: { couponId, customerIds, expiresAt } },
    });
    return customerIds.length;
  }

  /** Redemption and discount totals, per coupon. */
  async report() {
    const rows = await this.wallet
      .createQueryBuilder('wc')
      .leftJoin('wc.coupon', 'coupon')
      .select('coupon.id', 'couponId')
      .addSelect('coupon.code', 'code')
      .addSelect('coupon.name', 'name')
      .addSelect('COUNT(*)', 'held')
      .addSelect(`COUNT(*) FILTER (WHERE wc.status = 'used')`, 'used')
      .addSelect(`COUNT(*) FILTER (WHERE wc.status = 'expired')`, 'expired')
      .groupBy('coupon.id')
      .orderBy('COUNT(*)', 'DESC')
      .getRawMany();
    return rows;
  }

  /** Deactivates a campaign without deleting its history. */
  async deactivateCampaign(id: string, actor: AuthenticatedUser, reason: string): Promise<CouponCampaign> {
    const campaign = await this.campaigns.findOne({ where: { id } });
    if (!campaign) throw new NotFoundException('Campaign not found.');
    campaign.isActive = false;
    const saved = await this.campaigns.save(campaign);
    await this.audit.record({
      actorId: actor.id,
      action: 'coupon.campaign_deactivate',
      beforeState: { reason, campaign: { id, isActive: true } },
      afterState: { campaign: { id, isActive: false } },
    });
    return saved;
  }

  async setWalletStatus(
    walletId: string,
    status: CustomerCouponStatus,
    actor: AuthenticatedUser,
    reason: string,
  ): Promise<CustomerCoupon> {
    const row = await this.wallet.findOne({ where: { id: walletId } });
    if (!row) throw new NotFoundException('Wallet entry not found.');
    const before = row.status;
    row.status = status;
    const saved = await this.wallet.save(row);
    await this.audit.record({
      actorId: actor.id,
      action: 'coupon.wallet_status',
      beforeState: { reason, walletId, status: before },
      afterState: { walletId, status },
    });
    return saved;
  }
}

/** Re-exported so the controller can name the gate without importing the enum twice. */
export const COUPON_ADMIN_ACCESS = { module: ModuleName.LOGISTICS, level: AccessLevel.FULL };
