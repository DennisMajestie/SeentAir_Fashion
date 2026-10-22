import { CouponsService } from './coupons.service';
import { CouponType } from './entities/coupon.entity';
import {
  CouponRedemptionStatus,
  CustomerCouponStatus,
} from './entities/customer-coupon.entity';

/**
 * The reservation lifecycle, which is the part of coupons that deals in money
 * and is therefore the part worth pinning down.
 *
 * The three failures these guard against:
 *   - a coupon spent twice from two orders placed at once (double-spend)
 *   - a usage cap consumed by an order nobody ever paid for (cap leak)
 *   - a coupon confirmed for an order that was never paid (phantom spend)
 *
 * Each is a silent, slow-burn bug: the system looks healthy and only the
 * merchant's campaign quietly under-delivers. So they are asserted directly
 * rather than inferred from the totals.
 */

/** A stand-in EntityManager that records what was written where. */
function managerFor(overrides: {
  held?: Record<string, unknown>;
  coupon?: Record<string, unknown>;
  confirmedCount?: number;
}) {
  const writes: {
    couponIncrements: number;
    couponDecrements: number;
    wallet: Record<string, unknown>[];
    redemptions: Record<string, unknown>[];
  } = {
    couponIncrements: 0,
    couponDecrements: 0,
    wallet: [],
    redemptions: [],
  };

  let redemptionState: Record<string, unknown> = {
    orderId: 'order-1',
    customerCouponId: 'w1',
    status: CouponRedemptionStatus.RESERVED,
  };

  // Honours the where clause: an order with no reservation must find no rows,
  // which is what makes release/confirm safe to call on every order.
  const findRedemptions = async (opts?: { where?: Record<string, unknown> }) => {
    const where = opts?.where ?? {};
    const matches =
      (where.orderId === undefined || where.orderId === redemptionState.orderId) &&
      (where.status === undefined || where.status === redemptionState.status);
    return matches ? [{ ...redemptionState, id: 'r1' }] : [];
  };

  const makeRepo = (kind: 'coupon' | 'wallet' | 'redemption') => ({
    createQueryBuilder: () => ({
      setLock: () => makeQB(),
      where: () => makeQB(),
      getOne: async () => (overrides.held ? { id: 'w1', ...overrides.held } : null),
    }),
    create: (v: Record<string, unknown>) => ({ ...v, __kind: kind }),
    find: async (opts?: unknown) =>
      kind === 'redemption'
        ? findRedemptions(opts as { where?: Record<string, unknown> } | undefined)
        : [],
    count: async () => overrides.confirmedCount ?? 0,
    findOne: async () =>
      overrides.coupon ? { id: 'c1', isActive: true, ...overrides.coupon } : null,
    save: async (v: Record<string, unknown>) => {
      if (kind === 'wallet') writes.wallet.push(v);
      if (kind === 'redemption') {
        writes.redemptions.push(v);
        redemptionState = { ...v, status: CouponRedemptionStatus.RESERVED };
      }
      return v;
    },
    increment: async () => {
      writes.couponIncrements += 1;
      return { affected: 1 };
    },
    decrement: async () => {
      writes.couponDecrements += 1;
      return { affected: 1 };
    },
    update: async (where: Record<string, unknown>, set: Record<string, unknown>) => {
      if (kind === 'redemption') redemptionState = { ...redemptionState, ...set };
      if (kind === 'wallet') writes.wallet.push({ ...where, ...set });
      return { affected: 1 };
    },
  });

  const makeQB = () => {
    const qb: Record<string, unknown> = {};
    qb.setLock = () => qb;
    qb.where = () => qb;
    qb.getOne = async () => (overrides.held ? { id: 'w1', ...overrides.held } : null);
    return qb;
  };

  const manager = {
    getRepository: (entity: { name?: string }) => {
      const name = entity?.name ?? '';
      if (name.includes('CouponRedemption')) return makeRepo('redemption');
      if (name.includes('CustomerCoupon')) return makeRepo('wallet');
      return makeRepo('coupon');
    },
  };

  return { manager, writes, redemption: () => ({ ...redemptionState }) };
}

function serviceFor(enabled = true) {
  const settings = { get: async () => ({ couponsEnabled: enabled }) };
  const newCustomer = { isNewCustomer: async () => true };
  const shipping = { quote: async () => ({ status: 'not_applicable', feeKobo: 0 }) };
  const svc = new CouponsService(
    { find: async () => [] } as never,
    { find: async () => [] } as never,
    { find: async () => [] } as never,
    settings as never,
    newCustomer as never,
    shipping as never,
  );
  return svc;
}

const NOW = new Date('2026-10-19T12:00:00Z');

const baseInput = {
  customerId: 'cust-1',
  customerCouponId: 'w1',
  orderId: 'order-1',
  lines: [{ unitPrice: 10000, quantity: 2, isOnSale: false }],
  deliveryFee: 0,
  isNewCustomer: true,
  now: NOW,
};

describe('CouponsService — reservation lifecycle', () => {
  describe('reserve', () => {
    it('takes the allowance, marks the wallet row reserved and records the promise', async () => {
      const svc = serviceFor(true);
      const { manager, writes } = managerFor({
        held: { customerId: 'cust-1', couponId: 'c1', status: CustomerCouponStatus.AVAILABLE },
        coupon: {
          code: 'WELCOME10',
          audience: 'all',
          appliesToSaleItems: true,
          type: CouponType.PERCENT_OFF,
          value: 10,
          usageCap: 100,
          perCustomerCap: 1,
          timesUsed: 0,
        },
      });

      const reserved = await svc.reserve(manager as never, baseInput);

      expect(reserved).not.toBeNull();
      // 10% of a 20,000.00 basket.
      expect(reserved!.discountKobo).toBe(200000);
      expect(reserved!.type).toBe(CouponType.PERCENT_OFF);

      // The counter moves NOW, not at payment: that is what stops two orders
      // both passing the cap check.
      expect(writes.couponIncrements).toBe(1);
      expect(writes.wallet[0]).toMatchObject({ status: CustomerCouponStatus.RESERVED });

      // The redemption records what was promised, so a later dispute can be
      // settled from history rather than from a re-run of today's rules.
      expect(writes.redemptions[0]).toMatchObject({
        orderId: 'order-1',
        status: CouponRedemptionStatus.RESERVED,
        discountMinor: 2000,
      });
    });

    it('refuses a coupon the customer does not hold', async () => {
      const svc = serviceFor(true);
      const { manager, writes } = managerFor({
        held: { customerId: 'someone-else', couponId: 'c1' },
        coupon: { code: 'X', type: CouponType.PERCENT_OFF, value: 10, perCustomerCap: 1 },
      });

      await expect(svc.reserve(manager as never, baseInput)).resolves.toBeNull();
      expect(writes.couponIncrements).toBe(0);
    });

    it('refuses a coupon another order is already holding', async () => {
      const svc = serviceFor(true);
      const { manager, writes } = managerFor({
        held: {
          customerId: 'cust-1',
          couponId: 'c1',
          status: CustomerCouponStatus.RESERVED,
        },
        coupon: { code: 'X', type: CouponType.PERCENT_OFF, value: 10, perCustomerCap: 1 },
      });

      // This is the double-spend guard: the second order sees RESERVED, not
      // AVAILABLE, and never touches the counter.
      await expect(svc.reserve(manager as never, baseInput)).rejects.toThrow(
        /no longer available/i,
      );
      expect(writes.couponIncrements).toBe(0);
    });

    it('refuses once the overall usage cap is reached', async () => {
      const svc = serviceFor(true);
      const { manager, writes } = managerFor({
        held: { customerId: 'cust-1', couponId: 'c1', status: CustomerCouponStatus.AVAILABLE },
        coupon: {
          code: 'X',
          type: CouponType.PERCENT_OFF,
          value: 10,
          usageCap: 5,
          perCustomerCap: 1,
          timesUsed: 5,
        },
      });

      await expect(svc.reserve(manager as never, baseInput)).rejects.toThrow(/fully used/i);
      expect(writes.couponIncrements).toBe(0);
    });

    it('refuses when this customer has already spent it', async () => {
      const svc = serviceFor(true);
      const { manager, writes } = managerFor({
        held: { customerId: 'cust-1', couponId: 'c1', status: CustomerCouponStatus.AVAILABLE },
        coupon: {
          code: 'X',
          type: CouponType.PERCENT_OFF,
          value: 10,
          usageCap: null,
          perCustomerCap: 1,
          timesUsed: 1,
        },
        confirmedCount: 1,
      });

      await expect(svc.reserve(manager as never, baseInput)).rejects.toThrow(/already used/i);
      expect(writes.couponIncrements).toBe(0);
    });

    it('ignores the coupon entirely when the feature is off', async () => {
      const svc = serviceFor(false);
      const { manager, writes } = managerFor({ held: { customerId: 'cust-1' } });

      // Flag off must not reserve, or turning it off would not stop the money
      // path.
      await expect(svc.reserve(manager as never, baseInput)).resolves.toBeNull();
      expect(writes.couponIncrements).toBe(0);
      expect(writes.wallet).toHaveLength(0);
    });

    it('waives delivery rather than discounting goods for a free-delivery coupon', async () => {
      const svc = serviceFor(true);
      const { manager } = managerFor({
        held: { customerId: 'cust-1', couponId: 'c1', status: CustomerCouponStatus.AVAILABLE },
        coupon: {
          code: 'FREESHIP',
          audience: 'all',
          appliesToSaleItems: true,
          type: CouponType.FREE_DELIVERY,
          value: 0,
          usageCap: null,
          perCustomerCap: 1,
          timesUsed: 0,
        },
      });

      const reserved = await svc.reserve(manager as never, { ...baseInput, deliveryFee: 2500 });

      expect(reserved!.type).toBe(CouponType.FREE_DELIVERY);
      // The whole fee, which is what the order hands to deliveryDiscount
      // rather than itemDiscount - the VAT base has to stay correct.
      expect(reserved!.discountKobo).toBe(250000);
    });
  });

  describe('release', () => {
    it('gives the allowance and the coupon back, so an unpaid order cannot burn a cap', async () => {
      const svc = serviceFor(true);
      const { manager, writes } = managerFor({});

      await svc.release(manager as never, 'order-1');

      // This is the cap leak. Without the decrement, every abandoned basket
      // burns one use of a campaign that nobody paid for.
      expect(writes.couponDecrements).toBe(1);
      expect(writes.wallet[0]).toMatchObject({ status: CustomerCouponStatus.AVAILABLE });
      expect(writes.wallet[0]).toMatchObject({ redeemedOrderId: null });
    });

    it('does nothing for an order that never had a coupon', async () => {
      const svc = serviceFor(true);
      const { manager, writes } = managerFor({});

      await svc.release(manager as never, 'order-without-coupon');

      expect(writes.couponDecrements).toBe(0);
      expect(writes.wallet).toHaveLength(0);
    });
  });

  describe('confirm', () => {
    it('burns the coupon without moving the counter again', async () => {
      const svc = serviceFor(true);
      const { manager, writes } = managerFor({});

      await svc.confirm(manager as never, 'order-1');

      // Reserved already took the allowance; confirming must not take a second.
      // A double increment is the mirror-image of a cap leak.
      expect(writes.couponIncrements).toBe(0);
      expect(writes.couponDecrements).toBe(0);
      expect(writes.wallet[0]).toMatchObject({ status: CustomerCouponStatus.USED });
    });

    it('is idempotent, because a webhook can legitimately arrive twice', async () => {
      const svc = serviceFor(true);
      const { manager, writes, redemption } = managerFor({});

      await svc.confirm(manager as never, 'order-1');
      const afterFirst = writes.wallet.length;
      await svc.confirm(manager as never, 'order-1');

      // The replay must be a NO-OP, not a second spend. The redemption left
      // RESERVED on the first call and is CONFIRMED after it, so the second
      // call finds nothing to move and writes nothing at all. One write of the
      // wallet row, one transition, one coupon burnt.
      expect(writes.wallet.filter((w) => w.status === CustomerCouponStatus.USED)).toHaveLength(1);
      expect(writes.wallet).toHaveLength(afterFirst);
      expect(redemption().status).toBe(CouponRedemptionStatus.CONFIRMED);
      // Critically, confirm never decrements: a replayed webhook must not hand
      // a spent coupon back.
      expect(writes.couponDecrements).toBe(0);
    });
  });

  describe('round trip', () => {
    it('reserve then release leaves the counter exactly where it started', async () => {
      const svc = serviceFor(true);
      const { manager, writes } = managerFor({
        held: { customerId: 'cust-1', couponId: 'c1', status: CustomerCouponStatus.AVAILABLE },
        coupon: {
          code: 'WELCOME10',
          audience: 'all',
          appliesToSaleItems: true,
          type: CouponType.PERCENT_OFF,
          value: 10,
          usageCap: 100,
          perCustomerCap: 1,
          timesUsed: 7,
        },
      });

      await svc.reserve(manager as never, baseInput);
      await svc.release(manager as never, 'order-1');

      // 7 -> 8 -> 7. The whole design rests on this symmetry.
      expect(writes.couponIncrements - writes.couponDecrements).toBe(0);
    });
  });
});
