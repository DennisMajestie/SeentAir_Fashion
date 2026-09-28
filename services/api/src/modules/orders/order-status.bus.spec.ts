import { MessageEvent } from '@nestjs/common';
import { OrderStatusBus } from './order-status.bus';

describe('OrderStatusBus', () => {
  let bus: OrderStatusBus;

  beforeEach(() => {
    bus = new OrderStatusBus();
  });

  const collect = (orderId: string) => {
    const seen: MessageEvent[] = [];
    const sub = bus.stream(orderId).subscribe((m) => seen.push(m));
    return { seen, sub };
  };

  const statuses = (seen: MessageEvent[]) =>
    seen.filter((m) => m.type === 'status').map((m) => JSON.parse(String(m.data)).status);

  it('emits an open frame first so the client can stop fast-polling', () => {
    const { seen, sub } = collect('order-1');
    expect(seen[0].type).toBe('open');
    sub.unsubscribe();
  });

  it('pushes a change for the subscribed order', () => {
    const { seen, sub } = collect('order-1');
    bus.emit('order-1', 'shipped');
    const status = seen.filter((m) => m.type === 'status');
    expect(status).toHaveLength(1);
    expect(JSON.parse(String(status[0].data))).toMatchObject({
      orderId: 'order-1',
      status: 'shipped',
    });
    sub.unsubscribe();
  });

  it("does not leak one order's changes to another order's stream", () => {
    const mine = collect('order-1');
    const theirs = collect('order-2');
    bus.emit('order-2', 'delivered');
    expect(statuses(mine.seen)).toHaveLength(0);
    expect(statuses(theirs.seen)).toEqual(['delivered']);
    mine.sub.unsubscribe();
    theirs.sub.unsubscribe();
  });

  it('keeps emitting to an open stream after a change', () => {
    const { seen, sub } = collect('order-1');
    bus.emit('order-1', 'processing');
    bus.emit('order-1', 'shipped');
    expect(statuses(seen)).toEqual(['processing', 'shipped']);
    sub.unsubscribe();
  });

  it('never throws when there are no subscribers', () => {
    expect(() => bus.emit('order-1', 'processing')).not.toThrow();
  });
});
