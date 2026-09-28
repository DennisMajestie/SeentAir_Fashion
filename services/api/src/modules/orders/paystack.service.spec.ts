import { ConfigService } from '@nestjs/config';
import { PaystackService } from './paystack.service';

/**
 * The callback is what stops a customer being stranded on Paystack's own
 * success page. It is built server-side from configuration, never accepted from
 * the client, so a caller cannot turn it into an open redirect.
 */
describe('PaystackService callback_url', () => {
  const buildConfig = (callbackUrlBase: string) =>
    ({
      get: (key: string) =>
        key === 'paystack.secretKey'
          ? 'sk_test_x'
          : key === 'paystack.baseUrl'
            ? 'https://api.paystack.co'
            : key === 'paystack.callbackUrlBase'
              ? callbackUrlBase
              : undefined,
    }) as unknown as ConfigService;

  const captureBody = async (
    callbackUrlBase: string,
    call?: (s: PaystackService) => Promise<unknown>,
  ) => {
    let body: Record<string, unknown> = {};
    const originalFetch = global.fetch;
    global.fetch = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(init.body as string) as Record<string, unknown>;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: true,
          data: { authorization_url: 'https://checkout.paystack.com/x', reference: 'ref-1' },
        }),
      } as unknown as Response;
    }) as unknown as typeof fetch;
    try {
      const service = new PaystackService(buildConfig(callbackUrlBase));
      if (call) {
        await call(service);
      } else {
        await service.initializeTransaction(
          'a@b.com',
          1000,
          'ref-1',
          'https://app.test/orders/abc',
        );
      }
      return body;
    } finally {
      global.fetch = originalFetch;
    }
  };

  it('sends callback_url when one is supplied', async () => {
    const body = await captureBody('https://app.test', (s) =>
      s.initializeTransaction('a@b.com', 1000, 'ref-1', 'https://app.test/orders/abc'),
    );
    expect(body['callback_url']).toBe('https://app.test/orders/abc');
  });

  it('omits callback_url entirely when none is supplied', async () => {
    const body = await captureBody('', (s) => s.initializeTransaction('a@b.com', 1000, 'ref-1'));
    expect(body).not.toHaveProperty('callback_url');
  });

  it('always sends the amount in kobo and the reference', async () => {
    const body = await captureBody('', (s) => s.initializeTransaction('a@b.com', 1850, 'ref-9'));
    expect(body['amount']).toBe(185000);
    expect(body['reference']).toBe('ref-9');
  });

  it('refuses to initialise when the secret key is missing', async () => {
    const config = { get: () => undefined } as unknown as ConfigService;
    const service = new PaystackService(config);
    await expect(service.initializeTransaction('a@b.com', 100, 'r')).rejects.toThrow(
      /not configured/i,
    );
  });
});
