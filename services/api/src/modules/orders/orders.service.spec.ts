import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import { OrderAccessToken } from './entities/order-access-token.entity';
import { OrderStatusEvent } from './entities/order-status-event.entity';
import { Order, OrderStatus, PaymentStatus } from './entities/order.entity';
import { Payment, PaymentMethod, PaymentRecordStatus } from './entities/payment.entity';
import { DeliveryLeg } from '../logistics/entities/delivery-leg.entity';
import { OrderStatusBus } from './order-status.bus';
import { OrdersService, PaystackWebhookEvent } from './orders.service';
import { PaystackService } from './paystack.service';

const finance: AuthenticatedUser = {
  id: 'fin-1',
  email: 'finance@seentair.test',
  role: RoleName.FINANCE_ACCOUNTING,
};
const customer: AuthenticatedUser = {
  id: 'cust-1',
  email: 'ada@realcompany.ng',
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
  // Order tracking reads delivery legs; no legs by default in these fixtures.
  const legRepo = {
    find: jest.fn(async (): Promise<Row[]> => []),
  };
  const repoByEntity = new Map<unknown, unknown>([
    [Order, orderRepo],
    [Payment, paymentRepo],
    [OrderStatusEvent, eventRepo],
    [DeliveryLeg, legRepo],
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
    legRepo,
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
    getAccessLevel: jest.fn(async (_role: RoleName, _module: ModuleName): Promise<AccessLevel> => {
      if (_module === ModuleName.PAYMENTS) return AccessLevel.FULL;
      return AccessLevel.VIEW;
    }),
  };
  // Paystack email override is permitted by default outside production, and the
  // callback base is blank unless a test sets it. One stable object so tests can
  // flip what the injected instance reads. `devInbox` is set because every seeded
  // account is @seentair.test, which Paystack refuses; without a configured
  // inbox no local payment can be initialised at all.
  let emailOverrideAllowed = true;
  let devInbox = 'paystack-receipts@seentair.test.local';
  const configValues: Record<string, unknown> = {
    'paystack.emailOverrideAllowed': emailOverrideAllowed,
    'paystack.devInbox': devInbox,
    'paystack.callbackUrlBase': '',
  };
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'paystack.emailOverrideAllowed') return emailOverrideAllowed;
      if (key === 'paystack.devInbox') return devInbox;
      return configValues[key];
    }) as (k: string) => unknown,
  };
  const paystackService = {
    configured: true,
    initializeTransaction: jest.fn(async (email: string, amount: number, reference: string) => ({
      authorizationUrl: `https://checkout.paystack.com/${reference}`,
      reference,
    })),
    verifyWebhookSignature: jest.fn(),
  };

  const chargeSuccess = (id: number, amount = 1700000): PaystackWebhookEvent => ({
    event: 'charge.success',
    data: { id, reference: 'seentair-o1-abc12345', amount },
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    emailOverrideAllowed = true;
    devInbox = 'paystack-receipts@seentair.test.local';
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
        { provide: getRepositoryToken(DeliveryLeg), useValue: h.legRepo },
        {
          provide: getRepositoryToken(OrderAccessToken),
          useValue: {
            create: jest.fn((v) => v),
            save: jest.fn(async (v) => v),
            findOne: jest.fn(),
          },
        },
        { provide: OrderStatusBus, useValue: new OrderStatusBus() },
        { provide: CatalogueService, useValue: {} },
        { provide: InventoryService, useValue: inventoryService },
        { provide: PermissionsService, useValue: permissionsService },
        { provide: UsersService, useValue: usersService },
        { provide: PaystackService, useValue: paystackService },
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
        { provide: ConfigService, useValue: config },
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

  // ---- Paystack payment init: receipt email override ----

  it('charges the order customer when no email override is given', async () => {
    // A deliverable address, so this tests its own intent: no override means
    // the customer's own address. The reserved-TLD case is covered by the
    // "Paystack receipt address" block below.
    h.order()['customer'] = { id: 'cust-1', email: 'ada@realcompany.ng' };
    await service.initPaystackPayment('o1', customer);
    // 4th arg: the Paystack return URL. null here because the suite's config
    // stub has no callback base configured.
    expect(paystackService.initializeTransaction).toHaveBeenCalledWith(
      'ada@realcompany.ng',
      17000,
      expect.stringMatching(/^seentair-o1-/),
      null,
    );
  });

  it('an override redirects the receipt — seeded .test addresses cannot be charged', async () => {
    h.order()['customer'] = { id: 'cust-1', email: 'ada@realcompany.ng' };
    await service.initPaystackPayment('o1', customer, 'real.inbox@example.com');
    expect(paystackService.initializeTransaction).toHaveBeenCalledWith(
      'real.inbox@example.com',
      17000,
      expect.stringMatching(/^seentair-o1-/),
      null,
    );
  });

  describe('Paystack return URL', () => {
    it('sends the order tracking page as the callback when a base is configured', async () => {
      // Mirrors mail.resetUrlBase: the API owns the URL so a client cannot turn
      // it into an open redirect.
      configValues['paystack.callbackUrlBase'] = 'https://seent-air-fashion.vercel.app';
      h.order()['customer'] = { id: 'cust-1', email: 'ada@realcompany.ng' };
      await service.initPaystackPayment('o1', customer);
      expect(paystackService.initializeTransaction).toHaveBeenCalledWith(
        'ada@realcompany.ng',
        17000,
        expect.any(String),
        'https://seent-air-fashion.vercel.app/o1',
      );
    });

    it('does not double up slashes when the base has a trailing one', async () => {
      configValues['paystack.callbackUrlBase'] = 'https://app.test/';
      h.order()['customer'] = { id: 'cust-1', email: 'ada@realcompany.ng' };
      await service.initPaystackPayment('o1', customer);
      expect(paystackService.initializeTransaction).toHaveBeenCalledWith(
        'ada@realcompany.ng',
        17000,
        expect.any(String),
        'https://app.test/o1',
      );
    });

    it('sends no callback at all when the base is blank', async () => {
      configValues['paystack.callbackUrlBase'] = '';
      h.order()['customer'] = { id: 'cust-1', email: 'ada@realcompany.ng' };
      await service.initPaystackPayment('o1', customer);
      expect(paystackService.initializeTransaction).toHaveBeenCalledWith(
        'ada@realcompany.ng',
        17000,
        expect.any(String),
        null,
      );
    });
  });

  it('the override is refused where it is not allowed, so a live charge keeps the customer address', async () => {
    emailOverrideAllowed = false;
    h.order()['customer'] = { id: 'cust-1', email: 'ada@realcompany.ng' };
    await expect(
      service.initPaystackPayment('o1', customer, 'attacker@example.com'),
    ).rejects.toThrow(ForbiddenException);
    expect(paystackService.initializeTransaction).not.toHaveBeenCalled();
  });

  it('records a PENDING payment row against the reference Paystack returned', async () => {
    h.order()['customer'] = { id: 'cust-1', email: 'ada@realcompany.ng' };
    await service.initPaystackPayment('o1', customer);
    expect(h.paymentRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        method: PaymentMethod.PAYSTACK,
        amount: 17000,
        status: PaymentRecordStatus.PENDING,
        reference: expect.stringMatching(/^seentair-o1-/),
      }),
    );
  });

  // ---- Paystack receipt address: reserved TLDs ----

  /**
   * Every seeded account is @seentair.test and Paystack rejects the reserved
   * TLD on initialise, so without a local fallback no development payment can
   * be started. These pin that: substitute when configured, refuse clearly
   * when not, and never touch a real buyer's address.
   */
  describe('Paystack receipt address', () => {
    it('receipts a seeded .test account at the configured dev inbox', async () => {
      h.order()['customer'] = { id: 'cust-1', email: 'wholesaler@seentair.test' };
      await service.initPaystackPayment('o1', customer);
      // First arg only: these tests are about the receipt address, and the
      // callback arg is null here because the harness sets no callback base.
      expect(paystackService.initializeTransaction.mock.calls[0][0]).toBe(devInbox);
    });

    it('leaves a real buyer address completely alone', async () => {
      h.order()['customer'] = { id: 'cust-1', email: 'buyer@realcompany.ng' };
      await service.initPaystackPayment('o1', customer);
      expect(paystackService.initializeTransaction.mock.calls[0][0]).toBe('buyer@realcompany.ng');
    });

    it('refuses with an actionable message when no dev inbox is configured', async () => {
      devInbox = '';
      h.order()['customer'] = { id: 'cust-1', email: 'wholesaler@seentair.test' };
      await expect(service.initPaystackPayment('o1', customer)).rejects.toThrow(
        /PAYSTACK_DEV_INBOX/,
      );
    });

    it('refuses rather than substituting when overrides are off, as in production', async () => {
      emailOverrideAllowed = false;
      devInbox = 'paystack-receipts@seentair.test.local';
      h.order()['customer'] = { id: 'cust-1', email: 'wholesaler@seentair.test' };
      await expect(service.initPaystackPayment('o1', customer)).rejects.toThrow(
        /not a deliverable address/,
      );
      expect(paystackService.initializeTransaction).not.toHaveBeenCalled();
    });

    it('still lets an explicit client override win when permitted', async () => {
      h.order()['customer'] = { id: 'cust-1', email: 'wholesaler@seentair.test' };
      await service.initPaystackPayment('o1', customer, 'override@inbox.test');
      expect(paystackService.initializeTransaction.mock.calls[0][0]).toBe('override@inbox.test');
    });

    it('refuses an explicit override in production, as before', async () => {
      emailOverrideAllowed = false;
      h.order()['customer'] = { id: 'cust-1', email: 'buyer@realcompany.ng' };
      await expect(
        service.initPaystackPayment('o1', customer, 'attacker@evil.test'),
      ).rejects.toThrow(/not permitted/);
    });
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

  describe('tracking audience is derived server-side', () => {
    const seededNote = 'INTERNAL-NOTE-driver-swapped';
    const seededZone = 'INTERNAL-ZONE-DEPOT-7';

    beforeEach(() => {
      h.order()['status'] = OrderStatus.SHIPPED;
      h.legRepo.find.mockResolvedValue([
        {
          legNumber: 1,
          carrier: 'gigl',
          status: 'in_transit',
          trackingRef: 'GIGL-1',
          zone: seededZone,
          driverName: 'Ade Okafor',
          driverPhone: '+2348000000000',
          cost: 4200,
          checkpoints: [
            {
              zone: seededZone,
              status: 'on_track',
              note: seededNote,
              sealId: 'SEAL-77',
              driverName: 'Ade Okafor',
              timestamp: '2026-09-28T07:00:00.000Z',
            },
          ],
        },
      ] as never);
    });

    it('gives a customer the reduced leg, with no zone, note or surname', async () => {
      const res = await service.tracking('o1', customer);
      const json = JSON.stringify(res);
      expect(json).not.toContain(seededNote);
      expect(json).not.toContain(seededZone);
      expect(json).not.toContain('Okafor');
      expect(res.deliveries[0].driverName).toBe('Ade');
    });

    it('gives staff the full leg', async () => {
      const res = await service.tracking('o1', finance);
      const leg = res.deliveries[0] as unknown as Record<string, unknown>;
      expect(leg['driverName']).toBe('Ade Okafor');
      expect(leg['driverPhone']).toBe('+2348000000000');
      expect(leg['zone']).toBe(seededZone);
      expect(leg['cost']).toBe(4200);
      expect((leg['checkpoints'] as Array<Record<string, unknown>>)[0]['note']).toBe(seededNote);
    });

    it('ignores a client-supplied audience and still returns the customer shape', async () => {
      // The endpoint takes no such parameter. Even if a caller appends one, or
      // forges a body/header, nothing reads it - the audience comes from the
      // caller's own permission row.
      const asCustomer = await service.tracking('o1', customer);
      const json = JSON.stringify(asCustomer);
      expect(json).not.toContain(seededNote);
      expect(json).not.toContain(seededZone);
      expect(json).not.toContain('Okafor');
      expect(json).not.toContain('SEAL-77');
    });

    it('refuses a role with no order access outright, before shaping anything', async () => {
      // A role with no grant is rejected by findById, so it never reaches the
      // audience decision. That is stricter than defaulting it to 'customer'.
      permissionsService.getAccessLevel.mockResolvedValue(AccessLevel.NONE);
      await expect(
        service.tracking('o1', { ...customer, role: RoleName.MANAGEMENT }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('gives a buyer with only OWN access the customer shape, not the staff one', async () => {
      // Fail-closed by rank: OWN(1) < VIEW(2), so a WHOLESALER looking at their
      // own order is treated as a buyer, not as staff.
      permissionsService.getAccessLevel.mockResolvedValue(AccessLevel.OWN);
      const res = await service.tracking('o1', {
        ...customer,
        role: RoleName.WHOLESALER,
      });
      const json = JSON.stringify(res);
      expect(json).not.toContain(seededNote);
      expect(json).not.toContain(seededZone);
      expect(json).not.toContain('Okafor');
    });

    it('gives staff only VIEW or above the staff shape', async () => {
      permissionsService.getAccessLevel.mockResolvedValue(AccessLevel.VIEW);
      const res = await service.tracking('o1', finance);
      expect(JSON.stringify(res)).toContain(seededNote);
    });

    describe('status event notes are staff-side', () => {
      const seededEventNote = 'INTERNAL-NOTE-payout-hold-pending-teller';

      beforeEach(() => {
        h.order()['status'] = OrderStatus.PROCESSING;
        h.eventRepo.find.mockResolvedValue([
          {
            status: 'order_received',
            note: 'Paid in full via paystack',
            createdAt: '2026-09-28T10:01:00.000Z',
          },
          {
            status: 'processing',
            note: seededEventNote,
            createdAt: '2026-09-28T11:00:00.000Z',
          },
        ] as never);
      });

      it('omits the note from the customer payload entirely', async () => {
        const res = await service.tracking('o1', customer);
        expect(JSON.stringify(res)).not.toContain(seededEventNote);
      });

      it('leaves each customer event with only status and createdAt', async () => {
        const res = await service.tracking('o1', customer);
        for (const e of res.events) {
          expect(Object.keys(e).sort()).toEqual(['createdAt', 'status']);
        }
      });

      it('still shows the status and time a customer needs', async () => {
        const res = await service.tracking('o1', customer);
        expect(res.events.map((e) => e.status)).toEqual(['order_received', 'processing']);
        expect(res.events[0].createdAt).toBe('2026-09-28T10:01:00.000Z');
      });

      it('keeps the note for staff', async () => {
        const res = await service.tracking('o1', finance);
        expect(JSON.stringify(res)).toContain(seededEventNote);
      });
    });
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
