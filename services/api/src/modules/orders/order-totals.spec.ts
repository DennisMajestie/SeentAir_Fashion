import { MAX_VAT_PERCENT, computeTotals, fromKobo, toKobo } from './order-totals';

describe('order totals', () => {
  const off = {
    vatEnabled: false,
    vatRatePercent: 0,
    pricesIncludeVat: false,
    deliveryTaxable: false,
    deliveryEnabled: false,
  };

  const exclusiveVat = {
    vatEnabled: true,
    vatRatePercent: 7.5,
    pricesIncludeVat: false,
    deliveryTaxable: false,
    deliveryEnabled: false,
  };

  const inclusiveVat = { ...exclusiveVat, pricesIncludeVat: true };

  describe('kobo conversion', () => {
    it('rounds a major amount to whole kobo', () => {
      expect(toKobo(5000)).toBe(500000);
      expect(toKobo(19.99)).toBe(1999);
    });

    it('rounds a half kobo up', () => {
      expect(toKobo(0.005)).toBe(1);
    });

    it('treats junk as zero rather than NaN', () => {
      expect(toKobo(Number.NaN)).toBe(0);
      expect(toKobo(Number.POSITIVE_INFINITY)).toBe(0);
    });

    it('returns major units again', () => {
      expect(fromKobo(1999)).toBe(19.99);
    });
  });

  describe('with every feature off', () => {
    it('is the plain subtotal', () => {
      const totals = computeTotals({ lines: [{ unitPrice: 5000, quantity: 2 }], settings: off });
      expect(totals.subtotal).toBe(10000);
      expect(totals.deliveryFee).toBe(0);
      expect(totals.vat).toBe(0);
      expect(totals.total).toBe(10000);
    });

    it('matches the sum-then-round order creation has always used', () => {
      const lines = [
        { unitPrice: 3333, quantity: 3 },
        { unitPrice: 999.99, quantity: 2 },
      ];
      const legacy = Math.round(
        lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0) * 100,
      ) / 100;
      expect(computeTotals({ lines, settings: off }).total).toBe(legacy);
    });

    it('ignores a quoted delivery fee while the flag is off', () => {
      const totals = computeTotals({
        lines: [{ unitPrice: 1000, quantity: 1 }],
        deliveryFee: 2500,
        settings: off,
      });
      expect(totals.deliveryFee).toBe(0);
      expect(totals.total).toBe(1000);
    });
  });

  describe('quantities', () => {
    it('ignores zero, negative and fractional quantities', () => {
      const totals = computeTotals({
        lines: [
          { unitPrice: 1000, quantity: 0 },
          { unitPrice: 1000, quantity: -3 },
          { unitPrice: 1000, quantity: 2.9 },
        ],
        settings: off,
      });
      expect(totals.subtotal).toBe(2000);
    });

    it('treats an empty basket as zero, not a crash', () => {
      const totals = computeTotals({ lines: [], settings: off });
      expect(totals.total).toBe(0);
      expect(totals.vat).toBe(0);
    });
  });

  describe('VAT charged on top', () => {
    it('adds the rate to the taxable base', () => {
      const totals = computeTotals({
        lines: [{ unitPrice: 10000, quantity: 1 }],
        settings: exclusiveVat,
      });
      expect(totals.vat).toBe(750);
      expect(totals.total).toBe(10750);
    });

    it('is zero at a zero rate', () => {
      const totals = computeTotals({
        lines: [{ unitPrice: 10000, quantity: 1 }],
        settings: { ...exclusiveVat, vatRatePercent: 0 },
      });
      expect(totals.vat).toBe(0);
      expect(totals.total).toBe(10000);
    });

    it('excludes exempt lines from the base', () => {
      const totals = computeTotals({
        lines: [
          { unitPrice: 10000, quantity: 1 },
          { unitPrice: 10000, quantity: 1, taxExempt: true },
        ],
        settings: exclusiveVat,
      });
      expect(totals.taxableBase).toBe(10000);
      expect(totals.vat).toBe(750);
      expect(totals.total).toBe(20750);
    });

    it('adds nothing to the base when everything is exempt', () => {
      const totals = computeTotals({
        lines: [{ unitPrice: 10000, quantity: 1, taxExempt: true }],
        settings: exclusiveVat,
      });
      expect(totals.vat).toBe(0);
    });

    it('clamps a mistyped rate to the ceiling', () => {
      const totals = computeTotals({
        lines: [{ unitPrice: 1000, quantity: 1 }],
        settings: { ...exclusiveVat, vatRatePercent: 5000 },
      });
      expect(totals.vat).toBe(fromKobo((toKobo(1000) * MAX_VAT_PERCENT) / 100));
    });
  });

  describe('VAT already inside the price', () => {
    it('extracts the tax from the base without charging it twice', () => {
      const totals = computeTotals({
        lines: [{ unitPrice: 10750, quantity: 1 }],
        settings: inclusiveVat,
      });
      expect(totals.vat).toBe(750);
      expect(totals.total).toBe(10750);
    });

    it('leaves an exclusive-priced basket and an inclusive-priced basket costing the same', () => {
      const exclusive = computeTotals({
        lines: [{ unitPrice: 10000, quantity: 1 }],
        settings: exclusiveVat,
      });
      const inclusive = computeTotals({
        lines: [{ unitPrice: 10750, quantity: 1 }],
        settings: inclusiveVat,
      });
      expect(inclusive.total).toBe(exclusive.total);
      expect(inclusive.total - inclusive.vat).toBe(exclusive.total - exclusive.vat);
    });
  });

  describe('delivery', () => {
    const shipping = { ...exclusiveVat, deliveryEnabled: true };

    it('charges the quoted fee when the flag is on', () => {
      const totals = computeTotals({
        lines: [{ unitPrice: 10000, quantity: 1 }],
        deliveryFee: 2500,
        settings: shipping,
      });
      expect(totals.deliveryFee).toBe(2500);
      expect(totals.total).toBe(13250);
    });

    it('waives the fee for a free-delivery coupon', () => {
      const totals = computeTotals({
        lines: [{ unitPrice: 10000, quantity: 1 }],
        deliveryFee: 2500,
        deliveryDiscount: 2500,
        settings: shipping,
      });
      expect(totals.deliveryWaived).toBe(2500);
      expect(totals.deliveryFee).toBe(0);
      expect(totals.total).toBe(10750);
    });

    it('never waives more than the fee', () => {
      const totals = computeTotals({
        lines: [{ unitPrice: 10000, quantity: 1 }],
        deliveryFee: 2500,
        deliveryDiscount: 9000,
        settings: shipping,
      });
      expect(totals.deliveryWaived).toBe(2500);
      expect(totals.total).toBe(10750);
    });

    it('puts the fee in the base only when delivery is taxable', () => {
      const taxable = computeTotals({
        lines: [{ unitPrice: 10000, quantity: 1 }],
        deliveryFee: 2500,
        settings: { ...shipping, deliveryTaxable: true },
      });
      const notTaxable = computeTotals({
        lines: [{ unitPrice: 10000, quantity: 1 }],
        deliveryFee: 2500,
        settings: { ...shipping, deliveryTaxable: false },
      });
      expect(taxable.taxableBase).toBe(12500);
      expect(taxable.vat).toBe(937.5);
      expect(notTaxable.taxableBase).toBe(10000);
      expect(notTaxable.vat).toBe(750);
    });
  });

  describe('item discounts', () => {
    const discounted = { ...exclusiveVat, deliveryEnabled: true };

    it('takes the discount off before VAT is computed', () => {
      const totals = computeTotals({
        lines: [{ unitPrice: 10000, quantity: 1 }],
        itemDiscount: 2000,
        settings: discounted,
      });
      expect(totals.itemDiscount).toBe(2000);
      expect(totals.taxableBase).toBe(8000);
      expect(totals.vat).toBe(600);
      expect(totals.total).toBe(8600);
    });

    it('never discounts past the subtotal', () => {
      const totals = computeTotals({
        lines: [{ unitPrice: 1000, quantity: 1 }],
        itemDiscount: 5000,
        settings: discounted,
      });
      expect(totals.itemDiscount).toBe(1000);
      expect(totals.total).toBe(0);
    });

    it('shrinks the taxable base in proportion, not wholly', () => {
      const totals = computeTotals({
        lines: [
          { unitPrice: 10000, quantity: 1 },
          { unitPrice: 10000, quantity: 1, taxExempt: true },
        ],
        itemDiscount: 5000,
        settings: discounted,
      });
      expect(totals.itemDiscount).toBe(5000);
      expect(totals.taxableBase).toBe(7500);
      expect(totals.vat).toBe(562.5);
    });
  });

  describe('rounding', () => {
    it('rounds a half-kobo VAT to the nearest kobo', () => {
      // 1 kobo at 50% is exactly half a kobo, which must resolve to one kobo.
      const totals = computeTotals({
        lines: [{ unitPrice: 0.01, quantity: 1 }],
        settings: { ...exclusiveVat, vatRatePercent: 50 },
      });
      expect(totals.vat).toBe(0.01);
      expect(totals.total).toBe(0.02);
    });

    it('rounds a half-kobo down without ever going below the subtotal', () => {
      // 1 kobo at 25% is a quarter kobo, which rounds away to nothing.
      const totals = computeTotals({
        lines: [{ unitPrice: 0.01, quantity: 1 }],
        settings: { ...exclusiveVat, vatRatePercent: 25 },
      });
      expect(totals.vat).toBe(0);
      expect(totals.total).toBe(0.01);
    });

    it('totals the rounded parts rather than re-rounding a product', () => {
      const totals = computeTotals({
        lines: [
          { unitPrice: 0.01, quantity: 3 },
          { unitPrice: 0.01, quantity: 3 },
        ],
        settings: { ...exclusiveVat, vatRatePercent: 7.5 },
      });
      expect(totals.subtotal).toBe(0.06);
      expect(totals.vat).toBe(0);
      expect(totals.total).toBe(0.06);
    });

    it('leaves no half-kobo anywhere in the parts', () => {
      const totals = computeTotals({
        lines: [
          { unitPrice: 19.99, quantity: 3 },
          { unitPrice: 7.35, quantity: 2 },
        ],
        deliveryFee: 12.34,
        itemDiscount: 5.55,
        settings: { ...exclusiveVat, deliveryEnabled: true, deliveryTaxable: true },
      });
      for (const part of [totals.subtotal, totals.itemDiscount, totals.deliveryFee, totals.vat, totals.total]) {
        expect(toKobo(part)).toBe(Math.round(part * 100));
      }
      expect(toKobo(totals.total)).toBe(
        toKobo(totals.subtotal) - toKobo(totals.itemDiscount) + toKobo(totals.deliveryFee) + toKobo(totals.vat),
      );
      expect(totals.total).toBe(87.57);
    });
  });

  describe('the free-delivery threshold', () => {
    const threshold = { ...exclusiveVat, deliveryEnabled: true, freeDeliveryThreshold: 20000 };

    it('ships free exactly at the threshold', () => {
      const totals = computeTotals({
        lines: [{ unitPrice: 20000, quantity: 1 }],
        deliveryFee: 2500,
        settings: threshold,
      });
      expect(totals.deliveryWaived).toBe(2500);
      expect(totals.deliveryFee).toBe(0);
      expect(totals.total).toBe(21500);
    });

    it('still charges one kobo below the threshold', () => {
      const totals = computeTotals({
        lines: [{ unitPrice: 19999, quantity: 1 }],
        deliveryFee: 2500,
        settings: threshold,
      });
      expect(totals.deliveryWaived).toBe(0);
      expect(totals.deliveryFee).toBe(2500);
    });

    it('ships free above the threshold', () => {
      const totals = computeTotals({
        lines: [{ unitPrice: 20001, quantity: 1 }],
        deliveryFee: 2500,
        settings: threshold,
      });
      expect(totals.deliveryFee).toBe(0);
    });

    it('measures the threshold after an item discount', () => {
      // 25,000 less a 6,000 coupon is 19,000, which is under the threshold.
      const totals = computeTotals({
        lines: [{ unitPrice: 25000, quantity: 1 }],
        deliveryFee: 2500,
        itemDiscount: 6000,
        settings: threshold,
      });
      expect(totals.deliveryFee).toBe(2500);
    });

    it('applies once the discount still clears the threshold', () => {
      const totals = computeTotals({
        lines: [{ unitPrice: 25000, quantity: 1 }],
        deliveryFee: 2500,
        itemDiscount: 4000,
        settings: threshold,
      });
      expect(totals.deliveryFee).toBe(0);
    });

    it('never offers free delivery when no threshold is set', () => {
      const totals = computeTotals({
        lines: [{ unitPrice: 1000000, quantity: 1 }],
        deliveryFee: 2500,
        settings: { ...exclusiveVat, deliveryEnabled: true, freeDeliveryThreshold: null },
      });
      expect(totals.deliveryFee).toBe(2500);
    });

    it('treats a zero threshold as no offer rather than free everything', () => {
      const totals = computeTotals({
        lines: [{ unitPrice: 100, quantity: 1 }],
        deliveryFee: 2500,
        settings: { ...exclusiveVat, deliveryEnabled: true, freeDeliveryThreshold: 0 },
      });
      expect(totals.deliveryFee).toBe(2500);
    });

    it('waives nothing when there is no fee to waive', () => {
      const totals = computeTotals({
        lines: [{ unitPrice: 20000, quantity: 1 }],
        deliveryFee: 0,
        settings: threshold,
      });
      expect(totals.deliveryWaived).toBe(0);
      expect(totals.total).toBe(21500);
    });

    it('never lets the two waivers exceed the quoted fee', () => {
      const totals = computeTotals({
        lines: [{ unitPrice: 20000, quantity: 1 }],
        deliveryFee: 2500,
        deliveryDiscount: 2500,
        settings: threshold,
      });
      expect(totals.deliveryWaived).toBe(2500);
      expect(totals.deliveryFee).toBe(0);
      expect(totals.total).toBe(21500);
    });
  });

  describe('amounts that make no sense', () => {
    it('refuses a negative price rather than crediting the customer', () => {
      const totals = computeTotals({
        lines: [{ unitPrice: -5000, quantity: 1 }],
        settings: off,
      });
      expect(totals.subtotal).toBe(0);
      expect(totals.total).toBe(0);
    });

    it('refuses negative discounts and fees', () => {
      const totals = computeTotals({
        lines: [{ unitPrice: 5000, quantity: 1 }],
        deliveryFee: -2500,
        deliveryDiscount: -2500,
        itemDiscount: -1000,
        settings: { ...exclusiveVat, deliveryEnabled: true },
      });
      expect(totals.itemDiscount).toBe(0);
      expect(totals.deliveryFee).toBe(0);
      expect(totals.deliveryWaived).toBe(0);
      expect(totals.total).toBe(5375);
    });

    it('never returns a negative total, whatever it is fed', () => {
      const totals = computeTotals({
        lines: [{ unitPrice: 100, quantity: 1 }],
        deliveryFee: 5000,
        deliveryDiscount: 5000,
        itemDiscount: 100,
        settings: { ...exclusiveVat, deliveryEnabled: true, deliveryTaxable: true },
      });
      expect(totals.total).toBeGreaterThanOrEqual(0);
    });
  });

  describe('combined', () => {
    it('applies discount, then waived delivery, then VAT, then the total', () => {
      const totals = computeTotals({
        lines: [
          { unitPrice: 3333, quantity: 3 },
          { unitPrice: 999.99, quantity: 2, taxExempt: true },
        ],
        deliveryFee: 2500,
        deliveryDiscount: 2500,
        itemDiscount: 1000,
        settings: { ...exclusiveVat, deliveryEnabled: true, deliveryTaxable: true },
      });
      expect(totals.subtotal).toBe(11998.98);
      expect(totals.itemDiscount).toBe(1000);
      expect(totals.deliveryFee).toBe(0);
      expect(totals.deliveryWaived).toBe(2500);
      // The exempt line is left out of the base, and the discount shrinks the
      // taxable line in proportion: 9,999 - (1,000 * 9,999 / 11,998.98) = 9,165.68.
      expect(totals.taxableBase).toBe(9165.68);
      expect(totals.vat).toBe(687.43);
      expect(totals.total).toBe(11686.41);
      expect(toKobo(totals.total)).toBe(
        toKobo(totals.subtotal) - toKobo(totals.itemDiscount) + toKobo(totals.deliveryFee) + toKobo(totals.vat),
      );
    });
  });
});