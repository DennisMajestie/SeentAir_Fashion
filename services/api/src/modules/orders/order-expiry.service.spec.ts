import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OrderExpiryService } from './order-expiry.service';
import { OrderStatusEvent } from './entities/order-status-event.entity';
import { Order, OrderStatus, PaymentStatus } from './entities/order.entity';

describe('OrderExpiryService — the unpaid-order sweep', () => {
  let service: OrderExpiryService;
  let stale: Array<Record<string, unknown>>;

  const orderRepo = {
    find: jest.fn(async (_opts?: { where?: Record<string, unknown> }) => stale),
    save: jest.fn(async (v) => v),
  };
  const eventRepo = {
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => v),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    stale = [];
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrderExpiryService,
        { provide: getRepositoryToken(Order), useValue: orderRepo },
        { provide: getRepositoryToken(OrderStatusEvent), useValue: eventRepo },
        { provide: ConfigService, useValue: { get: jest.fn(() => 24) } },
      ],
    }).compile();
    service = moduleRef.get(OrderExpiryService);
  });

  it('only ever looks for orders that are both awaiting payment and unpaid', async () => {
    await service.expireUnpaidOrders();
    const where = (orderRepo.find.mock.calls[0] as [{ where: Record<string, unknown> }])[0].where;
    expect(where.status).toBe(OrderStatus.AWAITING_PAYMENT);
    expect(where.paymentStatus).toBe(PaymentStatus.UNPAID);
    // A paid order is never eligible, whatever its age.
    expect(where.createdAt).toBeDefined();
  });

  it('cancels a stale order and records why', async () => {
    stale = [{ id: 'o1', status: OrderStatus.AWAITING_PAYMENT }];
    const count = await service.expireUnpaidOrders();
    expect(count).toBe(1);
    expect(stale[0].status).toBe(OrderStatus.CANCELLED);
    expect(eventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: OrderStatus.CANCELLED,
        note: expect.stringContaining('24h'),
      }),
    );
  });

  it('writes nothing when there is nothing stale', async () => {
    expect(await service.expireUnpaidOrders()).toBe(0);
    expect(orderRepo.save).not.toHaveBeenCalled();
    expect(eventRepo.save).not.toHaveBeenCalled();
  });
});
