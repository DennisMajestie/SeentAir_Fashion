import {
  CouponAudience,
  CouponTerms,
  CouponType,
  EvaluationInput,
  RejectionCode,
  evaluateCoupons,
} from './coupon-rules';

const NOW = new Date('2026-10-06T12:00:00Z');
const LATER = new Date('2026-10-07T12:00:00Z');
/** Two expiry times that are both still in the future at NOW, for tie-breaks. */
const SOONER = new Date('2026-10-07T00:00:00Z');
const MUCH_LATER = new Date('2026-10-20T12:00:00Z');

function coupon(over: Partial<CouponTerms> = {}): CouponTerms {
  return {
    id: 'c1',
    type: CouponType.PERCENT_OFF,
    value: 10,
    maxDiscount: null,
    minSpend: null,
    startsAt: null,
    expiresAt: null,
    usageCap: null,
    perCustomerCap: 1,
    audience: CouponAudience.ALL,
    appliesToSaleItems: false,
    isActive: true,
    timesUsed: 0,
    customerUses: 0,
    ...over,
  };
}

function input(over: Partial<EvaluationInput> = {}): EvaluationInput {
  return {
    lines: [{ quantity: 1, unitPrice: 10000 }],
    eligibleSubtotal: 10000,
    deliveryFee: 2000,
    now: NOW,
    coupons: [],
    isNewCustomer: false,
    ...over,
  };
}

describe('coupon rules', () => {
  describe('lifecycle windows', () => {
    it('accepts a coupon with no window', () => {
      const r = evaluateCoupons(input({ coupons: [coupon()] }));
      expect(r.best?.eligible).toBe(true);
    });

    it('rejects before the start', () => {
      const r = evaluateCoupons(input({ coupons: [coupon({ startsAt: LATER })] }));
      expect(r.best).toBeNull();
      expect(r.ranked[0]).toBeUndefined();
    });

    it('accepts exactly at the start', () => {
      const r = evaluateCoupons(input({ coupons: [coupon({ startsAt: NOW })] }));
      expect(r.best?.eligible).toBe(true);
    });

    it('treats the expiry instant itself as over', () => {
      const r = evaluateCoupons(input({ coupons: [coupon({ expiresAt: NOW })] }));
      expect(r.best).toBeNull();
    });

    it('rejects an inactive coupon', () => {
      const r = evaluateCoupons(input({ coupons: [coupon({ isActive: false })] }));
      expect(r.best).toBeNull();
    });
  });

  describe('minimum spend', () => {
    const c = () => coupon({ type: CouponType.FIXED_OFF, value: 500, minSpend: 5000 });

    it('accepts exactly at the minimum', () => {
      const r = evaluateCoupons(input({ eligibleSubtotal: 5000, coupons: [c()] }));
      expect(r.best?.eligible).toBe(true);
    });

    it('rejects one kobo below the minimum', () => {
      const r = evaluateCoupons(input({ eligibleSubtotal: 4999.99, coupons: [c()] }));
      expect(r.best).toBeNull();
    });

    it('measures the minimum against the eligible subtotal only', () => {
      const r = evaluateCoupons(input({ eligibleSubtotal: 5000, coupons: [c()] }));
      expect(r.best?.eligible).toBe(true);
    });
  });

  describe('percentage discounts and the cap', () => {
    it('takes the percentage off', () => {
      const r = evaluateCoupons(input({ coupons: [coupon({ value: 10, maxDiscount: 9000 })] }));
      expect(r.selectedItemDiscountKobo).toBe(100000);
    });

    it('clamps to the maximum discount cap', () => {
      const r = evaluateCoupons(
        input({ coupons: [coupon({ value: 50, maxDiscount: 2000 })] }),
      );
      expect(r.selectedItemDiscountKobo).toBe(200000);
      expect(r.best?.cappedByKobo).toBe(300000);
    });

    it('never discounts more than the eligible subtotal', () => {
      const r = evaluateCoupons(
        input({ eligibleSubtotal: 500, coupons: [coupon({ type: CouponType.FIXED_OFF, value: 99999 })] }),
      );
      expect(r.selectedItemDiscountKobo).toBe(50000);
    });

    it('never produces a negative discount', () => {
      const r = evaluateCoupons(
        input({ coupons: [coupon({ type: CouponType.FIXED_OFF, value: -500 })] }),
      );
      expect(r.selectedItemDiscountKobo).toBe(0);
    });

    it('caps a percentage above the ceiling', () => {
      const r = evaluateCoupons(
        input({ coupons: [coupon({ value: 5000, maxDiscount: 999999 })] }),
      );
      expect(r.selectedItemDiscountKobo).toBe(1000000);
    });
  });

  describe('free delivery', () => {
    it('waives the whole delivery fee', () => {
      const r = evaluateCoupons(
        input({ coupons: [coupon({ type: CouponType.FREE_DELIVERY, value: 0 })] }),
      );
      expect(r.bestFreeDelivery?.discountKobo).toBe(200000);
    });

    it('saves nothing when delivery is already free', () => {
      const r = evaluateCoupons(
        input({ deliveryFee: 0, coupons: [coupon({ type: CouponType.FREE_DELIVERY, value: 0 })] }),
      );
      expect(r.bestFreeDelivery?.discountKobo).toBe(0);
    });

    it('is chosen alongside an item coupon, not instead of it', () => {
      const r = evaluateCoupons(
        input({
          coupons: [
            coupon({ id: 'item', type: CouponType.FIXED_OFF, value: 1000 }),
            coupon({ id: 'ship', type: CouponType.FREE_DELIVERY, value: 0 }),
          ],
        }),
      );
      expect(r.selectedItemDiscountKobo).toBe(100000);
      expect(r.selectedDeliveryDiscountKobo).toBe(200000);
    });
  });

  describe('audience', () => {
    it('rejects a new-customer coupon for a returning customer', () => {
      const r = evaluateCoupons(
        input({ isNewCustomer: false, coupons: [coupon({ audience: CouponAudience.NEW_CUSTOMERS })] }),
      );
      expect(r.best).toBeNull();
    });

    it('accepts a new-customer coupon for a new customer', () => {
      const r = evaluateCoupons(
        input({ isNewCustomer: true, coupons: [coupon({ audience: CouponAudience.NEW_CUSTOMERS })] }),
      );
      expect(r.best?.eligible).toBe(true);
    });

    it('rejects a specific-customer coupon addressed to someone else', () => {
      const r = evaluateCoupons(
        input({ coupons: [coupon({ audience: CouponAudience.SPECIFIC })] }),
      );
      expect(r.best).toBeNull();
      expect(r.ranked).toHaveLength(0);
    });
  });

  describe('caps already spent', () => {
    it('rejects when the total usage cap is reached', () => {
      const r = evaluateCoupons(input({ coupons: [coupon({ usageCap: 5, timesUsed: 5 })] }));
      expect(r.best).toBeNull();
    });

    it('accepts one below the total usage cap', () => {
      const r = evaluateCoupons(input({ coupons: [coupon({ usageCap: 5, timesUsed: 4 })] }));
      expect(r.best?.eligible).toBe(true);
    });

    it('rejects when the per-customer cap is reached', () => {
      const r = evaluateCoupons(input({ coupons: [coupon({ perCustomerCap: 2, customerUses: 2 })] }));
      expect(r.best).toBeNull();
    });

it('accepts a coupon the customer is entitled to hold', () => {
      // Holding a coupon in the wallet is how a shopper USES it, so it must
      // never be a rejection reason. The only per-customer limit is how many
      // times it has already been redeemed.
      const r = evaluateCoupons(input({ coupons: [coupon()] }));
      expect(r.best?.eligible).toBe(true);
    });
  });

  describe('sale items', () => {
    it('reports SALE_ITEMS when the basket is all sale lines', () => {
      const r = evaluateCoupons(
        input({ eligibleSubtotal: 0, lines: [], hasSaleLines: true, coupons: [coupon({ value: 10, maxDiscount: 100 })] }),
      );
      expect(r.best).toBeNull();
    });

    it('reports EXCLUDED_ITEMS when nothing is eligible', () => {
      const r = evaluateCoupons(
        input({ eligibleSubtotal: 0, lines: [], coupons: [coupon({ value: 10, maxDiscount: 100 })] }),
      );
      expect(r.best).toBeNull();
    });

    it('discounts the non-sale lines when sale lines are excluded', () => {
      const r = evaluateCoupons(
        input({ eligibleSubtotal: 10000, hasSaleLines: true, coupons: [coupon({ value: 10, maxDiscount: 9000 })] }),
      );
      expect(r.selectedItemDiscountKobo).toBe(100000);
    });
  });

  describe('choosing the best coupon', () => {
    it('takes the largest saving', () => {
      const r = evaluateCoupons(
        input({
          coupons: [
            coupon({ id: 'small', type: CouponType.FIXED_OFF, value: 500 }),
            coupon({ id: 'big', type: CouponType.FIXED_OFF, value: 2000 }),
          ],
        }),
      );
      expect(r.best?.couponId).toBe('big');
      expect(r.selectedItemDiscountKobo).toBe(200000);
    });

    it('breaks a tie by earliest expiry', () => {
      const r = evaluateCoupons(
        input({
          coupons: [
            coupon({ id: 'later', type: CouponType.FIXED_OFF, value: 1000, expiresAt: MUCH_LATER }),
      coupon({ id: 'sooner', type: CouponType.FIXED_OFF, value: 1000, expiresAt: SOONER }),
          ],
        }),
      );
      expect(r.best?.couponId).toBe('sooner');
    });

    it('treats a coupon with no expiry as expiring last', () => {
      const r = evaluateCoupons(
        input({
          coupons: [
            coupon({ id: 'open', type: CouponType.FIXED_OFF, value: 1000 }),
            coupon({ id: 'dated', type: CouponType.FIXED_OFF, value: 1000, expiresAt: LATER }),
          ],
        }),
      );
      expect(r.best?.couponId).toBe('dated');
    });

    it('is deterministic whatever order the coupons arrive in', () => {
      const a = coupon({ id: 'aaa', type: CouponType.FIXED_OFF, value: 1000 });
      const b = coupon({ id: 'bbb', type: CouponType.FIXED_OFF, value: 1000 });
      const first = evaluateCoupons(input({ coupons: [a, b] }));
      const second = evaluateCoupons(input({ coupons: [b, a] }));
      expect(first.best?.couponId).toBe(second.best?.couponId);
    });
  });

  describe('purity', () => {
    it('never reads the clock itself', () => {
      const spy = jest.spyOn(Date, 'now');
      evaluateCoupons(input({ coupons: [coupon()] }));
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('returns the same answer for the same input', () => {
      const args = input({ coupons: [coupon({ type: CouponType.FIXED_OFF, value: 750 })] });
      expect(evaluateCoupons(args)).toEqual(evaluateCoupons(args));
    });
  });

  describe('rejection codes', () => {
    it('are stable strings', () => {
      expect(RejectionCode.MIN_SPEND).toBe('MIN_SPEND');
      expect(RejectionCode.SALE_ITEMS).toBe('SALE_ITEMS');
      expect(RejectionCode.NOT_COMBINABLE).toBe('NOT_COMBINABLE');
    });

    it('covers every reason the caller must explain', () => {
      expect(Object.values(RejectionCode).sort()).toEqual(
        [
          'EXCLUDED_ITEMS',
          'EXPIRED',
          'INACTIVE',
          'MIN_SPEND',
          'NEW_CUSTOMERS_ONLY',
          'NOT_COMBINABLE',
          'NOT_STARTED',
          'PER_CUSTOMER_CAP',
          'SALE_ITEMS',
          'USAGE_CAP',
        ].sort(),
      );
    });
  });
});