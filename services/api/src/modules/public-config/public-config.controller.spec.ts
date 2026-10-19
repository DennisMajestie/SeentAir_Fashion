import { ConfigService } from '@nestjs/config';
import { PublicConfigController } from './public-config.controller';

describe('PublicConfigController', () => {
  const controller = (values: Record<string, string>) =>
    new PublicConfigController({
      getOrThrow: (key: string) => {
        if (!(key in values)) throw new Error(`missing ${key}`);
        return values[key];
      },
    } as unknown as ConfigService);

  it('returns the configured currency and locale', () => {
    const config = controller({
      'business.currencyCode': 'GHS',
      'business.currencySymbol': 'GH₵',
      'business.locale': 'en-GH',
    }).get();
    expect(config).toEqual({
      currencyCode: 'GHS',
      currencySymbol: 'GH₵',
      locale: 'en-GH',
      serverNow: expect.any(String),
    });
  });

  it('serves a usable timestamp, so a skewed device clock can be corrected', () => {
    const config = controller({
      'business.currencyCode': 'NGN',
      'business.currencySymbol': '₦',
      'business.locale': 'en-NG',
    }).get();
    expect(Number.isNaN(Date.parse(config.serverNow))).toBe(false);
    // Within a minute of this machine's own clock, or the server is lying.
    expect(Math.abs(Date.now() - Date.parse(config.serverNow))).toBeLessThan(60_000);
  });

  it('exposes nothing else', () => {
    const config = controller({
      'business.currencyCode': 'NGN',
      'business.currencySymbol': '₦',
      'business.locale': 'en-NG',
      'jwt.secret': 'must-never-leak',
    }).get();
    expect(Object.keys(config).sort()).toEqual([
      'currencyCode',
      'currencySymbol',
      'locale',
      'serverNow',
    ]);
  });
});
