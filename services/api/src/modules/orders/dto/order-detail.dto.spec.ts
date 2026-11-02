import { CUSTOMER_AWAITING_STOCK } from '../customer-status';
import { OrderStatusEvent, PAYMENT_EXCEPTION_EVENT } from '../entities/order-status-event.entity';
import { Order, OrderChannel, OrderStatus, PaymentStatus } from '../entities/order.entity';
import { mapOrderDetail } from './order-detail.dto';

const order = {
  id: 'order-1',
  orderNumber: '1001',
  channel: OrderChannel.RETAIL,
  status: OrderStatus.STOCK_EXCEPTION,
  paymentStatus: PaymentStatus.PAID,
  totalAmount: 17000,
  deliveryFee: 1200,
  deliveryMethod: null,
  shippingAddress: { state: 'Abia', city: 'Aba', line: '1 Market Road', phone: '08000000000' },
  guestName: 'Ada Buyer',
  guestEmail: 'ada@example.test',
  customer: null,
  customerNote: 'Call on arrival',
  deliveryNote: 'Keep upright',
  grossWeightKg: 4.5,
  palletRef: 'PAL-1',
  qrStencilRef: 'OQR-1',
  items: [
    {
      id: 'item-1',
      variant: {
        product: { name: 'Classic Tee' },
        sku: 'TEE-BLK-M',
        size: 'M',
        colour: 'Black',
      },
      quantity: 2,
      unitPrice: 8500,
      shortfall: 1,
    },
  ],
  deliveredAt: null,
  createdAt: new Date('2026-01-01T10:00:00.000Z'),
  updatedAt: new Date('2026-01-01T10:00:00.000Z'),
} as Order;

const events = [
  {
    status: OrderStatus.ORDER_RECEIVED,
    note: 'Paid in full',
    actorId: 'staff-1',
    actorKind: 'staff',
    createdAt: new Date('2026-01-01T10:01:00.000Z'),
  },
  {
    status: OrderStatus.STOCK_EXCEPTION,
    note: 'Internal stock note',
    actorId: null,
    actorKind: 'system',
    createdAt: new Date('2026-01-01T10:02:00.000Z'),
  },
  {
    status: PAYMENT_EXCEPTION_EVENT,
    note: 'Payment provider detail',
    actorId: null,
    actorKind: 'system',
    createdAt: new Date('2026-01-01T10:03:00.000Z'),
  },
] as OrderStatusEvent[];

describe('mapOrderDetail', () => {
  it('returns a customer-safe snapshot for the customer audience', () => {
    const detail = mapOrderDetail(order, events, 'customer');

    expect(detail).toMatchObject({
      orderNumber: 'SO-1001',
      status: CUSTOMER_AWAITING_STOCK,
      totalAmount: 17000,
      deliveryFee: 1200,
      items: [{ productName: 'Classic Tee', sku: 'TEE-BLK-M', lineTotal: 17000 }],
      events: [{ status: OrderStatus.ORDER_RECEIVED }],
    });
    expect(detail.events[0]).not.toHaveProperty('note');
    expect(detail.events[0]).not.toHaveProperty('actorId');
    expect(detail.items[0]).not.toHaveProperty('shortfall');
    expect(detail).not.toHaveProperty('deliveryNote');
    expect(detail.events).toHaveLength(1);
  });

  it('includes operational fields and event attribution for staff', () => {
    const detail = mapOrderDetail(order, events, 'staff');

    expect(detail.status).toBe(OrderStatus.STOCK_EXCEPTION);
    expect(detail.deliveryNote).toBe('Keep upright');
    expect(detail.items[0].shortfall).toBe(1);
    expect(detail.events[0]).toMatchObject({
      note: 'Paid in full',
      actorId: 'staff-1',
      actorKind: 'staff',
    });
    expect(detail.events).toHaveLength(3);
  });
});
