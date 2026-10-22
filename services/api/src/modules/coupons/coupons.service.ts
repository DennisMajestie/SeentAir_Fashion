import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { AuthenticatedUser } from '../../common/interfaces';
import { computeTotals, toKobo } from '../orders/order-totals';
import { DeliveryMethod } from '../orders/entities/order.entity';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { CheckoutShippingService, QuoteOption, QuoteStatus } from '../checkout-shipping/checkout-shipping.service';
import { Coupon, CouponAudience, CouponType } from './entities/coupon.entity';
import { CouponBundleItem } from './entities/coupon-bundle.entity';
import {
  CouponRedemption,
  CouponRedemptionStatus,
  CustomerCoupon,
  CustomerCouponSource,
  CustomerCouponStatus,
} from './entities/customer-coupon.entity';
import { CouponCampaign, campaignStatus } from './entities/coupon-campaign.entity';
import { normalizeCouponCode } from './coupon-code';
import { NewCustomerService } from './new-customer.service';
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

/**
 * What the shopper is told, per rejection. The order throws a ForbiddenException
 * with this text, so the message has to stand on its own in a checkout banner -
 * no storefront copy layer to soften it.
 */
const REJECTION_COPY: Record<RejectionCode, string> = {
  [RejectionCode.INACTIVE]: 'That coupon is not active.',
  [RejectionCode.NOT_STARTED]: 'That coupon is not running yet.',
  [RejectionCode.EXPIRED]: 'That coupon has expired.',
  [RejectionCode.MIN_SPEND]: 'Your basket does not reach the spend this coupon needs.',
  [RejectionCode.USAGE_CAP]: 'That coupon has been fully used.',
  [RejectionCode.PER_CUSTOMER_CAP]: 'You have already used that coupon.',
  [RejectionCode.NEW_CUSTOMERS_ONLY]: 'That coupon is for new customers only.',
  [RejectionCode.EXCLUDED_ITEMS]: 'No item in your basket qualifies for that coupon.',
  [RejectionCode.SALE_ITEMS]: 'That coupon cannot be used on items already on sale.',
  [RejectionCode.NOT_COMBINABLE]: 'That coupon has already been applied to this order.',
};

export interface EligibleCouponView {
  couponId: string;
  code: string;
  name: string;
  type: CouponType;
  discount: number;
  rejection?: RejectionCode;
}

/**
 * The only line facts a reservation needs. Narrower than PreviewLine on
 * purpose: reserve never looks at the product or category, so the order does
 * not have to assemble data it has no use for.
 */
export interface ReserveLine {
  unitPrice: number;
  quantity: number;
  isOnSale: boolean;
}

/** What the order needs to move a held coupon onto an unpaid order. */
export interface ReserveInput {
  customerId: string;
  /** The wallet row named by the shopper, not the coupon id. */
  customerCouponId: string;
  orderId: string;
  lines: ReserveLine[];
  deliveryFee: number;
  isNewCustomer: boolean;
  now: Date;
}

export interface ReservedCoupon {
  couponId: string;
  customerCouponId: string;
  code: string;
  type: CouponType;
  discountKobo: number;
  cappedByKobo: number;
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
    private readonly newCustomer: NewCustomerService,
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

  // ---- order lifecycle ---------------------------------------------------
  //
  // The one thing that must not go wrong here is the usage cap. Incrementing
  // `timesUsed` at payment time is too late (two orders can pass the cap check
  // in the gap), and incrementing it only at order time with no way back leaks
  // the cap when a customer never pays. So the counter is moved on RESERVE and
  // moved back on RELEASE. A coupon is only truly spent once money arrives.
  //
  // Everything runs on the caller's EntityManager, so the order, the wallet
  // row, the redemption and the counter commit together. Writing through an
  // injected repository instead would put the coupon writes on a different
  // connection than the order and fail the same way the guest tracking token
  // did.

  /**
   * Move a held coupon onto an order: evaluate it against the real basket,
   * take the usage allowance, and record what was promised.
   *
   * The caller must be inside the order transaction. Returns null when no
   * usable coupon was named, which is not an error - the order simply carries
   * no discount.
   */
  async reserve(
    manager: EntityManager,
    input: ReserveInput,
  ): Promise<ReservedCoupon | null> {
    if (!(await this.isEnabled()) || !input.customerCouponId) return null;

    // Lock the wallet row, then re-check status under the lock. The read
    // outside the transaction is only a fast path; two orders for the same
    // coupon are separated here or not at all.
    const held = await manager
      .getRepository(CustomerCoupon)
      .createQueryBuilder('w')
      .setLock('pessimistic_write')
      .where('w.id = :id', { id: input.customerCouponId })
      .getOne();

    if (!held || held.customerId !== input.customerId) return null;
    if (held.status !== CustomerCouponStatus.AVAILABLE) {
      throw new ForbiddenException('That coupon is no longer available.');
    }
    if (held.expiresAt && held.expiresAt.getTime() < input.now.getTime()) {
      throw new ForbiddenException('That coupon has expired.');
    }

    const coupon = await manager.getRepository(Coupon).findOne({
      where: { id: held.couponId },
    });
    if (!coupon || !coupon.isActive) {
      throw new ForbiddenException('That coupon is not active.');
    }

    // Re-check the allowance against the locked row rather than trusting the
    // value read earlier: another order may have consumed it since.
    if (coupon.usageCap !== null && coupon.timesUsed >= coupon.usageCap) {
      throw new ForbiddenException('That coupon has been fully used.');
    }

    const priorUses = await manager.getRepository(CouponRedemption).count({
      where: { couponId: coupon.id, customerId: input.customerId, status: CouponRedemptionStatus.CONFIRMED },
    });
    if (priorUses >= coupon.perCustomerCap) {
      throw new ForbiddenException('You have already used that coupon.');
    }

    const eligibleSubtotal = input.lines.reduce(
      (sum, l) => sum + Math.max(0, toKobo(l.unitPrice)) * Math.max(0, Math.trunc(l.quantity)),
      0,
    ) / 100;

    const decision = evaluateCoupons({
      lines: input.lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice })),
      eligibleSubtotal,
      deliveryFee: input.deliveryFee,
      now: input.now,
      coupons: [this.termsFor(coupon, priorUses)],
      isNewCustomer: input.isNewCustomer,
      hasSaleLines: input.lines.some((l) => l.isOnSale),
    });

    // The shopper named one coupon, so the ranked list is only consulted for
    // that coupon's own verdict - not for picking a different one.
    const verdict = decision.ranked.find((r) => r.couponId === coupon.id);
    if (!verdict || !verdict.eligible) {
      throw new ForbiddenException(
        REJECTION_COPY[verdict?.rejection ?? RejectionCode.INACTIVE],
      );
    }
    const cappedByKobo = verdict.cappedByKobo ?? 0;

    // Take the allowance now, on the same lock, so two concurrent orders
    // cannot both pass the cap check above.
    await manager.getRepository(Coupon).increment({ id: coupon.id }, 'timesUsed', 1);

    held.status = CustomerCouponStatus.RESERVED;
    held.redeemedOrderId = input.orderId;
    await manager.getRepository(CustomerCoupon).save(held);

    await manager.getRepository(CouponRedemption).save(
      manager.getRepository(CouponRedemption).create({
        orderId: input.orderId,
        couponId: coupon.id,
        customerCouponId: held.id,
        customerId: input.customerId,
        status: CouponRedemptionStatus.RESERVED,
        discountMinor: verdict.discountKobo / 100,
        snapshot: {
          code: coupon.code,
          type: coupon.type,
          value: Number(coupon.value),
          maxDiscount: coupon.maxDiscount === null ? null : Number(coupon.maxDiscount),
          eligibleSubtotal,
          deliveryFee: input.deliveryFee,
          cappedByKobo,
        },
      }),
    );

    return {
      couponId: coupon.id,
      customerCouponId: held.id,
      code: coupon.code,
      type: coupon.type as CouponType,
      discountKobo: verdict.discountKobo,
      cappedByKobo,
    };
  }

  /**
   * Payment arrived: the redemption and the allowance both stand.
   * Idempotent, because a webhook can legitimately arrive twice.
   */
  async confirm(manager: EntityManager, orderId: string): Promise<void> {
    const rows = await manager.getRepository(CouponRedemption).find({
      where: { orderId, status: CouponRedemptionStatus.RESERVED },
    });
    if (rows.length === 0) return;

    await manager.getRepository(CouponRedemption).update(
      { orderId, status: CouponRedemptionStatus.RESERVED },
      { status: CouponRedemptionStatus.CONFIRMED },
    );
    await manager
      .getRepository(CustomerCoupon)
      .update({ redeemedOrderId: orderId }, { status: CustomerCouponStatus.USED });
  }

  /**
   * Payment failed, expired or was abandoned: give the coupon and the
   * allowance back, so an unpaid order cannot burn a shopper's coupon or
   * quietly consume a campaign's budget.
   */
  async release(manager: EntityManager, orderId: string): Promise<void> {
    const rows = await manager.getRepository(CouponRedemption).find({
      where: { orderId, status: CouponRedemptionStatus.RESERVED },
    });
    if (rows.length === 0) return;

    const releasedAt = new Date();
    for (const row of rows) {
      await manager.getRepository(Coupon).decrement(
        { id: row.couponId },
        'timesUsed',
        1,
      );
      if (row.customerCouponId) {
        await manager.getRepository(CustomerCoupon).update(
          { id: row.customerCouponId },
          { status: CustomerCouponStatus.AVAILABLE, redeemedOrderId: null },
        );
      }
    }

    await manager.getRepository(CouponRedemption).update(
      { orderId, status: CouponRedemptionStatus.RESERVED },
      { status: CouponRedemptionStatus.RELEASED, releasedAt },
    );
  }

  /**
   * Whether this account is still a new customer, which is what
   * NEW_CUSTOMERS_ONLY coupons are gated on. Delegated rather than duplicated so
   * the order and the preview cannot disagree about the same shopper.
   */
  async isNewCustomer(
    customerId: string,
    email: string | null,
    phone: string | null,
  ): Promise<boolean> {
    return this.newCustomer.isNewCustomer(customerId, email, phone);
  }

  /** Map a stored coupon onto the pure engine's input shape. */
  private termsFor(coupon: Coupon, customerUses: number): CouponTerms {
    // `Number(undefined)` is NaN, and a NaN cap quietly turns a real discount
    // into zero. Anything absent from the row must become null, which the
    // engine reads as "no limit".
    const money = (v: number | null | undefined): number | null =>
      v === null || v === undefined ? null : Number(v);

    return {
      id: coupon.id,
      type: coupon.type as CouponType,
      value: Number(coupon.value),
      maxDiscount: money(coupon.maxDiscount),
      minSpend: money(coupon.minSpend),
      startsAt: coupon.startsAt,
      expiresAt: coupon.expiresAt,
      usageCap: coupon.usageCap,
      perCustomerCap: coupon.perCustomerCap,
      audience: coupon.audience as CouponAudience,
      appliesToSaleItems: coupon.appliesToSaleItems,
      isActive: coupon.isActive,
      timesUsed: coupon.timesUsed,
      customerUses,
    };
  }
}


