import { toKobo } from '../orders/order-totals';

/**
 * Which coupon a shopper gets, and why not the others.
 *
 * This function is deliberately pure. It reads no clock, touches no database
 * and generates no randomness: the caller passes the current time and the
 * candidate coupons it already loaded. That is what makes the rule matrix in
 * the spec cheap to test exhaustively - every interesting case is a set of
 * values in, not a mocked service or a frozen timer.
 *
 * Eligibility is decided by the CALLER: only the lines a coupon can actually
 * discount are passed in as `lines`, with the timed sale already applied to
 * their prices, exactly as `computeTotals` receives them. This function never
 * re-prices anything; it only decides what to do with the numbers it is given.
 *
 * Money is integer kobo throughout. Rounding happens once per coupon, after
 * the cap, so the discount a shopper is told about is the discount that is
 * recorded.
 */

/** Largest percentage any coupon may carry. A typo must not sell at a loss. */
export const MAX_COUPON_PERCENT = 100;

/** Stable reasons, so the storefront maps a code to copy rather than parsing prose. */
export enum RejectionCode {
  MIN_SPEND = 'MIN_SPEND',
  EXPIRED = 'EXPIRED',
  NOT_STARTED = 'NOT_STARTED',
  USAGE_CAP = 'USAGE_CAP',
  PER_CUSTOMER_CAP = 'PER_CUSTOMER_CAP',
  NEW_CUSTOMERS_ONLY = 'NEW_CUSTOMERS_ONLY',
  EXCLUDED_ITEMS = 'EXCLUDED_ITEMS',
  SALE_ITEMS = 'SALE_ITEMS',
  NOT_COMBINABLE = 'NOT_COMBINABLE',
  INACTIVE = 'INACTIVE',
}

export enum CouponType {
  PERCENT_OFF = 'percent_off',
  FIXED_OFF = 'fixed_off',
  FREE_DELIVERY = 'free_delivery',
}

export enum CouponAudience {
  ALL = 'all',
  NEW_CUSTOMERS = 'new_customers',
  SPECIFIC = 'specific',
}

/** The coupon fields the rules need. A `Coupon` entity satisfies it. */
export interface CouponTerms {
  id: string;
  type: CouponType;
  /** Percent for PERCENT_OFF, major units for FIXED_OFF, 0 for FREE_DELIVERY. */
  value: number;
  maxDiscount: number | null;
  minSpend: number | null;
  startsAt: Date | null;
  expiresAt: Date | null;
  usageCap: number | null;
  perCustomerCap: number;
  audience: CouponAudience;
  appliesToSaleItems: boolean;
  isActive: boolean;
  /** Times already spent across all customers. */
  timesUsed: number;
  /** Times this customer has already spent it. */
  customerUses: number;
}

/** The priced cart lines a coupon may discount, post-sale. */
export interface EligibleLine {
  quantity: number;
  /** Major units, already sale-priced by the caller. */
  unitPrice: number;
}

export interface EvaluationInput {
  lines: EligibleLine[];
  /** Major units. The sum of the eligible lines. */
  eligibleSubtotal: number;
  /** Major units. What delivery would cost. */
  deliveryFee: number;
  /** Passed in, never read from the clock inside here. */
  now: Date;
  coupons: CouponTerms[];
  /** The result of the new-customer check, decided by the caller. */
  isNewCustomer: boolean;
  /**
   * Whether the shopper's basket contains any line still on timed sale. Only
   * needed to explain a rejection; the eligible lines have already been
   * filtered.
   */
  hasSaleLines?: boolean;
}

export interface CouponEvaluation {
  couponId: string;
  eligible: boolean;
  /** Kobo. Zero when ineligible. */
  discountKobo: number;
  /** Present when the cap actually bit. */
  cappedByKobo?: number;
  rejection?: RejectionCode;
  /** Set when the audience needs an explicit customer list. */
  requiresSpecificCustomer?: boolean;
}

export interface EvaluationResult {
  /** Eligible coupons, best first. */
  ranked: CouponEvaluation[];
  /** The one to apply: highest saving, ties broken by earliest expiry. */
  best: CouponEvaluation | null;
  /** A free-delivery coupon chosen alongside `best`, when it adds value. */
  bestFreeDelivery: CouponEvaluation | null;
  /** Kobo the chosen item coupon is worth. */
  selectedItemDiscountKobo: number;
  /** Kobo the chosen free-delivery coupon waives. */
  selectedDeliveryDiscountKobo: number;
}

function evaluateOne(
  coupon: CouponTerms,
  input: EvaluationInput,
  alreadyApplied: Set<string>,
): CouponEvaluation {
  const reject = (code: RejectionCode, extra?: Partial<CouponEvaluation>): CouponEvaluation => ({
    couponId: coupon.id,
    eligible: false,
    discountKobo: 0,
    rejection: code,
    ...extra,
  });

  if (!coupon.isActive) return reject(RejectionCode.INACTIVE);

  if (coupon.startsAt && input.now.getTime() < coupon.startsAt.getTime()) {
    return reject(RejectionCode.NOT_STARTED);
  }
  // The end is exclusive: at the stated instant the offer is over.
  if (coupon.expiresAt && input.now.getTime() >= coupon.expiresAt.getTime()) {
    return reject(RejectionCode.EXPIRED);
  }

  if (coupon.usageCap !== null && coupon.timesUsed >= coupon.usageCap) {
    return reject(RejectionCode.USAGE_CAP);
  }
  if (coupon.customerUses >= coupon.perCustomerCap) {
    return reject(RejectionCode.PER_CUSTOMER_CAP);
  }
  if (alreadyApplied.has(coupon.id)) {
    return reject(RejectionCode.NOT_COMBINABLE);
  }

  if (coupon.audience === CouponAudience.NEW_CUSTOMERS && !input.isNewCustomer) {
    return reject(RejectionCode.NEW_CUSTOMERS_ONLY);
  }
  if (coupon.audience === CouponAudience.SPECIFIC) {
    // The specific-customer list is enforced by the caller, which loads only
    // coupons addressed to this shopper; reaching here means it was not.
    return reject(RejectionCode.NEW_CUSTOMERS_ONLY, { requiresSpecificCustomer: true });
  }

  const subtotalKobo = toKobo(input.eligibleSubtotal);

  if (coupon.type === CouponType.FREE_DELIVERY) {
    const deliveryKobo = toKobo(input.deliveryFee);
    if (deliveryKobo <= 0) {
      // Nothing to waive. Treated as no saving rather than a phantom discount.
      return { couponId: coupon.id, eligible: true, discountKobo: 0 };
    }
    return { couponId: coupon.id, eligible: true, discountKobo: deliveryKobo };
  }

  // An item coupon needs something to discount. Sale lines are excluded by the
  // caller, so an empty eligible set means either an empty basket or a basket
  // made only of items this coupon may not touch.
  if (subtotalKobo <= 0) {
    return reject(
      input.hasSaleLines ? RejectionCode.SALE_ITEMS : RejectionCode.EXCLUDED_ITEMS,
    );
  }

  if (coupon.minSpend !== null && subtotalKobo < toKobo(coupon.minSpend)) {
    return reject(RejectionCode.MIN_SPEND);
  }

  let rawKobo: number;
  if (coupon.type === CouponType.PERCENT_OFF) {
    const percent = Math.min(Math.max(coupon.value, 0), MAX_COUPON_PERCENT);
    rawKobo = Math.round((subtotalKobo * percent) / 100);
  } else {
    // Clamped even though the column forbids a negative value: this function is
    // pure and must not depend on the database having been written correctly.
    rawKobo = Math.max(0, toKobo(coupon.value));
  }

  let discountKobo = Math.min(rawKobo, subtotalKobo);
  let cappedByKobo: number | undefined;
  if (coupon.maxDiscount !== null) {
    const capKobo = toKobo(coupon.maxDiscount);
    if (discountKobo > capKobo) {
      cappedByKobo = discountKobo - capKobo;
      discountKobo = capKobo;
    }
  }

  return { couponId: coupon.id, eligible: true, discountKobo, cappedByKobo };
}

/**
 * Ranks every candidate coupon and picks the one(s) to apply.
 *
 * Precedence, in order: one item coupon plus at most one free-delivery coupon.
 * "Best" is the largest saving; ties go to the coupon that expires soonest, and
 * then to the lowest id, so the same basket always resolves to the same coupon
 * rather than varying with load order.
 */
export function evaluateCoupons(input: EvaluationInput): EvaluationResult {
  const byId = new Map(input.coupons.map((c) => [c.id, c]));
  const applied = new Set<string>();
  const evaluations = input.coupons.map((c) => evaluateOne(c, input, applied));

  const eligible = evaluations.filter((e) => e.eligible);
  // A finite "no expiry" sentinel rather than Infinity: Infinity minus Infinity
  // is NaN, and a comparator that returns NaN makes Array.sort's result
  // undefined, which would silently make the chosen coupon depend on the order
  // the database happened to return rows in.
  const NO_EXPIRY = Number.MAX_SAFE_INTEGER;
  const expiryOf = (c: CouponTerms): number =>
    c.expiresAt ? c.expiresAt.getTime() : NO_EXPIRY;

  const rank = (e: CouponEvaluation): number[] => {
    const c = byId.get(e.couponId) as CouponTerms;
    // Most negative saving first, then earliest expiry, then id for determinism.
    return [-e.discountKobo, expiryOf(c), ...Array.from(c.id).map((ch) => ch.charCodeAt(0))];
  };
  const compare = (a: CouponEvaluation, b: CouponEvaluation): number => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < Math.max(ra.length, rb.length); i++) {
      const diff = (ra[i] ?? 0) - (rb[i] ?? 0);
      if (diff !== 0) return diff;
    }
    return 0;
  };

  eligible.sort(compare);

  const freeDelivery = eligible.find(
    (e) => byId.get(e.couponId)?.type === CouponType.FREE_DELIVERY,
  );
  const itemCoupons = eligible.filter(
    (e) => byId.get(e.couponId)?.type !== CouponType.FREE_DELIVERY,
  );

  const best = itemCoupons[0] ?? null;
  if (best) applied.add(best.couponId);
  const bestFreeDelivery = freeDelivery ?? null;

  return {
    ranked: eligible,
    best,
    bestFreeDelivery,
    selectedItemDiscountKobo: best?.discountKobo ?? 0,
    selectedDeliveryDiscountKobo: bestFreeDelivery?.discountKobo ?? 0,
  };
}
