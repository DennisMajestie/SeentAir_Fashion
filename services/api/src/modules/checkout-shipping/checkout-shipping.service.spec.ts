import { ConfigService } from '@nestjs/config';
import { DeliveryMethod } from '../orders/entities/order.entity';
import { CheckoutShippingService, QuoteStatus } from './checkout-shipping.service';
import { ProductSizeClass } from './shipping-size-class';
import { ZoneRateProvider } from './zone-rate.provider';

/**
 * The quote rules, exercised against a fake provider so the whole matrix is
 * cheap to check and no rate tables are needed.
 */
class FakeProvider implements ZoneRateProvider {
  zones = new Map<string, { id: string; name: string; stateKey: string; state: string }>();
  rates: { zoneId: string; sizeClass: ProductSizeClass; method: DeliveryMethod; fee: number }[] = [];

  async findZoneForState(stateKey: string) {
    return this.zones.get(stateKey) ?? null;
  }

  async findRate(zoneId: string, sizeClass: ProductSizeClass, method: DeliveryMethod) {
    const hit = this.rates.find(
      (r) => r.zoneId === zoneId && r.sizeClass === sizeClass && r.method === method,
    );
    return hit ? { id: 'r1', fee: hit.fee, validFrom: new Date(0), validTo: null } : null;
  }
}

function harness(settings: Record<string, unknown>) {
  const provider = new FakeProvider();
  const config = { get: (key: string) => (key === 'auth.secret' ? 'test-secret' : undefined) };
    const service = new CheckoutShippingService(
      provider as ZoneRateProvider,
      { get: async () => settings } as never,
      config as ConfigService,
      // Quotes are persisted so an order can consume one exactly once.
      { create: (v: unknown) => v, save: async (v: unknown) => ({ id: 'q1', ...(v as object) }) } as never,
    );
  return { provider, service };
}

const shippingOn = {
  shippingEnabled: true,
  freeDeliveryThreshold: null,
  quoteExpiryMinutes: 60,
  vatEnabled: false,
  vatRatePercent: 0,
  pricesIncludeVat: false,
  deliveryTaxable: false,
};

const NOW = new Date('2026-10-06T12:00:00Z');

describe('checkout shipping quote', () => {
  describe('with the feature flag off', () => {
    it('returns not_applicable with a zero fee and never looks up a zone', async () => {
      const { service, provider } = harness({ ...shippingOn, shippingEnabled: false });
      const result = await service.quote(
        { state: 'Lagos', lines: [{ sizeClass: 'medium', quantity: 1 }], method: DeliveryMethod.FREIGHT, subtotal: 10000 },
        null,
        NOW,
      );
      expect(result.status).toBe(QuoteStatus.NOT_APPLICABLE);
      expect(result.feeKobo).toBe(0);
      expect(result.quoteToken).toBeUndefined();
      expect(provider.zones.size).toBe(0);
    });

    it('returns not_applicable even for an unservable state', async () => {
      const { service } = harness({ ...shippingOn, shippingEnabled: false });
      const result = await service.quote(
        { state: 'Accra', lines: [{ sizeClass: 'medium', quantity: 1 }], method: DeliveryMethod.FREIGHT, subtotal: 10000 },
        null,
        NOW,
      );
      expect(result.status).toBe(QuoteStatus.NOT_APPLICABLE);
      expect(result.feeKobo).toBe(0);
    });
  });

  describe('destinations', () => {
    it('quotes a served state', async () => {
      const { service, provider } = harness(shippingOn);
      provider.zones.set('lag', { id: 'z1', name: 'Lagos Zone', stateKey: 'lag', state: 'Lagos' });
      provider.rates.push({ zoneId: 'z1', sizeClass: ProductSizeClass.MEDIUM, method: DeliveryMethod.FREIGHT, fee: 2500 });

      const result = await service.quote(
        { state: ' Lagos ', lines: [{ sizeClass: 'medium', quantity: 1 }], method: DeliveryMethod.FREIGHT, subtotal: 50000 },
        null,
        NOW,
      );
      expect(result.status).toBe(QuoteStatus.QUOTED);
      expect(result.feeKobo).toBe(250000);
      expect(result.zoneName).toBe('Lagos Zone');
      expect(result.quoteToken).toBeDefined();
    });

    it('says unserviceable for a state we do not ship to', async () => {
      const { service } = harness(shippingOn);
      const result = await service.quote(
        { state: 'Accra', lines: [{ sizeClass: 'medium', quantity: 1 }], method: DeliveryMethod.FREIGHT, subtotal: 50000 },
        null,
        NOW,
      );
      expect(result.status).toBe(QuoteStatus.UNSERVICEABLE_STATE);
      expect(result.feeKobo).toBe(0);
    });

    it('never guesses a fee for an unmatched state', async () => {
      const { service, provider } = harness(shippingOn);
      provider.zones.set('lag', { id: 'z1', name: 'Lagos Zone', stateKey: 'lag', state: 'Lagos' });
      const result = await service.quote(
        { state: 'Ikeja', lines: [{ sizeClass: 'medium', quantity: 1 }], method: DeliveryMethod.FREIGHT, subtotal: 50000 },
        null,
        NOW,
      );
      expect(result.status).not.toBe(QuoteStatus.QUOTED);
      expect(result.feeKobo).toBe(0);
    });

    it('reports no_rate when the state is served but the band is unpriced', async () => {
      const { service, provider } = harness(shippingOn);
      provider.zones.set('lag', { id: 'z1', name: 'Lagos Zone', stateKey: 'lag', state: 'Lagos' });
      const result = await service.quote(
        { state: 'Lagos', lines: [{ sizeClass: 'heavy', quantity: 1 }], method: DeliveryMethod.FREIGHT, subtotal: 50000 },
        null,
        NOW,
      );
      expect(result.status).toBe(QuoteStatus.NO_RATE);
      expect(result.feeKobo).toBe(0);
    });
  });

  describe('size classes', () => {
    async function quoteFor(lines: { sizeClass: string | null; quantity: number }[], method = DeliveryMethod.FREIGHT) {
      const { service, provider } = harness(shippingOn);
      const feeFor: Record<string, number> = { light: 1000, medium: 2000, heavy: 3000 };
      provider.zones.set('lag', { id: 'z1', name: 'Lagos Zone', stateKey: 'lag', state: 'Lagos' });
      for (const sizeClass of ['light', 'medium', 'heavy']) {
        provider.rates.push({
          zoneId: 'z1',
          sizeClass: sizeClass as ProductSizeClass,
          method: DeliveryMethod.FREIGHT,
          fee: feeFor[sizeClass],
        });
      }
      return service.quote({ state: 'Lagos', lines, method, subtotal: 100000 }, null, NOW);
    }

    it('prices each band from its own rate', async () => {
      expect((await quoteFor([{ sizeClass: 'light', quantity: 1 }])).feeKobo).toBe(100000);
      expect((await quoteFor([{ sizeClass: 'medium', quantity: 1 }])).feeKobo).toBe(200000);
      expect((await quoteFor([{ sizeClass: 'heavy', quantity: 1 }])).feeKobo).toBe(300000);
    });

    it('uses the heaviest band in a mixed basket', async () => {
      const result = await quoteFor([
        { sizeClass: 'light', quantity: 5 },
        { sizeClass: 'heavy', quantity: 1 },
      ]);
      expect(result.sizeClass).toBe(ProductSizeClass.HEAVY);
      expect(result.feeKobo).toBe(300000);
    });

    it('treats an unknown or missing band as medium', async () => {
      expect((await quoteFor([{ sizeClass: null, quantity: 1 }])).feeKobo).toBe(200000);
      expect((await quoteFor([{ sizeClass: 'gigantic', quantity: 1 }])).feeKobo).toBe(200000);
    });

    it('prices pickup separately from freight', async () => {
      const { service, provider } = harness(shippingOn);
      provider.zones.set('lag', { id: 'z1', name: 'Lagos Zone', stateKey: 'lag', state: 'Lagos' });
      provider.rates.push({ zoneId: 'z1', sizeClass: ProductSizeClass.MEDIUM, method: DeliveryMethod.PICKUP, fee: 0 });

      const pickup = await service.quote(
        { state: 'Lagos', lines: [{ sizeClass: 'medium', quantity: 1 }], method: DeliveryMethod.PICKUP, subtotal: 50000 },
        null,
        NOW,
      );
      expect(pickup.status).toBe(QuoteStatus.QUOTED);
      expect(pickup.feeKobo).toBe(0);
    });
  });

  describe('the free-delivery threshold', () => {
    const threshold = { ...shippingOn, freeDeliveryThreshold: 20000 };

    it('waives the fee exactly at the threshold', async () => {
      const { service, provider } = harness(threshold);
      provider.zones.set('lag', { id: 'z1', name: 'Lagos Zone', stateKey: 'lag', state: 'Lagos' });
      provider.rates.push({ zoneId: 'z1', sizeClass: ProductSizeClass.MEDIUM, method: DeliveryMethod.FREIGHT, fee: 2500 });

      const result = await service.quote(
        { state: 'Lagos', lines: [{ sizeClass: 'medium', quantity: 1 }], method: DeliveryMethod.FREIGHT, subtotal: 20000 },
        null,
        NOW,
      );
      expect(result.feeKobo).toBe(0);
      expect(result.freeDeliveryApplied).toBe(true);
    });

    it('charges one kobo below the threshold', async () => {
      const { service, provider } = harness(threshold);
      provider.zones.set('lag', { id: 'z1', name: 'Lagos Zone', stateKey: 'lag', state: 'Lagos' });
      provider.rates.push({ zoneId: 'z1', sizeClass: ProductSizeClass.MEDIUM, method: DeliveryMethod.FREIGHT, fee: 2500 });

      const result = await service.quote(
        { state: 'Lagos', lines: [{ sizeClass: 'medium', quantity: 1 }], method: DeliveryMethod.FREIGHT, subtotal: 19999 },
        null,
        NOW,
      );
      expect(result.feeKobo).toBe(250000);
      expect(result.freeDeliveryApplied).toBe(false);
    });

    it('charges the fee when the threshold is off', async () => {
      const { service, provider } = harness(shippingOn);
      provider.zones.set('lag', { id: 'z1', name: 'Lagos Zone', stateKey: 'lag', state: 'Lagos' });
      provider.rates.push({ zoneId: 'z1', sizeClass: ProductSizeClass.MEDIUM, method: DeliveryMethod.FREIGHT, fee: 2500 });
      const result = await service.quote(
        { state: 'Lagos', lines: [{ sizeClass: 'medium', quantity: 1 }], method: DeliveryMethod.FREIGHT, subtotal: 1000000 },
        null,
        NOW,
      );
      expect(result.feeKobo).toBe(250000);
    });
  });

  describe('the quote token', () => {
    it('expires on the configured window', async () => {
      const { service, provider } = harness({ ...shippingOn, quoteExpiryMinutes: 30 });
      provider.zones.set('lag', { id: 'z1', name: 'Lagos Zone', stateKey: 'lag', state: 'Lagos' });
      provider.rates.push({ zoneId: 'z1', sizeClass: ProductSizeClass.MEDIUM, method: DeliveryMethod.FREIGHT, fee: 2500 });

      const result = await service.quote(
        { state: 'Lagos', lines: [{ sizeClass: 'medium', quantity: 1 }], method: DeliveryMethod.FREIGHT, subtotal: 50000 },
        null,
        NOW,
      );
      expect(result.expiresAt?.getTime()).toBe(NOW.getTime() + 30 * 60_000);
    });

    it('is not issued for anything other than a real quote', async () => {
      const { service } = harness(shippingOn);
      const result = await service.quote(
        { state: 'Accra', lines: [{ sizeClass: 'medium', quantity: 1 }], method: DeliveryMethod.FREIGHT, subtotal: 50000 },
        null,
        NOW,
      );
      expect(result.quoteToken).toBeUndefined();
    });
  });

  describe('an empty basket', () => {
    it('is not quoted', async () => {
      const { service } = harness(shippingOn);
      const result = await service.quote(
        { state: 'Lagos', lines: [], method: DeliveryMethod.FREIGHT, subtotal: 0 },
        null,
        NOW,
      );
      expect(result.status).toBe(QuoteStatus.EMPTY);
      expect(result.feeKobo).toBe(0);
    });
  });
});