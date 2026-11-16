import { UnauthorizedException } from '@nestjs/common';
import { MessagingWebhookController } from './messaging-webhook.controller';
import { MessagingService } from './messaging.service';

describe('MessagingWebhookController', () => {
  const configValues: Record<string, string> = {};
  const config = { get: jest.fn((key: string) => configValues[key]) };
  const messaging = { receiveWhatsappMessage: jest.fn(async () => undefined) };
  const controller = new MessagingWebhookController(
    config as never,
    messaging as unknown as MessagingService,
  );
  const res = { status: jest.fn().mockReturnThis(), send: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    for (const key of Object.keys(configValues)) delete configValues[key];
    configValues['whatsapp.verifyToken'] = 'verify-me';
  });

  it('echoes the challenge when the verify token matches', () => {
    controller.verify('subscribe', 'verify-me', 'the-challenge', res as never);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith('the-challenge');
  });

  it('rejects subscriptions with a wrong token or missing configuration', () => {
    controller.verify('subscribe', 'nope', 'the-challenge', res as never);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith('Forbidden');

    delete configValues['whatsapp.verifyToken'];
    controller.verify('subscribe', 'verify-me', 'the-challenge', res as never);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('routes inbound text messages into the conversation queue', async () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ profile: { name: 'Ada Obi' } }],
                messages: [
                  { from: '2348012345678', id: 'wamid-1', type: 'text', text: { body: 'Hi!' } },
                ],
              },
            },
          ],
        },
      ],
    };
    const raw = Buffer.from(JSON.stringify(payload));

    await expect(
      controller.receive({ rawBody: raw, headers: {} } as never),
    ).resolves.toEqual({ received: true });
    expect(messaging.receiveWhatsappMessage).toHaveBeenCalledWith(
      '2348012345678',
      'Hi!',
      'wamid-1',
      'Ada Obi',
    );
  });

  it('never lets one bad message fail the whole batch', async () => {
    messaging.receiveWhatsappMessage.mockRejectedValueOnce(new Error('boom'));
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { from: '2348012345678', id: 'wamid-1', type: 'text', text: { body: 'Hi!' } },
                ],
              },
            },
          ],
        },
      ],
    };
    const raw = Buffer.from(JSON.stringify(payload));

    await expect(
      controller.receive({ rawBody: raw, headers: {} } as never),
    ).resolves.toEqual({ received: true });
  });

  it('verifies the Meta signature when an app secret is configured', async () => {
    configValues['whatsapp.appSecret'] = 'app-secret';
    const payload = { entry: [] };
    const raw = Buffer.from(JSON.stringify(payload));

    await expect(
      controller.receive({ rawBody: raw, headers: {} } as never),
    ).rejects.toThrow(UnauthorizedException);
  });
});
