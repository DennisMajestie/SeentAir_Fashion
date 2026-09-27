import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { AccessLevel, ModuleName, RoleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { AccountingService } from '../accounting/accounting.service';
import { LedgerEntryType } from '../accounting/ledger-entry.entity';
import { CatalogueService } from '../catalogue/catalogue.service';
import { MovementType } from '../inventory/inventory-movement.entity';
import { InsufficientStockException, InventoryService } from '../inventory/inventory.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PermissionsService } from '../users/permissions.service';
import { UsersService } from '../users/users.service';
import { WholesaleService } from '../wholesale/wholesale.service';
import { OrderStatusEvent } from './entities/order-status-event.entity';
import { Order, OrderStatus, PaymentStatus } from './entities/order.entity';
import { Payment, PaymentMethod, PaymentRecordStatus } from './entities/payment.entity';
import { OrdersService, PaystackWebhookEvent } from './orders.service';
import { PaystackService } from './paystack.service';

const finance: AuthenticatedUser = {
  id: 'fin-1',
  email: 'finance@seentair.test',
  role: RoleName.FINANCE_ACCOUNTING,
};
const customer: AuthenticatedUser = {
  id: 'cust-1',
  email: 'ada@seentair.test',
  role: RoleName.CUSTOMER,
};

type Row = Record<string, unknown>;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const flush = () => new Promise((resolve) => setImmediate(resolve));

/**
 * In-memory stand-in for what the payment path leans on in Postgres: repositories,
 * row-locked findOne, the ON CONFLICT DO NOTHING event claim, and transactions
 * that (a) run one at a time — the payment row lock and the unique event index
 * serialise concurrent deliveries exactly like this — and (b) roll the event
 * claim and every row mutation back when the callback throws.
 */
function harness() {
  let order: Row = {};
  let payments = new Map<string, Row>();
  let processed = new Set<string>();

  const orderRepo = {
    findOne: jest.fn(async () => order),
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => v),
    findAndCount: jest.fn(async () => [[], 0]),
  };
  const paymentRepo = {
    findOne: jest.fn(),
    create: jest.fn((v: Row) => v),
    save: jest.fn(async (v: Row) => {
      if (!v['id']) v['id'] = `p${payments.size + 1}`;
      payments.set(v['id'] as string, v);
      return v;
    }),
    update: jest.fn(async () => undefined),
  };
  const eventRepo = {
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => v),
    find: jest.fn(async (): Promise<Row[]> => []),
  };
  const repoByEntity = new Map<unknown, unknown>([
    [Order, orderRepo],
    [Payment, paymentRepo],
    [OrderStatusEvent, eventRepo],
  ]);

  const manager = {
    getRepository: (entity: unknown) => repoByEntity.get(entity),
    findOne: jest.fn(async (entity: unknown, opts: { where: Row }) => {
      if (entity === Order) return opts.where['id'] === order['id'] ? order : null;
      if (entity === Payment) {
        return (
          [...payments.values()].find(
            (p) =>
              (opts.where['id'] !== undefined && p['id'] === opts.where['id']) ||
              (opts.where['reference'] !== undefined && p['reference'] === opts.where['reference']),
          ) ?? null
        );
      }
      return null;
    }),
    createQueryBuilder: () => {
      let values: { provider: string; eventId: string } | null = null;
      const qb = {
        insert: () => qb,
        into: () => qb,
        orIgnore: () => qb,
        values: (v: { provider: string; eventId: string }) => {
          values = v;
          return qb;
        },
        execute: async () => {
          const key = `${values?.provider}:${values?.eventId}`;
          if (processed.has(key)) return { raw: [], identifiers: [] };
          processed.add(key);
          return { raw: [{ id: key }], identifiers: [{ id: key }] };
        },
      };
      return qb;
    },
  };

  let chain: Promise<unknown> = Promise.resolve();
  const dataSource = {
    transaction: jest.fn((fn: (m: unknown) => Promise<unknown>) => {
      const run = chain.then(async () => {
        const snapshot = {
          processed: new Set(processed),
          order: clone(order),
          payments: new Map([...payments].map(([k, v]) => [k, clone(v)])),
        };
        try {
          return await fn(manager);
        } catch (err) {
          processed = snapshot.processed;
          Object.assign(order, snapshot.order);
          payments = snapshot.payments;
          throw err;
        }
      });
      chain = run.catch(() => undefined);
      return run;
    }),
  };

  return {
    orderRepo,
    paymentRepo,
    eventRepo,
    dataSource,
    setOrder: (o: Row) => {
      order = o;
    },
    order: () => order,
    payment: (id: string) => payments.get(id),
    seedPayment: (p: Row) => payments.set(p['id'] as string, p),
  };
}

describe('OrdersService — payment rules', () => {
  let service: OrdersService;
  let h: ReturnType<typeof harness>;

  const inventoryService = {
    record: jest.fn(),
    lockItems: jest.fn(async () => undefined),
    currentQuantity: jest.fn(async () => 100),
  };
  const accountingService = { record: jest.fn() };
  const notificationsService = {
    onOrderStatusChange: jest.fn(async () => undefined),
    notifyInPlatform: jest.fn(async () => undefined),
  };
  const usersService = {
    findByRoles: jest.fn(async () => [{ id: 'staff-1' }, { id: 'staff-2' }]),
  };
  const permissionsService = {
    getAccessLevel: jest.fn(async (_role: RoleName, module: ModuleName) => {
      if (module === ModuleName.PAYMENTS) return AccessLevel.FULL;
      return AccessLevel.VIEW;
    }),
  };

  const chargeSuccess = (id: number, amount = 1700000): PaystackWebhookEvent => ({
    event: 'charge.success',
    data: { id, reference: 'seentair-o1-abc12345', amount },
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    inventoryService.record.mockReset();
    h = harness();
    h.setOrder({
      id: 'o1',
      channel: 'retail',
      totalAmount: 17000,
      paymentStatus: PaymentStatus.UNPAID,
      status: OrderStatus.AWAITING_PAYMENT,
      customer: { id: 'cust-1' },
      items: [
        {
          id: 'i1',
          variant: { id: 'v1', sku: 'TEE-BLK-M' },
          quantity: 2,
          unitPrice: 8500,
          shortfall: 0,
        },
      ],
    });
    h.seedPayment({
      id: 'p1',
      reference: 'seentair-o1-abc12345',
      status: PaymentRecordStatus.PENDING,
      orderId: 'o1',
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Order), useValue: h.orderRepo },
        { provide: getRepositoryToken(Payment), useValue: h.paymentRepo },
        { provide: getRepositoryToken(OrderStatusEvent), useValue: h.eventRepo },
        { provide: CatalogueService, useValue: {} },
        { provide: InventoryService, useValue: inventoryService },
        { provide: PermissionsService, useValue: permissionsService },
        { provide: UsersService, useValue: usersService },
        { provide: PaystackService, useValue: { configured: false } },
        {
          provide: WholesaleService,
          useValue: {
            moq: 20,
            assertApprovedAccount: jest.fn(),
            applyTierPrice: (p: number) => p,
          },
        },
        { provide: AccountingService, useValue: accountingService },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: getDataSourceToken(), useValue: h.dataSource },
      ],
    }).compile();
    service = moduleRef.get(OrdersService);
  });

  // ---- offline payments (unchanged rules) ----

  it('rejects a part-payment (amount below total)', async () => {
    await expect(
      service.recordOfflinePayment('o1', { method: PaymentMethod.CASH, amount: 10000 }, finance),
    ).rejects.toThrow('No part-payments');
    expect(inventoryService.record).not.toHaveBeenCalled();
  });

  it('rejects an overpayment too — amount must equal the total exactly', async () => {
    await expect(
      service.recordOfflinePayment('o1', { method: PaymentMethod.CASH, amount: 20000 }, finance),
    ).rejects.toThrow(BadRequestException);
  });

  it('full payment confirms the order and decrements stock via ledger movements', async () => {
    await service.recordOfflinePayment(
      'o1',
      { method: PaymentMethod.CASH, amount: 17000 },
      finance,
    );
    expect(h.order()['paymentStatus']).toBe(PaymentStatus.PAID);
    expect(h.order()['status']).toBe(OrderStatus.ORDER_RECEIVED);
    expect(inventoryService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: 'v1',
        movementType: MovementType.SALE,
        quantityDelta: -2,
        referenceId: 'o1',
      }),
      expect.anything(),
    );
  });

  it('an already-paid order cannot be paid again', async () => {
    h.order()['paymentStatus'] = PaymentStatus.PAID;
    await expect(
      service.recordOfflinePayment('o1', { method: PaymentMethod.CASH, amount: 17000 }, finance),
    ).rejects.toThrow(ConflictException);
  });

  it('staff without full payments access cannot record offline payments', async () => {
    permissionsService.getAccessLevel.mockResolvedValue(AccessLevel.VIEW);
    await expect(
      service.recordOfflinePayment('o1', { method: PaymentMethod.CASH, amount: 17000 }, finance),
    ).rejects.toThrow(ForbiddenException);
  });

  // ---- Paystack webhook: idempotency ----

  it('two identical charge.success deliveries in flight apply the payment exactly once', async () => {
    const event = chargeSuccess(555);
    const [a, b] = await Promise.all([
      service.handlePaystackEvent(event),
      service.handlePaystackEvent(event),
    ]);
    expect([a.outcome, b.outcome].sort()).toEqual(['applied', 'duplicate_event']);
    expect(inventoryService.record).toHaveBeenCalledTimes(1);
    expect(accountingService.record).toHaveBeenCalledTimes(1);
    expect(h.eventRepo.save).toHaveBeenCalledTimes(1);
    expect(h.eventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: OrderStatus.ORDER_RECEIVED }),
    );
    expect(h.order()['paymentStatus']).toBe(PaymentStatus.PAID);
    expect(h.payment('p1')?.['status']).toBe(PaymentRecordStatus.SUCCESS);
  });

  it('a second event for the same reference stops at the locked payment row', async () => {
    await service.handlePaystackEvent(chargeSuccess(555));
    const again = await service.handlePaystackEvent(chargeSuccess(556));
    expect(again.outcome).toBe('already_applied');
    expect(inventoryService.record).toHaveBeenCalledTimes(1);
    expect(accountingService.record).toHaveBeenCalledTimes(1);
    expect(h.eventRepo.save).toHaveBeenCalledTimes(1);
  });

  // ---- Paystack webhook: terminal conditions are recorded and acknowledged ----

  it('an amount mismatch marks the payment FAILED, alerts staff and is not retried', async () => {
    const first = await service.handlePaystackEvent(chargeSuccess(555, 1000));
    expect(first.outcome).toBe('amount_mismatch');
    expect(h.payment('p1')?.['status']).toBe(PaymentRecordStatus.FAILED);
    expect(h.order()['paymentStatus']).toBe(PaymentStatus.UNPAID);
    expect(inventoryService.record).not.toHaveBeenCalled();
    expect(accountingService.record).not.toHaveBeenCalled();
    expect(h.eventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'payment_exception' }),
    );
    await flush();
    expect(notificationsService.notifyInPlatform).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'payment_exception', relatedOrderId: 'o1' }),
    );
    // The claim committed, so Paystack's redelivery is a duplicate, not a retry loop.
    const retry = await service.handlePaystackEvent(chargeSuccess(555, 1000));
    expect(retry.outcome).toBe('duplicate_event');
    expect(notificationsService.notifyInPlatform).toHaveBeenCalledTimes(2);
  });

  it('a charge for an order already settled is captured as a duplicate for staff to refund', async () => {
    h.order()['paymentStatus'] = PaymentStatus.PAID;
    h.order()['status'] = OrderStatus.ORDER_RECEIVED;
    const result = await service.handlePaystackEvent(chargeSuccess(555));
    expect(result.outcome).toBe('duplicate_charge');
    expect(h.payment('p1')?.['status']).toBe(PaymentRecordStatus.SUCCESS); // money was taken
    expect(h.order()['status']).toBe(OrderStatus.ORDER_RECEIVED); // order untouched
    expect(inventoryService.record).not.toHaveBeenCalled();
    expect(accountingService.record).not.toHaveBeenCalled();
    expect(h.eventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'payment_exception' }),
    );
    await flush();
    expect(notificationsService.notifyInPlatform).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'payment_exception' }),
    );
  });

  it('a late charge cannot resurrect a refunded order', async () => {
    h.order()['paymentStatus'] = PaymentStatus.REFUNDED;
    h.order()['status'] = OrderStatus.CANCELLED;
    const result = await service.handlePaystackEvent(chargeSuccess(555));
    expect(result.outcome).toBe('duplicate_charge');
    expect(h.order()['status']).toBe(OrderStatus.CANCELLED);
    expect(h.order()['paymentStatus']).toBe(PaymentStatus.REFUNDED);
    expect(inventoryService.record).not.toHaveBeenCalled();
  });

  it('an unknown reference and a malformed or unrelated event are acknowledged, not retried', async () => {
    const unknown = await service.handlePaystackEvent({
      event: 'charge.success',
      data: { id: 9, reference: 'not-ours', amount: 1 },
    });
    expect(unknown.outcome).toBe('unknown_reference');
    const malformed = await service.handlePaystackEvent({
      event: 'charge.success',
    } as PaystackWebhookEvent);
    expect(malformed.outcome).toBe('ignored');
    const transfer = await service.handlePaystackEvent({
      event: 'transfer.success',
      data: { id: 10 },
    });
    expect(transfer.outcome).toBe('ignored');
    expect(inventoryService.record).not.toHaveBeenCalled();
    expect(h.order()['paymentStatus']).toBe(PaymentStatus.UNPAID);
  });

  // ---- Paystack webhook: a paid order never rolls back to unpaid ----

  it('short stock commits the payment side and parks the order in STOCK_EXCEPTION', async () => {
    inventoryService.record.mockRejectedValueOnce(
      new InsufficientStockException(
        'Insufficient stock: current quantity is 0, movement of -2 refused',
      ),
    );
    const first = await service.handlePaystackEvent(chargeSuccess(555));
    expect(first.outcome).toBe('applied');

    const order = h.order();
    expect(order['paymentStatus']).toBe(PaymentStatus.PAID);
    expect(order['status']).toBe(OrderStatus.STOCK_EXCEPTION);
    expect((order['items'] as Row[])[0]['shortfall']).toBe(2);
    expect(h.payment('p1')?.['status']).toBe(PaymentRecordStatus.SUCCESS);
    expect(inventoryService.record).toHaveBeenCalledTimes(1); // attempted, refused, no movement
    expect(accountingService.record).toHaveBeenCalledTimes(1);
    expect(h.eventRepo.save).toHaveBeenCalledTimes(2);
    expect(h.eventRepo.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: OrderStatus.STOCK_EXCEPTION }),
    );
    await flush();
    expect(notificationsService.notifyInPlatform).toHaveBeenCalledTimes(2);
    expect(notificationsService.notifyInPlatform).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'stock_exception', relatedOrderId: 'o1' }),
    );

    // Paystack retries the same event: acknowledged, nothing duplicated.
    const retry = await service.handlePaystackEvent(chargeSuccess(555));
    expect(retry.outcome).toBe('duplicate_event');
    expect(inventoryService.record).toHaveBeenCalledTimes(1);
    expect(accountingService.record).toHaveBeenCalledTimes(1);
    expect(h.eventRepo.save).toHaveBeenCalledTimes(2);
  });

  it('any other error rolls the whole delivery back and the retry then succeeds', async () => {
    inventoryService.record.mockRejectedValueOnce(new Error('connection reset'));
    await expect(service.handlePaystackEvent(chargeSuccess(555))).rejects.toThrow(
      'connection reset',
    );
    expect(accountingService.record).not.toHaveBeenCalled();
    expect(h.order()['paymentStatus']).toBe(PaymentStatus.UNPAID);

    const retry = await service.handlePaystackEvent(chargeSuccess(555));
    expect(retry.outcome).toBe('applied');
    expect(h.order()['paymentStatus']).toBe(PaymentStatus.PAID);
    expect(h.order()['status']).toBe(OrderStatus.ORDER_RECEIVED);
    expect(accountingService.record).toHaveBeenCalledTimes(1);
  });

  // ---- stock exception resolution ----

  it('allocate retries only the short lines and returns the order to fulfilment', async () => {
    permissionsService.getAccessLevel.mockResolvedValue(AccessLevel.FULL);
    const order = h.order();
    order['paymentStatus'] = PaymentStatus.PAID;
    order['status'] = OrderStatus.STOCK_EXCEPTION;
    (order['items'] as Row[])[0]['shortfall'] = 2;

    await service.allocateStockException('o1', finance);
    expect(inventoryService.record).toHaveBeenCalledTimes(1);
    expect(inventoryService.record).toHaveBeenCalledWith(
      expect.objectContaining({ movementType: MovementType.SALE, quantityDelta: -2, itemId: 'v1' }),
      expect.anything(),
    );
    expect(order['status']).toBe(OrderStatus.ORDER_RECEIVED);
    expect((order['items'] as Row[])[0]['shortfall']).toBe(0);
  });

  it('refund releases allocated units, records the refund and cancels the order', async () => {
    const order = h.order();
    order['paymentStatus'] = PaymentStatus.PAID;
    order['status'] = OrderStatus.STOCK_EXCEPTION;
    order['items'] = [
      {
        id: 'i1',
        variant: { id: 'v1', sku: 'TEE-BLK-M' },
        quantity: 1,
        unitPrice: 8500,
        shortfall: 0,
      },
      {
        id: 'i2',
        variant: { id: 'v2', sku: 'CAP-BLK' },
        quantity: 2,
        unitPrice: 4250,
        shortfall: 2,
      },
    ];

    await service.refundStockException('o1', finance);
    expect(inventoryService.record).toHaveBeenCalledTimes(1);
    expect(inventoryService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        movementType: MovementType.ADJUSTMENT,
        quantityDelta: 1,
        itemId: 'v1',
      }),
      expect.anything(),
    );
    expect(order['status']).toBe(OrderStatus.CANCELLED);
    expect(order['paymentStatus']).toBe(PaymentStatus.REFUNDED);
    expect(accountingService.record).toHaveBeenCalledWith(
      expect.objectContaining({ type: LedgerEntryType.EXPENSE, amount: 17000, referenceId: 'o1' }),
      expect.anything(),
    );
  });

  it('a stock-exception order cannot be pushed through the tracking flow', async () => {
    permissionsService.getAccessLevel.mockResolvedValue(AccessLevel.FULL);
    h.order()['paymentStatus'] = PaymentStatus.PAID;
    h.order()['status'] = OrderStatus.STOCK_EXCEPTION;
    await expect(
      service.updateStatus('o1', OrderStatus.PROCESSING, undefined, finance),
    ).rejects.toThrow(ConflictException);
  });

  it('customers see a stock exception as ORDER_RECEIVED without the internal notes', async () => {
    h.order()['paymentStatus'] = PaymentStatus.PAID;
    h.order()['status'] = OrderStatus.STOCK_EXCEPTION;
    h.eventRepo.find.mockResolvedValue([
      { status: 'order_received', note: 'Paid in full via paystack' },
      { status: 'stock_exception', note: 'Paid; stock short: TEE-BLK-M ×2' },
      { status: 'payment_exception', note: 'Duplicate Paystack charge …' },
    ]);
    const forCustomer = await service.tracking('o1', customer);
    expect(forCustomer.status).toBe(OrderStatus.ORDER_RECEIVED);
    expect(forCustomer.events.map((e) => e.status)).toEqual(['order_received']);

    const forStaff = await service.tracking('o1', finance);
    expect(forStaff.status).toBe(OrderStatus.STOCK_EXCEPTION);
    expect(forStaff.events).toHaveLength(3);
  });

  // ---- tracking flow (unchanged rules) ----

  it('an unpaid order cannot progress through fulfilment statuses', async () => {
    permissionsService.getAccessLevel.mockResolvedValue(AccessLevel.FULL);
    await expect(
      service.updateStatus('o1', OrderStatus.PROCESSING, undefined, finance),
    ).rejects.toThrow('fully paid');
  });

  it('status flow is forward-only', async () => {
    permissionsService.getAccessLevel.mockResolvedValue(AccessLevel.FULL);
    h.order()['paymentStatus'] = PaymentStatus.PAID;
    h.order()['status'] = OrderStatus.SHIPPED;
    await expect(
      service.updateStatus('o1', OrderStatus.PROCESSING, undefined, finance),
    ).rejects.toThrow(ConflictException);
  });

  it('RETURNED cannot be set directly (returns workflow owns it)', async () => {
    permissionsService.getAccessLevel.mockResolvedValue(AccessLevel.FULL);
    h.order()['paymentStatus'] = PaymentStatus.PAID;
    await expect(
      service.updateStatus('o1', OrderStatus.RETURNED, undefined, finance),
    ).rejects.toThrow(BadRequestException);
  });

  it('DELIVERED stamps deliveredAt (anchor for reviews and the 12h return window)', async () => {
    permissionsService.getAccessLevel.mockResolvedValue(AccessLevel.FULL);
    h.order()['paymentStatus'] = PaymentStatus.PAID;
    h.order()['status'] = OrderStatus.SHIPPED;
    await service.updateStatus('o1', OrderStatus.DELIVERED, undefined, finance);
    expect(h.order()['deliveredAt']).toBeInstanceOf(Date);
  });
});
