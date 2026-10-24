import { QuoteErrorCode, QuoteRejected, QuoteVerificationService } from './quote-verification.service';
import { CheckoutShippingQuote } from './entities/checkout-shipping-quote.entity';
import { DeliveryMethod } from '../orders/entities/order.entity';
import { ProductSizeClass } from './shipping-size-class';

const NOW = new Date('2026-10-06T12:00:00Z');
const LATER = new Date('2026-10-06T13:00:00Z');

function quote(over: Partial<CheckoutShippingQuote> = {}): CheckoutShippingQuote {
  return {
    id: 'q1',
    customerId: null,
    stateKey: 'lag',
    zoneId: 'z1',
    zoneName: 'Lagos Zone',
    method: DeliveryMethod.FREIGHT,
    sizeClass: ProductSizeClass.MEDIUM,
    fee: 2500,
    subtotal: 20000,
    total: 22500,
    cart: [{ variantId: 'v1', quantity: 2, unitPriceKobo: 1000000 }],
    settingsVersion: null,
    expiresAt: LATER,
    orderId: null,
    consumedAt: null,
    createdAt: NOW,
    ...over,
  };
}

/** A verification service over one stored quote, or none at all. */
function harness(
  stored: CheckoutShippingQuote | null = quote(),
  bands: ProductSizeClass[] = [ProductSizeClass.MEDIUM],
) {
  const svc = new QuoteVerificationService(
    {
      findOne: async () => Promise.resolve(stored),
    } as never,
    // Catalogue ground truth is faked; the last entry is the resolved band.
    { heaviest: async () => bands[bands.length - 1] } as never,
  );
  const input = {
    quoteId: 'q1',
    method: DeliveryMethod.FREIGHT,
    stateKey: 'lag',
    subtotalKobo: 2000000,
    lines: [{ variantId: 'v1', quantity: 2, unitPriceKobo: 1000000 }],
    now: NOW,
  };
  return { svc, input };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'NO_ERROR';
  } catch (e) {
    return e instanceof QuoteRejected ? e.code : `WRONG_ERROR:${(e as Error).message}`;
  }
}

describe('quote verification', () => {
  it('accepts a quote that still stands up', async () => {
    const { svc, input } = harness();
    await expect(svc.verify(input)).resolves.toMatchObject({ id: 'q1' });
  });

  describe('error codes', () => {
    it('QUOTE_REQUIRED when no quote id was sent', async () => {
      const { svc, input } = harness();
      expect(await codeOf(svc.verify({ ...input, quoteId: null }))).toBe(QuoteErrorCode.REQUIRED);
    });

    it('QUOTE_REQUIRED when the quote does not exist', async () => {
      const { svc, input } = harness(null);
      expect(await codeOf(svc.verify(input))).toBe(QuoteErrorCode.REQUIRED);
    });

    it('QUOTE_EXPIRED once the window has passed', async () => {
      const { svc, input } = harness(quote({ expiresAt: new Date(NOW.getTime() - 1) }));
      expect(await codeOf(svc.verify(input))).toBe(QuoteErrorCode.EXPIRED);
    });

    it('accepts a quote at the last instant before expiry', async () => {
      const { svc, input } = harness(quote({ expiresAt: new Date(NOW.getTime() + 1) }));
      await expect(svc.verify(input)).resolves.toBeDefined();
    });

    it('QUOTE_USED when an order already consumed it', async () => {
      const { svc, input } = harness(quote({ orderId: 'order-1', consumedAt: NOW }));
      expect(await codeOf(svc.verify(input))).toBe(QuoteErrorCode.USED);
    });

    it('QUOTE_MISMATCH for a different destination', async () => {
      const { svc, input } = harness();
      expect(await codeOf(svc.verify({ ...input, stateKey: 'ogi' }))).toBe(QuoteErrorCode.MISMATCH);
    });

    it('QUOTE_MISMATCH for a different method', async () => {
      const { svc, input } = harness();
      expect(
        await codeOf(svc.verify({ ...input, method: DeliveryMethod.PICKUP })),
      ).toBe(QuoteErrorCode.MISMATCH);
    });

    it('QUOTE_MISMATCH for a different basket', async () => {
      const { svc, input } = harness();
      expect(
        await codeOf(svc.verify({ ...input, lines: [{ variantId: 'v2', quantity: 1, unitPriceKobo: 5 }] })),
      ).toBe(QuoteErrorCode.MISMATCH);
    });

    it('QUOTE_STALE when the catalogue re-classifies the basket to a heavier band', async () => {
      const { svc, input } = harness(quote(), [ProductSizeClass.HEAVY]);
      expect(await codeOf(svc.verify(input))).toBe(QuoteErrorCode.STALE);
    });

    it('accepts when the resolved band still matches the priced band', async () => {
      const { svc, input } = harness(quote(), [ProductSizeClass.MEDIUM]);
      await expect(svc.verify(input)).resolves.toBeDefined();
    });

    it('QUOTE_MISMATCH for the same basket in a different quantity', async () => {
      const { svc, input } = harness();
      expect(
        await codeOf(svc.verify({ ...input, lines: [{ variantId: 'v1', quantity: 3, unitPriceKobo: 1000000 }] })),
      ).toBe(QuoteErrorCode.MISMATCH);
    });

    it('QUOTE_MISMATCH when the unit price moved', async () => {
      const { svc, input } = harness();
      expect(
        await codeOf(svc.verify({ ...input, lines: [{ variantId: 'v1', quantity: 2, unitPriceKobo: 900000 }] })),
      ).toBe(QuoteErrorCode.MISMATCH);
    });

    it('QUOTE_STALE when the lines match but the subtotal does not', async () => {
      // The shape that happens when a timed sale ends between quoting and paying.
      const { svc, input } = harness();
      expect(await codeOf(svc.verify({ ...input, subtotalKobo: 1800000 }))).toBe(
        QuoteErrorCode.STALE,
      );
    });

    it('DESTINATION_NOT_SERVICEABLE when the state is not recognised', async () => {
      const { svc, input } = harness();
      expect(await codeOf(svc.verify({ ...input, stateKey: null }))).toBe(
        QuoteErrorCode.NOT_SERVICEABLE,
      );
    });
  });

  describe('pickup', () => {
    it('needs no destination', async () => {
      const { svc, input } = harness(
        quote({ method: DeliveryMethod.PICKUP, fee: 0, stateKey: 'lag' }),
      );
      await expect(
        svc.verify({ ...input, method: DeliveryMethod.PICKUP, stateKey: null }),
      ).resolves.toBeDefined();
    });
  });

  it('ignores line order when comparing baskets', async () => {
    const { svc, input } = harness(
      quote({
        // 100 + (200 * 2) = 500 kobo = 5.00, matching the lines below.
        subtotal: 5,
        cart: [
          { variantId: 'a', quantity: 1, unitPriceKobo: 100 },
          { variantId: 'b', quantity: 2, unitPriceKobo: 200 },
        ],
      }),
    );
    await expect(
      svc.verify({
        ...input,
        lines: [
          { variantId: 'b', quantity: 2, unitPriceKobo: 200 },
          { variantId: 'a', quantity: 1, unitPriceKobo: 100 },
        ],
        subtotalKobo: 500,
      }),
    ).resolves.toBeDefined();
  });

  it('carries a machine-readable code in the response body', async () => {
    const { svc, input } = harness();
    try {
      await svc.verify({ ...input, quoteId: null });
      throw new Error('should have rejected');
    } catch (e) {
      const body = (e as QuoteRejected).getResponse() as { code: string };
      expect(body.code).toBe(QuoteErrorCode.REQUIRED);
    }
  });
});