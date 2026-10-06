import { TestBed } from '@angular/core/testing';
import { SeCurrencyService, SeMoneyPipe } from './money';

describe('money', () => {
  let currency: SeCurrencyService;
  beforeEach(() => {
    currency = TestBed.inject(SeCurrencyService);
  });

  it('prints the configured symbol, never a hardcoded one', () => {
    currency.config.set({ currencyCode: 'NGN', currencySymbol: '₦', locale: 'en-NG' });
    expect(currency.format(1284500)).toBe('₦1,284,500');
    currency.config.set({ currencyCode: 'GHS', currencySymbol: 'GH₵', locale: 'en-GH' });
    expect(currency.format(1284500)).toBe('GH₵1,284,500');
  });

  it('prints a plain number while the configuration is unknown', () => {
    expect(currency.format(1200)).toBe('1,200');
  });

  it('rounds to whole units by default and keeps decimals when asked', () => {
    currency.config.set({ currencyCode: 'NGN', currencySymbol: '₦', locale: 'en-NG' });
    expect(currency.format(4999.5)).toBe('₦5,000');
    expect(currency.format(4999.5, 2)).toBe('₦4,999.50');
  });

  it('puts the minus sign before the symbol', () => {
    currency.config.set({ currencyCode: 'NGN', currencySymbol: '₦', locale: 'en-NG' });
    expect(currency.format(-1200)).toBe('−₦1,200');
  });

  it('prints a dash for a missing amount', () => {
    expect(currency.format(null)).toBe('–');
    expect(currency.format(undefined)).toBe('–');
    expect(currency.format(Number.NaN)).toBe('–');
  });

  it('is available as a pipe', () => {
    currency.config.set({ currencyCode: 'NGN', currencySymbol: '₦', locale: 'en-NG' });
    const pipe = TestBed.runInInjectionContext(() => new SeMoneyPipe());
    expect(pipe.transform(5000)).toBe('₦5,000');
    expect(pipe.transform(5000, 2)).toBe('₦5,000.00');
  });

  it('loads the configuration from the API and survives a failure', async () => {
    const original = window.fetch;
    try {
      window.fetch = (async () =>
        new Response(
          JSON.stringify({ currencyCode: 'NGN', currencySymbol: '₦', locale: 'en-NG' }),
          {
            status: 200,
          },
        )) as typeof fetch;
      await currency.load('/config/public');
      expect(currency.config()?.currencySymbol).toBe('₦');

      currency.config.set(null);
      window.fetch = (async () => {
        throw new Error('offline');
      }) as typeof fetch;
      await currency.load('/config/public');
      expect(currency.config()).toBeNull();
    } finally {
      window.fetch = original;
    }
  });
});
