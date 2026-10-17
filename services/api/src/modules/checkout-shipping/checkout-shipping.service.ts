import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthenticatedUser } from '../../common/interfaces';
import { computeTotals, toKobo } from '../orders/order-totals';
import { DeliveryMethod } from '../orders/entities/order.entity';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { matchState, stateNameFor } from './nigerian-states';
import { signQuoteToken } from './quote-token';
import { DEFAULT_SIZE_CLASS, ProductSizeClass, toSizeClass } from './shipping-size-class';
import { ZoneRateProvider } from './zone-rate.provider';

export const ZONE_RATE_PROVIDER = 'ZONE_RATE_PROVIDER';

/**
 * Why a quote is what it is. Every outcome is explicit: an address we do not
 * serve, or a combination with no price, comes back as its own status rather
 * than a zero fee, so "free delivery" can never be confused with "we have not
 * worked this out yet".
 */
export enum QuoteStatus {
  /** Priced. */
  QUOTED = 'quoted',
  /** The feature is switched off: no fee, no commitment. */
  NOT_APPLICABLE = 'not_applicable',
  /** The state is not in any zone yet. */
  UNSERVICEABLE_STATE = 'unserviceable_state',
  /** The state is served, but this size class / method has no price set. */
  NO_RATE = 'no_rate',
  /** Signed in, or checking out as a guest, but the basket is empty. */
  EMPTY = 'empty',
}

export interface QuoteRequest {
  /** Canonical state key or free text; matched tolerantly. */
  state: string;
  /** One entry per cart line. Quantities only - prices are not trusted. */
  lines: { sizeClass?: string | null; quantity: number }[];
  method: DeliveryMethod;
  /** The storefront's own subtotal, used only for the free-delivery threshold. */
  subtotal: number;
}

export interface QuoteOption {
  status: QuoteStatus;
  method: DeliveryMethod;
  sizeClass: ProductSizeClass | null;
  zoneName: string | null;
  stateName: string | null;
  /** Kobo, so the client cannot do float arithmetic on it. */
  feeKobo: number;
  /** A short, shopper-readable summary. */
  estimate: string;
  freeDeliveryApplied: boolean;
  /** Present only when status is QUOTED. */
  quoteToken?: string;
  expiresAt?: Date;
}

/**
 * Turns a destination and a basket into a delivery fee.
 *
 * Prices are never taken from the request: the lines contribute quantities and
 * size classes only, and the fee comes from the rate tables. `subtotal` is
 * supplied by the caller and is used solely to decide whether a free-delivery
 * threshold has been met - it can lower a fee but never invent one, so passing
 * a wrong subtotal cannot create a discount that did not exist.
 */
@Injectable()
export class CheckoutShippingService {
  constructor(
    @Inject(ZONE_RATE_PROVIDER) private readonly provider: ZoneRateProvider,
    private readonly settings: PlatformSettingsService,
    private readonly config: ConfigService,
  ) {}

  private get signingSecret(): string {
    return (
      this.config.get<string>('QUOTE_SIGNING_SECRET') ??
      this.config.get<string>('auth.secret') ??
      'dev-only-secret'
    );
  }

  async quote(request: QuoteRequest, _actor: AuthenticatedUser | null, now: Date): Promise<QuoteOption> {
    const settings = await this.settings.get();

    if (!settings.shippingEnabled) {
      return this.notApplicable(request, 'Delivery is not being charged for this order.');
    }

    const quantityTotal = (request.lines ?? []).reduce(
      (sum, line) => sum + Math.max(0, Math.trunc(line.quantity ?? 0)),
      0,
    );
    if (quantityTotal <= 0) {
      return { ...this.blank(request), status: QuoteStatus.EMPTY, estimate: 'Nothing to ship yet.' };
    }

    const stateKey = matchState(request.state);
    if (!stateKey) {
      return {
        ...this.blank(request),
        status: QuoteStatus.UNSERVICEABLE_STATE,
        estimate:
          'We do not deliver to that state yet. Choose a different state or contact us for a quote.',
      };
    }

    // One basket may hold several size classes; the heaviest sets the rate.
    const sizeClass = this.heaviestSizeClass(request.lines);
    const zone = await this.provider.findZoneForState(stateKey, now);
    if (!zone) {
      return {
        ...this.blank(request),
        status: QuoteStatus.UNSERVICEABLE_STATE,
        stateName: stateNameFor(stateKey),
        estimate:
          'We do not deliver to that state yet. Choose a different state or contact us for a quote.',
      };
    }

    const rate = await this.provider.findRate(zone.id, sizeClass, request.method, now);
    if (!rate) {
      return {
        ...this.blank(request),
        status: QuoteStatus.NO_RATE,
        sizeClass,
        zoneName: zone.name,
        stateName: zone.state,
        estimate: 'Delivery to this state is being confirmed. We will quote it before you pay.',
      };
    }

    const feeKobo = toKobo(rate.fee);
    const totals = computeTotals({
      lines: [{ unitPrice: request.subtotal, quantity: 1 }],
      deliveryFee: rate.fee,
      settings: {
        vatEnabled: settings.vatEnabled,
        vatRatePercent: settings.vatRatePercent,
        pricesIncludeVat: settings.pricesIncludeVat,
        deliveryTaxable: settings.deliveryTaxable,
        deliveryEnabled: settings.shippingEnabled,
        freeDeliveryThreshold: settings.freeDeliveryThreshold,
      },
    });

    const payableKobo = feeKobo - toKobo(totals.deliveryWaived);
    const expiresAt = new Date(now.getTime() + settings.quoteExpiryMinutes * 60_000);
    const quoteToken = signQuoteToken(
      {
        zoneId: zone.id,
        sizeClass,
        method: request.method,
        feeKobo: String(payableKobo),
        expiresAt: expiresAt.getTime(),
      },
      this.signingSecret,
    );

    return {
      status: QuoteStatus.QUOTED,
      method: request.method,
      sizeClass,
      zoneName: zone.name,
      stateName: zone.state,
      feeKobo: payableKobo,
      estimate:
        totals.deliveryWaived > 0
          ? 'Free delivery applied.'
          : `Delivery to ${zone.state}: ${(payableKobo / 100).toFixed(2)}.`,
      freeDeliveryApplied: totals.deliveryWaived > 0,
      quoteToken,
      expiresAt,
    };
  }

  /**
   * The heaviest band in the basket decides the rate. Unknown counts as medium.
   * Starts from nothing rather than from medium, so a basket made entirely of
   * light items is priced as light and not quietly bumped to the middle band.
   */
  private heaviestSizeClass(lines: QuoteRequest['lines']): ProductSizeClass {
    const order: Record<string, number> = { light: 1, medium: 2, heavy: 3 };
    let heaviest: ProductSizeClass | null = null;
    let topRank = 0;
    for (const line of lines ?? []) {
      const candidate = toSizeClass(line?.sizeClass);
      const rank = order[candidate];
      if (rank > topRank) {
        topRank = rank;
        heaviest = candidate;
      }
    }
    return heaviest ?? DEFAULT_SIZE_CLASS;
  }

  private blank(request: QuoteRequest): Omit<QuoteOption, 'status' | 'estimate'> {
    return {
      method: request.method,
      sizeClass: null,
      zoneName: null,
      stateName: null,
      feeKobo: 0,
      freeDeliveryApplied: false,
    };
  }

  private notApplicable(request: QuoteRequest, estimate: string): QuoteOption {
    return { ...this.blank(request), status: QuoteStatus.NOT_APPLICABLE, estimate };
  }
}