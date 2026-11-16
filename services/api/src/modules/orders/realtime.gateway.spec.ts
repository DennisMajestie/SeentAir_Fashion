import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OrderStatusBus } from './order-status.bus';
import { RealtimeGateway } from './realtime.gateway';
import { OrdersService } from './orders.service';
import { MessagingBus } from '../messaging/messaging-bus';
import { MessagingService } from '../messaging/messaging.service';

describe('RealtimeGateway', () => {
  const orderId = 'c7d5eae8-2fa5-4025-96c1-b5634b8aa3ff';
  const conversationId = '8f3c0e1a-9b2d-4c6e-8f0a-1b3d5e7f9a1b';
  let bus: OrderStatusBus;
  let orders: { tracking: jest.Mock };
  let messagingBus: MessagingBus;
  let messaging: { getDetail: jest.Mock };
  let gateway: RealtimeGateway;

  beforeEach(() => {
    bus = new OrderStatusBus();
    orders = { tracking: jest.fn() };
    messagingBus = new MessagingBus();
    messaging = { getDetail: jest.fn() };
    gateway = new RealtimeGateway(
      new JwtService({ secret: 'realtime-test-secret' }),
      new ConfigService({ jwt: { secret: 'realtime-test-secret' } }),
      orders as unknown as OrdersService,
      bus,
      messagingBus,
      messaging as unknown as MessagingService,
    );
  });

  it('only joins an order after the normal tracking access check passes', async () => {
    orders.tracking.mockResolvedValue({});
    const client = {
      data: {},
      join: jest.fn(),
    };
    const response = await gateway.subscribeOrder(
      client as never,
      { orderId, guestToken: 'guest-access-token' },
    );

    expect(orders.tracking).toHaveBeenCalledWith(orderId, undefined, 'guest-access-token');
    expect(client.join).toHaveBeenCalledWith(`order:${orderId}`);
    expect(response).toEqual({ ok: true });
  });

  it('refuses invalid or unauthorized order subscriptions', async () => {
    orders.tracking.mockRejectedValue(new NotFoundException('not authorized'));
    const client = { data: {}, join: jest.fn() };
    const invalidResponse = await gateway.subscribeOrder(client as never, { orderId: 'not-an-id' });
    const unauthorizedResponse = await gateway.subscribeOrder(client as never, { orderId });

    expect(client.join).not.toHaveBeenCalled();
    expect(invalidResponse).toEqual({ ok: false });
    expect(unauthorizedResponse).toEqual({ ok: false });
  });

  it('sends status-change notifications without exposing internal order status', () => {
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    Object.defineProperty(gateway, 'server', { value: { to } });
    gateway.onModuleInit();

    bus.emit(orderId, 'stock_exception');

    expect(to).toHaveBeenCalledWith(`order:${orderId}`);
    expect(emit).toHaveBeenCalledWith(
      'order:updated',
      expect.objectContaining({ orderId }),
    );
    expect(emit.mock.calls[0][1]).not.toHaveProperty('status');
    gateway.onModuleDestroy();
  });

  it('only joins a conversation after the same authorization as the detail read', async () => {
    messaging.getDetail.mockResolvedValue({});
    const client = { data: {}, join: jest.fn() };
    const response = await gateway.subscribeConversation(client as never, {
      conversationId,
      guestToken: 'guest-chat-token',
    });

    expect(messaging.getDetail).toHaveBeenCalledWith(
      conversationId,
      undefined,
      'guest-chat-token',
    );
    expect(client.join).toHaveBeenCalledWith(`conversation:${conversationId}`);
    expect(response).toEqual({ ok: true });
  });

  it('refuses invalid or unauthorized conversation subscriptions', async () => {
    messaging.getDetail.mockRejectedValue(new NotFoundException('not authorized'));
    const client = { data: {}, join: jest.fn() };
    const invalidResponse = await gateway.subscribeConversation(client as never, {
      conversationId: 'not-an-id',
    });
    const unauthorizedResponse = await gateway.subscribeConversation(client as never, {
      conversationId,
    });

    expect(client.join).not.toHaveBeenCalled();
    expect(invalidResponse).toEqual({ ok: false });
    expect(unauthorizedResponse).toEqual({ ok: false });
  });

  it('fans conversation activity out to the thread room and the admin room', () => {
    const emit = jest.fn();
    const to = jest.fn((_room: string) => ({ emit }));
    Object.defineProperty(gateway, 'server', { value: { to } });
    gateway.onModuleInit();

    messagingBus.emit(conversationId);

    const rooms = to.mock.calls.map((call) => call[0]);
    expect(rooms).toContain(`conversation:${conversationId}`);
    expect(rooms).toContain('admin:live');
    gateway.onModuleDestroy();
  });
});
