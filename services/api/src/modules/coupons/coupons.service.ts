import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../common/interfaces';
import { computeTotals, toKobo } from '../orders/order-totals';
import { DeliveryMethod } from '../orders/entities/order.entity';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { CheckoutShippingService, QuoteOption, QuoteStatus } from '../checkout-shipping/checkout-shipping.service';
import { CouponAudience, CouponType } from './entities/coupon.entity';
import { CouponBundleItem } from './entities/coupon-bundle.entity';
import { CustomerCoupon, CustomerCouponSource, CustomerCouponStatus } from './entities/customer-coupon.entity';
import { CouponCampaign, campaignStatus } from './entities/coupon-campaign.entity';
import { normalizeCouponCode } from './coupon-code';
import { CouponTerms, RejectionCode, evaluateCoupons } from './coupon-rules';

/** One line as the storefront describes it: already priced, sale applied. */
export interface PreviewLine {
  variantId: string;
  productId: string;
  categoryIds: string[];
  quantity: number;
  unitPrice: number;
  isOnSale: boolean;
  taxExempt?: boolean;
}

export interface PreviewRequest {
  lines: PreviewLine[];
  state?: string;
  method?: DeliveryMethod;
  subtotal: number;
  /** A code the shopper is trying to use, if any. */
  code?: string;
}

export interface EligibleCouponView {
  couponId: string;
  code: string;
  name: string;
  type: CouponType;
  discount: number;
  rejection?: RejectionCode;
}

export interface PreviewResult {
  status: 'ok' | 'disabled';
  selected: { item: EligibleCouponView | null; freeDelivery: EligibleCouponView | null };
  eligible: EligibleCouponView[];
  /** Why a typed code could not be used. */
  codeRejection?: RejectionCode;
  /** How much more this customer must spend to unlock a coupon, in major units. */
  nudge: { spendMore: number; code: string } | null;
  totals: ReturnType<typeof computeTotals> | null;
  delivery: QuoteOption | null;
}

/**
 * Everything a signed-in shopper can do with a coupon, apart from spending one
 * on an order (the next session).
 *
 * Claims are idempotent by construction: each one is keyed by a deterministic
 * `claim_key`, and the database refuses a second row with the same key for the
 * same customer. Asking twice therefore returns the first wallet entry instead
 * of minting a duplicate.
 */
@Injectable()
export class CouponsService {
  constructor(
    @InjectRepository(CustomerCoupon)
    private readonly wallet: Repository<CustomerCoupon>,
    @InjectRepository(CouponBundleItem)
    private readonly bundleItems: Repository<CouponBundleItem>,
    @InjectRepository(CouponCampaign)
    private readonly campaigns: Repository<CouponCampaign>,
    private readonly settings: PlatformSettingsService,
    private readonly shipping: CheckoutShippingService,
  ) {}

  /**
   * Whether coupons may be claimed or previewed. Reads the shared settings row
   * and then the env kill-switch, which always wins, so a bad rollout can be
   * stopped without a redeploy.
   */
  async isEnabled(): Promise<boolean> {
    return (await this.settings.get()).couponsEnabled;
  }

  /** The wallet, newest first, split into the tabs the account page shows. */
  async walletFor(customerId: string, now: Date) {
    const rows = await this.wallet.find({
      where: { customerId },
      relations: { coupon: true },
      order: { claimedAt: 'DESC' },
    });
    // Expiry is derived on read so a lapsed wallet entry shows as expired
    // without a sweeper having to run first.
    for (const row of rows) {
      if (
        row.status === CustomerCouponStatus.AVAILABLE &&
        row.expiresAt &&
        now.getTime() >= row.expiresAt.getTime()
      ) {
        row.status = CustomerCouponStatus.EXPIRED;
      }
    }
    return {
      available: rows.filter((r) => r.status === CustomerCouponStatus.AVAILABLE),
      used: rows.filter((r) => r.status === CustomerCouponStatus.USED),
      expired: rows.filter((r) => r.status === CustomerCouponStatus.EXPIRED),
      revoked: rows.filter((r) => r.status === CustomerCouponStatus.REVOKED),
    };
  }

  /**
   * The claim key for a source. Deterministic on purpose: it is what makes a
   * repeat claim return the same wallet row.
   */
  private claimKey(
    source: CustomerCouponSource,
    id: string,
  ): string {
    return `${source.split('_')[0]}:${id}`;
  }

  /**
   * Claims one coupon into the wallet, or returns the existing entry.
   *
   * A typed code that does not exist, is inactive, or has lapsed gives the same
   * NOT_FOUND answer, so a shopper cannot use the endpoint to discover which
   * codes exist.
   */
  async claimByCode(
    code: string,
    customer: AuthenticatedUser,
    now: Date,
  ): Promise<{ wallet: CustomerCoupon; alreadyHeld: boolean }> {
    const normalized = normalizeCouponCode(code);
    const held = await this.wallet.findOne({
      where: { customerId: customer.id, claimKey: `code:${normalized}` },
      relations: { coupon: true },
    });
    if (held) return { wallet: held, alreadyHeld: true };

    // The candidate is loaded through the wallet of everyone else, which is the
    // only place a code is legitimately known from, so an unknown code finds
    // nothing and the generic error stands.
    const found = await this.wallet
      .createQueryBuilder('wc')
      .innerJoinAndSelect('wc.coupon', 'coupon')
      .where('coupon.code = :code', { code: normalized })
      .andWhere('coupon.is_active = true')
      .getOne();

    if (!found || !found.coupon) throw new NotFoundException('That code is not valid.');
    const key = `code:${normalized}`;
    const row = await this.issueByCouponId(
      found.coupon.id,
      customer,
      CustomerCouponSource.CODE_CLAIM,
      key,
      now,
    );
    return { wallet: row, alreadyHeld: false };
  }

  /** Claims every coupon in a bundle, or returns the entries already held. */
  async claimBundle(
    bundleId: string,
    customer: AuthenticatedUser,
    now: Date,
  ): Promise<CustomerCoupon[]> {
    const items = await this.bundleItems.find({ where: { bundleId } });
    if (!items.length) throw new NotFoundException('That bundle is not available.');
    const claimed: CustomerCoupon[] = [];
    for (const item of items) {
      const existing = await this.wallet.findOne({
        where: { customerId: customer.id, claimKey: this.claimKey(CustomerCouponSource.BUNDLE_CLAIM, bundleId) + ':' + item.couponId },
        relations: { coupon: true },
      });
      if (existing) {
        claimed.push(existing);
        continue;
      }
      const row = await this.issueByCouponId(
        item.couponId,
        customer,
        CustomerCouponSource.BUNDLE_CLAIM,
        this.claimKey(CustomerCouponSource.BUNDLE_CLAIM, bundleId) + ':' + item.couponId,
        now,
      );
      claimed.push(row);
    }
    return claimed;
  }

  /**
   * Claims whatever a campaign is offering. The window is checked against the
   * SERVER clock: a client that lies about the time still gets refused after
   * the offer has closed.
   */
  async claimCampaign(
    campaignId: string,
    customer: AuthenticatedUser,
    now: Date,
  ): Promise<{ wallet: CustomerCoupon[]; status: string }> {
    const campaign = await this.campaigns.findOne({ where: { id: campaignId, isActive: true } });
    if (!campaign) throw new NotFoundException('That offer is not available.');
    const status = campaignStatus(campaign, now);
    if (status !== 'running') {
      throw new ForbiddenException(
        status === 'upcoming' ? 'That offer has not started yet.' : 'That offer has ended.',
      );
    }
    if (campaign.bundleId) {
      return {
        wallet: await this.claimBundle(campaign.bundleId, customer, now),
        status,
      };
    }
    if (!campaign.couponId) throw new NotFoundException('That offer is not set up correctly.');
    const key = `campaign:${campaign.id}`;
    const existing = await this.wallet.findOne({
      where: { customerId: customer.id, claimKey: key },
      relations: { coupon: true },
    });
    if (existing) return { wallet: [existing], status };
    const row = await this.issueByCouponId(
      campaign.couponId,
      customer,
      CustomerCouponSource.CAMPAIGN,
      key,
      now,
      campaign.id,
    );
    return { wallet: [row], status };
  }

  /** Creates one wallet row, or returns the row that already exists. */
  private async issueByCouponId(
    couponId: string,
    customer: AuthenticatedUser,
    source: CustomerCouponSource,
    claimKey: string,
    now: Date,
    campaignId: string | null = null,
  ): Promise<CustomerCoupon> {
    const row = await this.wallet.create({
      customerId: customer.id,
      couponId,
      source,
      claimKey,
      campaignId,
      status: CustomerCouponStatus.AVAILABLE,
      claimedAt: now,
    });
    return this.wallet.save(row);
  }

  /** The active campaign for a placement, or null. Public data only. */
  async activeCampaign(placement: string, now: Date) {
    const rows = await this.campaigns.find({
      where: { placement: placement as CouponCampaign['placement'], isActive: true },
      order: { endsAt: 'ASC' },
    });
    const live = rows.find((c) => campaignStatus(c, now) === 'running');
    if (!live) return null;
    return {
      id: live.id,
      badgeText: live.badgeText,
      headline: live.headline,
      offerText: live.offerText,
      labelText: live.labelText,
      startsAt: live.startsAt.toISOString(),
      endsAt: live.endsAt.toISOString(),
      status: campaignStatus(live, now),
      claimKind: live.claimKind,
      /** The server's own clock, so the client can correct for a skewed device. */
      serverNow: now.toISOString(),
    };
  }

  /**
   * Read-only: what the shopper could save, and what it would do to the order.
   * Reserves nothing, so it is safe to call on every keystroke.
   */
  async preview(
    request: PreviewRequest,
    customer: AuthenticatedUser,
    now: Date,
    isNewCustomer: boolean,
  ): Promise<PreviewResult> {
    if (!(await this.isEnabled())) {
      return {
        status: 'disabled',
        selected: { item: null, freeDelivery: null },
        eligible: [],
        nudge: null,
        totals: null,
        delivery: null,
      };
    }

    const held = await this.wallet.find({
      where: { customerId: customer.id, status: CustomerCouponStatus.AVAILABLE },
      relations: { coupon: true },
    });
    const walletCoupons = held.filter((h) => h.coupon);

    const lines = request.lines ?? [];
    const eligibleSubtotal = lines.reduce(
      (sum, l) => sum + Math.max(0, toKobo(l.unitPrice)) * Math.max(0, Math.trunc(l.quantity)),
      0,
    ) / 100;
    const hasSaleLines = lines.some((l) => l.isOnSale);

    const terms: CouponTerms[] = walletCoupons.map((h) => ({
      id: h.coupon.id,
      type: h.coupon.type as CouponType,
      value: Number(h.coupon.value),
      maxDiscount: h.coupon.maxDiscount === null ? null : Number(h.coupon.maxDiscount),
      minSpend: h.coupon.minSpend === null ? null : Number(h.coupon.minSpend),
      startsAt: h.coupon.startsAt,
      expiresAt: h.coupon.expiresAt,
      usageCap: h.coupon.usageCap,
      perCustomerCap: h.coupon.perCustomerCap,
      audience: h.coupon.audience as CouponAudience,
      appliesToSaleItems: h.coupon.appliesToSaleItems,
      isActive: h.coupon.isActive,
      timesUsed: h.coupon.timesUsed,
      customerUses: 0,
    }));

    const result = evaluateCoupons({
      lines: lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice })),
      eligibleSubtotal,
      deliveryFee: 0,
      now,
      coupons: terms,
      isNewCustomer,
      hasSaleLines,
    });

    const view = (id: string, discountKobo: number): EligibleCouponView | null => {
      const row = walletCoupons.find((h) => h.coupon.id === id);
      if (!row) return null;
      return {
        couponId: id,
        code: row.coupon.code,
        name: row.coupon.name,
        type: row.coupon.type as CouponType,
        discount: discountKobo / 100,
      };
    };

    const settings = await this.settings.get();
    const delivery: QuoteOption | null =
      request.state && request.method
        ? await this.shipping.quote(
            {
              state: request.state,
              lines: lines.map((l) => ({ sizeClass: null, quantity: l.quantity })),
              method: request.method,
              subtotal: request.subtotal,
            },
            customer,
            now,
          )
        : null;

    const deliveryKobo = delivery?.feeKobo ?? 0;
    const totals = computeTotals({
      lines: lines.map((l) => ({ unitPrice: l.unitPrice, quantity: l.quantity, taxExempt: l.taxExempt })),
      deliveryFee: deliveryKobo / 100,
      itemDiscount: result.selectedItemDiscountKobo / 100,
      deliveryDiscount: result.selectedDeliveryDiscountKobo / 100,
      settings: {
        vatEnabled: settings.vatEnabled,
        vatRatePercent: settings.vatRatePercent,
        pricesIncludeVat: settings.pricesIncludeVat,
        deliveryTaxable: settings.deliveryTaxable,
        deliveryEnabled: settings.shippingEnabled && delivery?.status === QuoteStatus.QUOTED,
      },
    });

    // The nudge is the shortfall on the cheapest coupon the shopper almost
    // qualifies for, so the message names a real code rather than a vague gap.
    let nudge: PreviewResult['nudge'] = null;
    let bestShortfall = Number.POSITIVE_INFINITY;
    for (const t of terms) {
      if (t.minSpend === null) continue;
      const shortfallKobo = toKobo(t.minSpend) - toKobo(eligibleSubtotal);
      if (shortfallKobo > 0 && shortfallKobo < bestShortfall) {
        bestShortfall = shortfallKobo;
        const row = walletCoupons.find((h) => h.coupon.id === t.id);
        if (row) nudge = { spendMore: shortfallKobo / 100, code: row.coupon.code };
      }
    }

    return {
      status: 'ok',
      selected: {
        item: result.best ? view(result.best.couponId, result.best.discountKobo) : null,
        freeDelivery: result.bestFreeDelivery
          ? view(result.bestFreeDelivery.couponId, result.bestFreeDelivery.discountKobo)
          : null,
      },
      eligible: result.ranked.map((e) => ({
        couponId: e.couponId,
        code: walletCoupons.find((h) => h.coupon.id === e.couponId)?.coupon.code ?? '',
        name: walletCoupons.find((h) => h.coupon.id === e.couponId)?.coupon.name ?? '',
        type: (walletCoupons.find((h) => h.coupon.id === e.couponId)?.coupon.type ?? CouponType.FIXED_OFF) as CouponType,
        discount: e.discountKobo / 100,
        rejection: e.rejection,
      })),
      nudge,
      totals,
      delivery,
    };
  }

  /** Used by the admin service to hand a coupon to a list of customers. */
  async issueToCustomer(
    couponId: string,
    customerId: string,
    expiresAt: Date | null,
    now: Date,
  ): Promise<CustomerCoupon> {
    const key = `admin:${couponId}`;
    const existing = await this.wallet.findOne({ where: { customerId, claimKey: key } });
    if (existing) return existing;
    return this.wallet.save(
      this.wallet.create({
        customerId,
        couponId,
        source: CustomerCouponSource.ADMIN_ISSUE,
        claimKey: key,
        status: CustomerCouponStatus.AVAILABLE,
        claimedAt: now,
        expiresAt,
      }),
    );
  }
}

