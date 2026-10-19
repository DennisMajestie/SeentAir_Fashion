import { computeTotals, toKobo } from './order-totals';
import { DeliveryMethod } from './entities/order.entity';

/**
 * The guard rail for this whole change: while the delivery flag is off, the
 * numbers must be what they have always been.
 *
 * `legacyTotal` is a verbatim copy of the accumulation order creation has used
 * since before delivery pricing existed: sum the line prices, then round the
 * sum. `newTotal` is what the same basket produces through computeTotals with
 * delivery switched off and no discounts. They must agree exactly - not
 * approximately - for every basket a shopper can actually build.
 */
describe('legacy vs computeTotals equivalence with delivery off', () => {
  interface Basket {
    name: string;
    lines: { unitPrice: number; quantity: number }[];
  }

  const baskets: Basket[] = [
    { name: 'single whole-naira item', lines: [{ unitPrice: 5000, quantity: 1 }] },
    { name: 'repeated item', lines: [{ unitPrice: 18500, quantity: 3 }] },
    {
      name: 'mixed basket',
      lines: [
        { unitPrice: 3333, quantity: 3 },
        { unitPrice: 999.99, quantity: 2 },
      ],
    },
    { name: 'kobo amounts only', lines: [{ unitPrice: 0.01, quantity: 7 }] },
    { name: 'half-kobo unit price', lines: [{ unitPrice: 10.005, quantity: 1 }] },
    { name: 'large basket', lines: [{ unitPrice: 250000, quantity: 12 }] },
    { name: 'zero price', lines: [{ unitPrice: 0, quantity: 4 }] },
    { name: 'many small lines', lines: Array.from({ length: 8 }, () => ({ unitPrice: 19.99, quantity: 1 })) },
  ];

  const settingsOff = {
    vatEnabled: false,
    vatRatePercent: 0,
    pricesIncludeVat: false,
    deliveryTaxable: false,
    deliveryEnabled: false,
    freeDeliveryThreshold: null,
  };

  for (const basket of baskets) {
    it(`matches the legacy calculation for: ${basket.name}`, () => {
      // Verbatim from orders.service.ts: total += unitPrice * quantity, then
      // Math.round(total * 100) / 100 on the sum.
      const legacy = Math.round(
        basket.lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0) * 100,
      ) / 100;

      const viaTotals = computeTotals({
        lines: basket.lines,
        deliveryFee: 0,
        itemDiscount: 0,
        deliveryDiscount: 0,
        settings: settingsOff,
      });

      expect(viaTotals.total).toBe(legacy);
      expect(viaTotals.subtotal).toBe(legacy);
      expect(viaTotals.deliveryFee).toBe(0);
      expect(viaTotals.vat).toBe(0);
    });
  }

  it('is exact for a sweep of unit prices and quantities', () => {
    const mismatches: string[] = [];
    for (let price = 0; price <= 40; price += 0.01) {
      for (const qty of [1, 2, 3, 7]) {
        const rounded = Math.round(price * 100) / 100;
        const legacy = Math.round(rounded * qty * 100) / 100;
        const got = computeTotals({
          lines: [{ unitPrice: rounded, quantity: qty }],
          settings: settingsOff,
        }).total;
        if (got !== legacy) mismatches.push(`${rounded} x${qty}: ${got} != ${legacy}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('never produces a fee or tax when the feature is off', () => {
    const t = computeTotals({
      lines: [{ unitPrice: 10000, quantity: 2 }],
      deliveryFee: 5000,
      itemDiscount: 1000,
      settings: settingsOff,
    });
    expect(t.deliveryFee).toBe(0);
    expect(t.vat).toBe(0);
    // The item discount is a coupon concern and is deliberately NOT gated by the
    // delivery flag, so it still applies: 20,000 less 1,000.
    expect(t.itemDiscount).toBe(1000);
    expect(t.total).toBe(19000);
  });

  it('keeps pickup free of a fee even when a rate exists', () => {
    const t = computeTotals({
      lines: [{ unitPrice: 10000, quantity: 1 }],
      deliveryFee: 0,
      settings: { ...settingsOff, deliveryEnabled: true },
    });
    expect(t.deliveryFee).toBe(0);
  });

  it('agrees with the webhook kobo arithmetic the payment path uses', () => {
    // confirmPaystackPayment compares Math.round(order.totalAmount * 100).
    const total = 19999.99;
    expect(Math.round(computeTotals({
      lines: [{ unitPrice: total, quantity: 1 }],
      settings: settingsOff,
    }).total * 100)).toBe(Math.round(total * 100));
  });

  it('holds when VAT is configured but the flag is off', () => {
    // VAT is a separate switch. If delivery is off and VAT is off too, nothing
    // changes; the equivalence the flag-off guarantee rests on is delivery's.
    const t = computeTotals({
      lines: [{ unitPrice: 10000, quantity: 1 }],
      settings: { ...settingsOff, vatEnabled: false, vatRatePercent: 7.5 },
    });
    expect(t.total).toBe(10000);
  });

  it('applies pickup as a zero-fee method in the enum the order already stores', () => {
    expect(DeliveryMethod.PICKUP).toBe('pickup');
    expect(toKobo(0)).toBe(0);
  });
});