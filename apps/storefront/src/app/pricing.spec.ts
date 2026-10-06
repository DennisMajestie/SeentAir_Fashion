import { Product, ProductVariant } from './api.service';
import { CartService } from './cart.service';
import { activeSale, formatCountdown, offerFor } from './pricing';

describe('pricing', () => {
  const HOUR = 3_600_000;
  const now = Date.parse('2026-10-06T12:00:00Z');
  const later = new Date(now + 3 * HOUR).toISOString();
  const earlier = new Date(now - HOUR).toISOString();

  const variant = (over: Partial<ProductVariant> = {}): ProductVariant => ({
    id: 'v1',
    sku: 'SKU-1',
    size: 'M',
    colour: 'black',
    priceOverride: null,
    imageUrl: null,
    availabilityStatus: 'in_stock',
    ...over,
  });
  const product = (over: Partial<Product> = {}): Product => ({
    id: 'p1',
    name: 'Tee',
    description: null,
    category: 'tops',
    basePrice: 5000,
    collection: null,
    createdAt: '2026-01-01T00:00:00Z',
    variants: [variant()],
    ...over,
  });
  const onSale = (over: Partial<Product> = {}): Product =>
    product({ salePercent: 20, salePrice: 4000, saleEndsAt: later, ...over });

  describe('activeSale', () => {
    it('is the running sale', () => {
      expect(activeSale(onSale(), now)).toEqual({ percent: 20, endsAt: later });
    });

    it('is null for a product with no sale fields at all (older API builds)', () => {
      expect(activeSale(product(), now)).toBeNull();
    });

    it('is null once the end time has passed, without waiting for a reload', () => {
      expect(activeSale(onSale({ saleEndsAt: earlier }), now)).toBeNull();
    });

    it('is null unless the server marked the sale live with a salePrice', () => {
      expect(activeSale(onSale({ salePrice: null }), now)).toBeNull();
    });
  });

  describe('offerFor', () => {
    it('is just the base price when there is no sale', () => {
      expect(offerFor(product(), null, now)).toEqual({
        price: 5000,
        was: null,
        percent: null,
        endsAt: null,
      });
    });

    it('is the discounted price with the normal price kept beside it', () => {
      expect(offerFor(onSale(), null, now)).toEqual({
        price: 4000,
        was: 5000,
        percent: 20,
        endsAt: later,
      });
    });

    it('takes the same percentage off a variant that has its own price', () => {
      const offer = offerFor(onSale(), variant({ priceOverride: 6500 }), now);
      expect(offer.price).toBe(5200);
      expect(offer.was).toBe(6500);
    });

    it('rounds to two decimals, the same way the API prices the order', () => {
      expect(offerFor(onSale({ basePrice: 3333, salePercent: 15 }), null, now).price).toBe(2833.05);
    });
  });

  describe('formatCountdown', () => {
    it('ticks as hh:mm:ss inside the last day', () => {
      expect(formatCountdown(3 * HOUR)).toBe('03:00:00');
      expect(formatCountdown(61_000)).toBe('00:01:01');
    });

    it('drops to days and hours beyond a day', () => {
      expect(formatCountdown(50 * HOUR)).toBe('2d 02h');
    });

    it('never goes negative', () => {
      expect(formatCountdown(-5000)).toBe('00:00:00');
    });
  });

  describe('cart', () => {
    let cart: CartService;
    beforeEach(() => {
      localStorage.removeItem('seentair.cart');
      cart = new CartService();
    });
    afterEach(() => localStorage.removeItem('seentair.cart'));

    it('returns an item to its normal price once its sale has ended', () => {
      const soon = new Date(Date.now() + HOUR).toISOString();
      cart.add(onSale({ saleEndsAt: soon }), variant(), 2);
      expect(cart.total).toBe(8000);

      // Still running: nothing changes.
      cart.settlePrices(Date.now());
      expect(cart.total).toBe(8000);

      // Past the end: the cart quotes what the order will actually cost.
      cart.settlePrices(Date.now() + 2 * HOUR);
      expect(cart.total).toBe(10000);
      expect(cart.items()[0].saleEndsAt).toBeNull();
    });

    it('leaves an item bought at the normal price alone', () => {
      cart.add(product(), variant(), 1);
      cart.settlePrices(Date.now() + 1000 * HOUR);
      expect(cart.total).toBe(5000);
    });
  });
});
