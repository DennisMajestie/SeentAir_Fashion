import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { toKobo } from '../orders/order-totals';
import { DeliveryMethod } from '../orders/entities/order.entity';
import { CheckoutShippingQuote } from './entities/checkout-shipping-quote.entity';
import { isKnownStateKey } from './nigerian-states';

/**
 * Stable reasons an order cannot be created against a quote.
 *
 * The codes are part of the API contract: the storefront maps one to "your
 * quote expired, here is a new one" rather than parsing prose.
 */
export enum QuoteErrorCode {
  REQUIRED = 'QUOTE_REQUIRED',
  EXPIRED = 'QUOTE_EXPIRED',
  MISMATCH = 'QUOTE_MISMATCH',
  STALE = 'QUOTE_STALE',
  USED = 'QUOTE_USED',
  NOT_SERVICEABLE = 'DESTINATION_NOT_SERVICEABLE',
}

export class QuoteRejected extends BadRequestException {
  constructor(readonly code: QuoteErrorCode, message: string) {
    super({ code, message });
  }
}

/** What the caller proves it is ordering, priced by us a moment ago. */
export interface OrderLineFingerprint {
  variantId: string;
  quantity: number;
  unitPriceKobo: number;
}

export interface VerifyInput {
  quoteId: string | null | undefined;
  lines: OrderLineFingerprint[];
  /** Canonical state key resolved by the caller from the shipping address. */
  stateKey: string | null;
  method: DeliveryMethod | null;
  /** Subtotal recomputed from live catalogue prices, in kobo. */
  subtotalKobo: number;
  now: Date;
}

/**
 * Checks a quote still stands up at the moment an order is created.
 *
 * Four things must all hold, and each fails with its own code so the client
 * knows whether to re-quote or to fix the request:
 *
 *  - the quote exists and has not expired;
 *  - it was issued for this basket, this destination and this method;
 *  - the basket still costs the same now that prices have been re-read (a
 *    sale that ended or a price edited between quoting and checkout must not be
 *    honoured silently - that is QUOTE_STALE, and the client re-quotes);
 *  - no order has consumed it yet.
 *
 * The destination is also re-matched here rather than trusted from the quote:
 * a state that has since been removed from every zone must not still ship.
 */
@Injectable()
export class QuoteVerificationService {
  constructor(
    @InjectRepository(CheckoutShippingQuote)
    private readonly quotes: Repository<CheckoutShippingQuote>,
  ) {}

  async verify(input: VerifyInput): Promise<CheckoutShippingQuote> {
    if (!input.quoteId) {
      throw new QuoteRejected(
        QuoteErrorCode.REQUIRED,
        'Delivery pricing is on, so this order needs a delivery quote.',
      );
    }

    const quote = await this.quotes.findOne({ where: { id: input.quoteId } });
    if (!quote) {
      throw new QuoteRejected(
        QuoteErrorCode.REQUIRED,
        'That delivery quote does not exist. Please request a new one.',
      );
    }

    if (input.now.getTime() >= quote.expiresAt.getTime()) {
      throw new QuoteRejected(
        QuoteErrorCode.EXPIRED,
        'That delivery quote has expired. Please request a new one.',
      );
    }

    if (quote.orderId) {
      throw new QuoteRejected(
        QuoteErrorCode.USED,
        'That delivery quote has already been used for an order.',
      );
    }

    // Pickup needs no destination; a freight quote does.
    if (quote.method === DeliveryMethod.FREIGHT) {
      if (!isKnownStateKey(input.stateKey)) {
        throw new QuoteRejected(
          QuoteErrorCode.NOT_SERVICEABLE,
          'We do not deliver to that destination yet.',
        );
      }
      if (quote.stateKey !== input.stateKey) {
        throw new QuoteRejected(
          QuoteErrorCode.MISMATCH,
          'That quote was for a different delivery destination.',
        );
      }
    }

    if (quote.method !== input.method) {
      throw new QuoteRejected(
        QuoteErrorCode.MISMATCH,
        'That quote was for a different delivery method.',
      );
    }

    if (!this.sameCart(quote.cart, input.lines)) {
      throw new QuoteRejected(
        QuoteErrorCode.MISMATCH,
        'That quote was for a different basket.',
      );
    }

    // Price check last: the subtotal is compared in kobo so no float equality
    // decides whether an order is accepted.
    if (toKobo(quote.subtotal) !== input.subtotalKobo) {
      throw new QuoteRejected(
        QuoteErrorCode.STALE,
        'Prices changed since that quote. Please request a new one.',
      );
    }

    return quote;
  }

  /**
   * Same basket means the same lines in the same order at the same prices.
   * Comparing sorted keeps a re-ordered cart from being called a different one.
   */
  private sameCart(
    quoted: { variantId: string; quantity: number; unitPriceKobo: number }[],
    actual: OrderLineFingerprint[],
  ): boolean {
    if (quoted.length !== actual.length) return false;
    const key = (l: { variantId: string; quantity: number; unitPriceKobo: number }): string =>
      `${l.variantId}:${l.quantity}:${l.unitPriceKobo}`;
    const a = [...quoted].map(key).sort();
    const b = [...actual].map(key).sort();
    return a.every((v, i) => v === b[i]);
  }

  /**
   * Marks the quote consumed. Called inside the order transaction so the claim
   * and the order commit together: if the order fails to save, the quote is
   * still unspent and can be used again.
   */
  async consume(
    manager: EntityManager,
    quote: CheckoutShippingQuote,
    orderId: string,
    now: Date,
  ): Promise<void> {
    const claimed = await manager
      .createQueryBuilder()
      .update(CheckoutShippingQuote)
      .set({ orderId, consumedAt: now })
      .where('id = :id AND order_id IS NULL', { id: quote.id })
      .execute();
    // A concurrent order took it first. The unique constraint on order_id would
    // also catch this, but checking the row count gives a clean error instead.
    if (!claimed.affected) {
      throw new QuoteRejected(
        QuoteErrorCode.USED,
        'That delivery quote has already been used for an order.',
      );
    }
  }
}
