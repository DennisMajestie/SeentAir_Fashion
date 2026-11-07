import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OrderStatusBus } from './order-status.bus';
import { RealtimeGateway } from './realtime.gateway';
import { OrdersService } from './orders.service';

describe('RealtimeGateway', () => {
  const orderId = 'c7d5eae8-2fa5-4025-96c1-b5634b8aa3ff';
  let bus: OrderStatusBus;
  let orders: { tracking: jest.Mock };
  let gateway: RealtimeGateway;

  beforeEach(() => {
    bus = new OrderStatusBus();
    orders = { tracking: jest.fn() };
    gateway = new RealtimeGateway(
      new JwtService({ secret: 'realtime-test-secret' }),
      new ConfigService({ jwt: { secret: 'realtime-test-secret' } }),
      orders as unknown as OrdersService,
      bus,
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
});
