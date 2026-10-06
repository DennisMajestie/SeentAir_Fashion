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
    expect(config).toEqual({ currencyCode: 'GHS', currencySymbol: 'GH₵', locale: 'en-GH' });
  });

  it('exposes nothing else', () => {
    const config = controller({
      'business.currencyCode': 'NGN',
      'business.currencySymbol': '₦',
      'business.locale': 'en-NG',
      'jwt.secret': 'must-never-leak',
    }).get();
    expect(Object.keys(config).sort()).toEqual(['currencyCode', 'currencySymbol', 'locale']);
  });
});
