import {
  EnvironmentProviders,
  Injectable,
  Pipe,
  PipeTransform,
  inject,
  provideAppInitializer,
  signal,
} from '@angular/core';

/** How money is written. Comes from the API's configuration, never from code. */
export interface SeCurrencyConfig {
  /** ISO 4217 code, e.g. "NGN". */
  currencyCode: string;
  /** What is printed before the amount. */
  currencySymbol: string;
  /** BCP 47 locale for digit grouping and decimals, e.g. "en-NG". */
  locale: string;
}

/**
 * Holds the currency the business trades in. Each app loads it once at start
 * (see `provideSeCurrency` in the app's config) from the API's public
 * configuration endpoint, so the symbol is configuration, not a literal typed
 * into a hundred templates.
 *
 * Until it is loaded, or if loading fails, amounts are printed as plain
 * numbers with no symbol: a missing symbol is honest, a guessed one is not.
 */
@Injectable({ providedIn: 'root' })
export class SeCurrencyService {
  readonly config = signal<SeCurrencyConfig | null>(null);

  /** Fetches the configuration. Resolves either way; never blocks start-up on failure. */
  async load(url: string): Promise<void> {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        // Start-up waits for this, so it must give up quickly when the API is slow.
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) return;
      const body = (await res.json()) as Partial<SeCurrencyConfig>;
      if (typeof body.currencySymbol === 'string' && typeof body.currencyCode === 'string') {
        this.config.set({
          currencyCode: body.currencyCode,
          currencySymbol: body.currencySymbol,
          locale: typeof body.locale === 'string' ? body.locale : 'en',
        });
      }
    } catch {
      // Offline or unreachable: amounts stay unsymbolled until a reload.
    }
  }

  /**
   * An amount as text. `decimals` is the number of decimal places: 0 for whole
   * units in dense tables and metric cards, 2 where the kobo matter (invoices,
   * ledgers).
   */
  format(amount: number | null | undefined, decimals = 0): string {
    if (amount === null || amount === undefined || Number.isNaN(amount)) return '–';
    const config = this.config();
    const digits = new Intl.NumberFormat(config?.locale ?? 'en', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(Math.abs(amount));
    // The minus goes before the symbol, not between the symbol and the digits.
    return `${amount < 0 ? '−' : ''}${config?.currencySymbol ?? ''}${digits}`;
  }
}

/**
 * Formats an amount of money in the configured currency.
 *
 *     {{ order.totalAmount | seMoney }}        whole units
 *     {{ invoice.total | seMoney: 2 }}         two decimal places
 *
 * Impure on purpose: it must re-render when the currency configuration arrives.
 * The work is one cached-formatter call, which is cheap.
 */
@Pipe({ name: 'seMoney', pure: false })
export class SeMoneyPipe implements PipeTransform {
  private readonly currency = inject(SeCurrencyService);

  transform(amount: number | null | undefined, decimals = 0): string {
    return this.currency.format(amount, decimals);
  }
}

/**
 * Loads the currency configuration before the app first renders. Add it to the
 * app's providers with the API's public configuration URL:
 *
 *     provideSeCurrency(`${API_BASE}/config/public`)
 */
export function provideSeCurrency(url: string): EnvironmentProviders {
  return provideAppInitializer(() => inject(SeCurrencyService).load(url));
}
