import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CouponCampaign } from './entities/coupon-campaign.entity';
import { CouponAudience } from './entities/coupon.entity';
import { Coupon } from './entities/coupon.entity';
import { CustomerCoupon, CustomerCouponSource, CustomerCouponStatus } from './entities/customer-coupon.entity';
import { CouponsService } from './coupons.service';
import { RoleName } from '../../common/enums';
import { DeliveryMethod } from '../orders/entities/order.entity';

const NOW = new Date('2026-10-06T12:00:00Z');
const END = new Date('2026-10-07T12:00:00Z');

function couponEntity(over: Partial<Coupon> = {}): Coupon {
  return {
    id: 'coupon-1',
    code: 'SAVE20NO',
    name: 'Twenty off',
    description: null,
    type: 'fixed_off' as Coupon['type'],
    value: 2000,
    maxDiscount: null,
    minSpend: null,
    startsAt: null,
    expiresAt: null,
    usageCap: null,
    perCustomerCap: 1,
    audience: CouponAudience.ALL,
    appliesToSaleItems: false,
    includeProducts: null,
    excludeProducts: null,
    includeCategories: null,
    excludeCategories: null,
    isActive: true,
    timesUsed: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  } as Coupon;
}

function walletRow(over: Partial<CustomerCoupon> = {}): CustomerCoupon {
  return {
    id: 'wc-1',
    customerId: 'cust-1',
    couponId: 'coupon-1',
    coupon: couponEntity(),
    status: CustomerCouponStatus.AVAILABLE,
    source: CustomerCouponSource.CODE_CLAIM,
    campaignId: null,
    claimKey: 'code:SAVE20NO',
    claimedAt: NOW,
    expiresAt: null,
    redeemedOrderId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  } as CustomerCoupon;
}

/** Minimal in-memory stand-ins: these tests are about behaviour, not SQL. */
function harness(options: { enabled?: boolean; wallet?: CustomerCoupon[] } = {}) {
  const wallet: CustomerCoupon[] = [...(options.wallet ?? [])];
  const saved: CustomerCoupon[] = [];

  const walletRepo = {
    find: ({ where }: { where: Partial<CustomerCoupon> }) => ({
      then: (r: (v: CustomerCoupon[]) => unknown) => {
        const rows = wallet.filter((w) =>
          Object.entries(where).every(
            ([k, v]) => v === undefined || v === null || w[k as keyof CustomerCoupon] === v,
          ),
        );
        r([...rows]);
        return { catch: () => ({}) };
      },
    }),
    findOne: ({ where }: { where: Partial<CustomerCoupon> }) => ({
      then: (r: (v: CustomerCoupon | null) => unknown) => {
        const hit =
          wallet.find((w) =>
            Object.entries(where).every(
              ([k, v]) => v === undefined || v === null || w[k as keyof CustomerCoupon] === v,
            ),
          ) ??
          saved.find((w) =>
            Object.entries(where).every(
              ([k, v]) => v === undefined || v === null || w[k as keyof CustomerCoupon] === v,
            ),
          ) ??
          null;
        r(hit);
        return { catch: () => ({}) };
      },
    }),
    createQueryBuilder: () => walletQB,
    create: (v: Partial<CustomerCoupon>) => v as CustomerCoupon,
    save: (v: CustomerCoupon) => {
      saved.push(v);
      return Promise.resolve(v);
    },
  };

// A single fluent stub: every chain method returns the same object, so the
  // service can chain innerJoin -> where -> andWhere -> getOne as it does with
  // a real TypeORM query builder.
  const walletQB: Record<string, unknown> = {};
  walletQB.innerJoinAndSelect = () => walletQB;
  walletQB.where = () => walletQB;
  walletQB.andWhere = () => walletQB;
  walletQB.getOne = () => Promise.resolve(wallet[0] ?? null);
  walletQB.createQueryBuilder = () => walletQB;

  const service = new CouponsService(
    walletRepo as never,
    { find: async () => [] } as never,
    { find: async () => [] } as never,
    { get: async () => ({ couponsEnabled: options.enabled ?? true }) } as never,
    { isNewCustomer: async () => false } as never,
    {
      quote: async () => ({ status: 'not_applicable', feeKobo: 0, estimate: '' }),
    } as never,
  );
  return { service, wallet, saved, walletRepo, walletQB };
}

const ACTOR = { id: 'cust-1', email: 'ada@example.com', role: RoleName.CUSTOMER } as never;

describe('coupons service', () => {
  describe('the feature flag', () => {
    it('reports the setting', async () => {
      const { service } = harness({ enabled: true });
      await expect(service.isEnabled()).resolves.toBe(true);
    });

    it('reports off when the setting is off', async () => {
      const { service } = harness({ enabled: false });
      await expect(service.isEnabled()).resolves.toBe(false);
    });
  });

  describe('preview with the flag off', () => {
    it('returns a disabled result and touches nothing', async () => {
      const { service, saved } = harness({ enabled: false, wallet: [walletRow()] });
      const result = await service.preview(
        { lines: [{ variantId: 'v', productId: 'p', categoryIds: [], quantity: 1, unitPrice: 10000, isOnSale: false }], subtotal: 10000, state: 'Lagos', method: DeliveryMethod.FREIGHT },
        ACTOR,
        NOW,
        false,
      );
      expect(result.status).toBe('disabled');
      expect(result.totals).toBeNull();
      expect(result.eligible).toEqual([]);
      expect(result.nudge).toBeNull();
      expect(saved).toHaveLength(0);
    });

    it('reserves nothing with the flag on either', async () => {
      const { service, saved } = harness({ enabled: true, wallet: [walletRow()] });
      await service.preview(
        { lines: [{ variantId: 'v', productId: 'p', categoryIds: [], quantity: 1, unitPrice: 10000, isOnSale: false }], subtotal: 10000 },
        ACTOR,
        NOW,
        false,
      );
      expect(saved).toHaveLength(0);
    });
  });

  describe('preview totals', () => {
    it('discounts the basket through computeTotals', async () => {
      const { service } = harness({ enabled: true, wallet: [walletRow()] });
      const result = await service.preview(
        { lines: [{ variantId: 'v', productId: 'p', categoryIds: [], quantity: 1, unitPrice: 10000, isOnSale: false }], subtotal: 10000 },
        ACTOR,
        NOW,
        false,
      );
      expect(result.status).toBe('ok');
      expect(result.totals?.itemDiscount).toBe(2000);
      expect(result.totals?.total).toBe(8000);
      expect(result.selected.item?.code).toBe('SAVE20NO');
    });

    it('reports the shortfall for a coupon the basket cannot reach', async () => {
      const { service } = harness({
        enabled: true,
        wallet: [walletRow({ coupon: couponEntity({ minSpend: 50000 }) })],
      });
      const result = await service.preview(
        { lines: [{ variantId: 'v', productId: 'p', categoryIds: [], quantity: 1, unitPrice: 10000, isOnSale: false }], subtotal: 10000 },
        ACTOR,
        NOW,
        false,
      );
      expect(result.nudge?.spendMore).toBe(40000);
      expect(result.nudge?.code).toBe('SAVE20NO');
      expect(result.selected.item).toBeNull();
    });
  });

  describe('claim by code', () => {
    it('returns the existing entry when the same code is claimed twice', async () => {
      const existing = walletRow();
      const { service } = harness({ enabled: true, wallet: [existing] });
      const again = await service.claimByCode('save20no', ACTOR, NOW);
      expect(again.alreadyHeld).toBe(true);
      expect(again.wallet.id).toBe('wc-1');
    });

    it('matches the code case-insensitively', async () => {
      const { service } = harness({ enabled: true, wallet: [walletRow()] });
      await expect(service.claimByCode('  SaVe20No  ', ACTOR, NOW)).resolves.toMatchObject({
        alreadyHeld: true,
      });
    });

    it('gives the same error for an unknown code', async () => {
      const { service } = harness({ enabled: true });
      await expect(service.claimByCode('NOPE4040', ACTOR, NOW)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('campaign windows use the server clock', () => {
    const campaign = (over: Partial<CouponCampaign> = {}) =>
      ({
        id: 'camp-1',
        badgeText: '-50%',
        headline: 'Half price',
        offerText: 'On everything',
        labelText: 'Limited time offer',
        startsAt: new Date('2026-10-06T00:00:00Z'),
        endsAt: END,
        placement: 'home_top',
        claimKind: 'coupon',
        couponId: 'coupon-1',
        bundleId: null,
        isActive: true,
        createdAt: NOW,
        updatedAt: NOW,
        ...over,
      }) as CouponCampaign;

    it('refuses a claim before the window opens', async () => {
      const { service } = harness({ enabled: true });
      Object.assign(service as never, {});
      const repo = { findOne: async () => campaign({ startsAt: new Date('2026-10-10T00:00:00Z') }) };
      const svc = new CouponsService(
        { findOne: async () => null, find: async () => [], create: (v: unknown) => v, save: async (v: unknown) => v } as never,
        { find: async () => [] } as never,
        repo as never,
        { get: async () => ({ couponsEnabled: true }) } as never,
        { isNewCustomer: async () => false } as never,
        { quote: async () => null } as never,
      );
      await expect(svc.claimCampaign('camp-1', ACTOR, NOW)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses a claim after the window closes', async () => {
      const repo = { findOne: async () => campaign({ endsAt: new Date('2026-10-06T11:00:00Z') }) };
      const svc = new CouponsService(
        { findOne: async () => null, find: async () => [], create: (v: unknown) => v, save: async (v: unknown) => v } as never,
        { find: async () => [] } as never,
        repo as never,
        { get: async () => ({ couponsEnabled: true }) } as never,
        { isNewCustomer: async () => false } as never,
        { quote: async () => null } as never,
      );
      await expect(svc.claimCampaign('camp-1', ACTOR, NOW)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses a client-supplied future time', async () => {
      // The window is closed, but a client claiming to believe it is still open
      // gets the same refusal, because the service never reads a client clock.
      const repo = { findOne: async () => campaign({ endsAt: new Date('2026-10-06T11:00:00Z') }) };
      const svc = new CouponsService(
        { findOne: async () => null, find: async () => [], create: (v: unknown) => v, save: async (v: unknown) => v } as never,
        { find: async () => [] } as never,
        repo as never,
        { get: async () => ({ couponsEnabled: true }) } as never,
        { isNewCustomer: async () => false } as never,
        { quote: async () => null } as never,
      );
      await expect(svc.claimCampaign('camp-1', ACTOR, NOW)).rejects.toThrow(/ended/i);
    });

    it('claims inside the window', async () => {
      const repo = { findOne: async () => campaign() };
      const svc = new CouponsService(
        {
          findOne: async () => null,
          find: async () => [],
          create: (v: unknown) => v,
          save: async (v: unknown) => v,
        } as never,
        { find: async () => [] } as never,
        repo as never,
        { get: async () => ({ couponsEnabled: true }) } as never,
        { isNewCustomer: async () => false } as never,
        { quote: async () => null } as never,
      );
      await expect(svc.claimCampaign('camp-1', ACTOR, NOW)).resolves.toMatchObject({
        status: 'running',
      });
    });

    it('is idempotent - claiming twice returns the existing entry', async () => {
      const existing = walletRow({ claimKey: 'campaign:camp-1', source: CustomerCouponSource.CAMPAIGN, campaignId: 'camp-1' });
      const repo = { findOne: async () => campaign() };
      const svc = new CouponsService(
        {
          findOne: async ({ where }: { where: Partial<CustomerCoupon> }) =>
            where.claimKey === 'campaign:camp-1' ? existing : null,
          find: async () => [],
          create: (v: unknown) => v,
          save: async (v: unknown) => v,
        } as never,
        { find: async () => [] } as never,
        repo as never,
        { get: async () => ({ couponsEnabled: true }) } as never,
        { isNewCustomer: async () => false } as never,
        { quote: async () => null } as never,
      );
      const result = await svc.claimCampaign('camp-1', ACTOR, NOW);
      expect(result.wallet).toHaveLength(1);
      expect(result.wallet[0].id).toBe('wc-1');
    });
  });

  describe('wallet', () => {
    it('splits entries into tabs', async () => {
      const { service } = harness({
        wallet: [
          walletRow({ id: 'a', status: CustomerCouponStatus.AVAILABLE }),
          walletRow({ id: 'b', status: CustomerCouponStatus.USED }),
          walletRow({ id: 'c', status: CustomerCouponStatus.REVOKED }),
        ],
      });
      const wallet = await service.walletFor('cust-1', NOW);
      expect(wallet.available).toHaveLength(1);
      expect(wallet.used).toHaveLength(1);
      expect(wallet.revoked).toHaveLength(1);
    });

    it('shows a lapsed entry as expired without a sweeper', async () => {
      const { service } = harness({
        wallet: [walletRow({ expiresAt: new Date('2026-10-01T00:00:00Z') })],
      });
      const wallet = await service.walletFor('cust-1', NOW);
      expect(wallet.available).toHaveLength(0);
      expect(wallet.expired).toHaveLength(1);
    });

    it('keeps an unexpired entry available', async () => {
      const { service } = harness({
        wallet: [walletRow({ expiresAt: END })],
      });
      const wallet = await service.walletFor('cust-1', NOW);
      expect(wallet.available).toHaveLength(1);
    });
  });

  describe('the active campaign feed', () => {
    it('returns null when nothing is running', async () => {
      const { service } = harness();
      await expect(service.activeCampaign('home_top', NOW)).resolves.toBeNull();
    });

it('returns the server time alongside the window', async () => {
      const repo = {
        find: async () => [
          {
            id: 'camp-1',
            badgeText: '-50%',
            headline: 'Half price',
            offerText: null,
            labelText: 'Limited time offer',
            startsAt: new Date('2026-10-06T00:00:00Z'),
            endsAt: END,
            claimKind: 'coupon',
          },
        ],
      };
      const svc = new CouponsService(
        { findOne: async () => null, find: async () => [], create: (v: unknown) => v, save: async (v: unknown) => v } as never,
        { find: async () => [] } as never,
        repo as never,
        { get: async () => ({ couponsEnabled: true }) } as never,
        { isNewCustomer: async () => false } as never,
        { quote: async () => null } as never,
      );
      const live = await svc.activeCampaign('home_top', NOW);
      expect(live?.status).toBe('running');
      expect(live?.serverNow).toBe(NOW.toISOString());
    });
  });
});

