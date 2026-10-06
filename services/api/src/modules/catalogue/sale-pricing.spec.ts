import { activeSalePercent, applySalePercent, retailUnitPrice } from './sale-pricing';

describe('sale pricing', () => {
  const now = new Date('2026-10-06T12:00:00Z');
  const later = new Date('2026-10-07T12:00:00Z');
  const earlier = new Date('2026-10-05T12:00:00Z');

  describe('activeSalePercent', () => {
    it('is the discount while the sale is running', () => {
      expect(activeSalePercent({ salePercent: 20, saleEndsAt: later }, now)).toBe(20);
    });

    it('is null when the product has no sale', () => {
      expect(activeSalePercent({ salePercent: null, saleEndsAt: null }, now)).toBeNull();
      expect(activeSalePercent({}, now)).toBeNull();
    });

    it('is null once the end time has passed', () => {
      expect(activeSalePercent({ salePercent: 20, saleEndsAt: earlier }, now)).toBeNull();
    });

    it('treats the end instant itself as over', () => {
      expect(activeSalePercent({ salePercent: 20, saleEndsAt: now }, now)).toBeNull();
    });

    it('never runs open-ended: a discount with no end time is not a sale', () => {
      expect(activeSalePercent({ salePercent: 20, saleEndsAt: null }, now)).toBeNull();
    });

    it('ignores a zero or negative discount', () => {
      expect(activeSalePercent({ salePercent: 0, saleEndsAt: later }, now)).toBeNull();
      expect(activeSalePercent({ salePercent: -5, saleEndsAt: later }, now)).toBeNull();
    });

    it('accepts the end time as an ISO string, as it arrives over JSON', () => {
      expect(activeSalePercent({ salePercent: 20, saleEndsAt: later.toISOString() }, now)).toBe(20);
    });
  });

  describe('applySalePercent', () => {
    it('takes the percentage off', () => {
      expect(applySalePercent(5000, 20)).toBe(4000);
    });

    it('rounds to two decimal places', () => {
      expect(applySalePercent(3333, 15)).toBe(2833.05);
      expect(applySalePercent(999.99, 33)).toBe(669.99);
    });
  });

  describe('retailUnitPrice', () => {
    it('charges the sale price while the sale runs', () => {
      expect(retailUnitPrice(5000, { salePercent: 20, saleEndsAt: later }, now)).toBe(4000);
    });

    it('charges the list price once it has ended', () => {
      expect(retailUnitPrice(5000, { salePercent: 20, saleEndsAt: earlier }, now)).toBe(5000);
    });

    it('applies the same percentage to a variant with its own price', () => {
      // A product at 5,000 with one variant overridden to 6,500, 20% off.
      expect(retailUnitPrice(6500, { salePercent: 20, saleEndsAt: later }, now)).toBe(5200);
    });
  });
});
