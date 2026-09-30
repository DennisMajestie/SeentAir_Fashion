import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { AccessLevel, ModuleName, RoleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { AccountingService } from '../accounting/accounting.service';
import { CatalogueService } from '../catalogue/catalogue.service';
import { AvailabilityStatus } from '../catalogue/entities/product-variant.entity';
import { InventoryService } from '../inventory/inventory.service';
import { DeliveryLeg } from '../logistics/entities/delivery-leg.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { PermissionsService } from '../users/permissions.service';
import { UsersService } from '../users/users.service';
import { WholesaleService } from '../wholesale/wholesale.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderAccessToken } from './entities/order-access-token.entity';
import { OrderStatusEvent } from './entities/order-status-event.entity';
import { Order, OrderChannel, OrderStatus, PaymentStatus } from './entities/order.entity';
import {
  Payment,
  PaymentMethod,
  PaymentRecordStatus,
} from './entities/payment.entity';
import { OrderStatusBus } from './order-status.bus';
import { OrdersService } from './orders.service';
import { PaystackService } from './paystack.service';

const SHIP_TO = {
  state: 'Lagos',
  city: 'Yaba',
  line: '12 Herbert Macaulay Way',
  phone: '+2348000000000',
};
const GUEST = { name: 'Ada Obi', email: 'ada@example.com' };

const customer: AuthenticatedUser = {
  id: 'c1',
  email: 'c@x.test',
  role: RoleName.CUSTOMER,
};

describe('OrdersService — guest checkout', () => {
  let service: OrdersService;

  const orderRepo = {
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => ({ id: 'o-new', ...v })),
    findOne: jest.fn(),
    findAndCount: jest.fn(async () => [[], 0]),
    update: jest.fn(async () => ({ affected: 0 })),
  };
  const variant = {
    id: 'v1',
    sku: 'TEE-BLK-M',
    priceOverride: null,
    availabilityStatus: AvailabilityStatus.IN_STOCK,
    product: { id: 'p1', name: 'Box Tee', basePrice: 9000 },
  };
  const catalogueService = { findVariantById: jest.fn(async () => variant) };
  const paymentRepo = {
    findOne: jest.fn(),
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => v),
  };
  const paystackService = {
    configured: true,
    initializeTransaction: jest.fn(async () => ({
      authorizationUrl: 'https://checkout.test/xyz',
      reference: 'seentair-o1-deadbeef',
    })),
  };
  const inventoryService = {
    currentQuantity: jest.fn(async () => 100),
    record: jest.fn(),
    lockItems: jest.fn(async () => undefined),
  };
  const permissionsService = {
    getAccessLevel: jest.fn(async (_r: RoleName, _m: ModuleName) => AccessLevel.OWN),
  };
  const usersService = {
    findById: jest.fn(async (id: string) => ({ id })),
    findByRoles: jest.fn(),
  };
  const wholesaleService = {
    moq: 20,
    assertApprovedAccount: jest.fn(),
    applyTierPrice: (p: number) => p,
  };
  /** Captures the hashed token rows so a test can assert one was minted. */
  const accessTokenRepo = {
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => ({ id: 'tok-1', ...v })),
    findOne: jest.fn(),
  };

  const order = (dto: Partial<CreateOrderDto>): CreateOrderDto =>
    ({ items: [{ variantId: 'v1', quantity: 1 }], ...dto }) as CreateOrderDto;

  beforeEach(async () => {
    jest.clearAllMocks();
    variant.availabilityStatus = AvailabilityStatus.IN_STOCK;
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Order), useValue: orderRepo },
        { provide: getRepositoryToken(Payment), useValue: paymentRepo },
        {
          provide: getRepositoryToken(OrderStatusEvent),
          useValue: { find: jest.fn(async (): Promise<unknown[]> => []) },
        },
        {
          provide: getRepositoryToken(DeliveryLeg),
          useValue: { find: jest.fn(async (): Promise<unknown[]> => []) },
        },
        { provide: getRepositoryToken(OrderAccessToken), useValue: accessTokenRepo },
        { provide: CatalogueService, useValue: catalogueService },
        { provide: InventoryService, useValue: inventoryService },
        { provide: PermissionsService, useValue: permissionsService },
        { provide: UsersService, useValue: usersService },
        { provide: PaystackService, useValue: paystackService },
        { provide: WholesaleService, useValue: wholesaleService },
        { provide: AccountingService, useValue: { record: jest.fn() } },
        { provide: NotificationsService, useValue: { onOrderStatusChange: jest.fn() } },
        { provide: OrderStatusBus, useValue: { publish: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn(() => '') } },
        { provide: getDataSourceToken(), useValue: { transaction: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(OrdersService);
  });

  // ---- the happy path ----

  it('creates a retail order with no account, holding the guest contact', async () => {
    const created = await service.create(
      order({ guest: GUEST, shippingAddress: SHIP_TO, source: 'storefront' }),
    );
    expect(created.channel).toBe(OrderChannel.RETAIL);
    expect(created.customer).toBeNull();
    expect(created.guestName).toBe('Ada Obi');
    expect(created.guestEmail).toBe('ada@example.com');
    expect(created.claimedAt).toBeNull();
    expect(created.totalAmount).toBe(9000);
  });

  it('prices a guest order from the catalogue, exactly as an account order', async () => {
    const asGuest = await service.create(order({ guest: GUEST, shippingAddress: SHIP_TO }));
    const asCustomer = await service.create(order({ shippingAddress: SHIP_TO }), customer);
    expect(asGuest.totalAmount).toBe(asCustomer.totalAmount);
    expect(asGuest.items[0].unitPrice).toBe(asCustomer.items[0].unitPrice);
  });

  it('applies the same stock gate to a guest as to a customer', async () => {
    inventoryService.currentQuantity.mockResolvedValueOnce(0);
    await expect(service.create(order({ guest: GUEST, shippingAddress: SHIP_TO }))).rejects.toThrow(
      'Insufficient stock',
    );
  });

  // ---- what a guest may not do ----

  it('refuses an unauthenticated order with no guest details', async () => {
    await expect(service.create(order({ shippingAddress: SHIP_TO }))).rejects.toThrow(
      BadRequestException,
    );
    expect(orderRepo.save).not.toHaveBeenCalled();
  });

  it('refuses a guest order with no shipping address', async () => {
    await expect(service.create(order({ guest: GUEST }))).rejects.toThrow('shippingAddress');
    expect(orderRepo.save).not.toHaveBeenCalled();
  });

  it('refuses a guest order that asks for a non-retail channel', async () => {
    await expect(
      service.create(
        order({ guest: GUEST, shippingAddress: SHIP_TO, channel: OrderChannel.WHOLESALE }),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('refuses a guest order that tries to attach itself to an account', async () => {
    await expect(
      service.create(order({ guest: GUEST, shippingAddress: SHIP_TO, customerId: 'c1' })),
    ).rejects.toThrow(ForbiddenException);
  });

  // ---- authenticated ordering is unchanged ----

  it('an authenticated retail order still requires a shipping address', async () => {
    await expect(service.create(order({}), customer)).rejects.toThrow('shippingAddress');
  });

  it('an authenticated order ignores any guest block and stays owned by the account', async () => {
    const created = await service.create(
      order({ guest: GUEST, shippingAddress: SHIP_TO }),
      customer,
    );
    expect(created.customer).toEqual({ id: 'c1' });
    expect(created.guestEmail).toBeNull();
    expect(created.guestName).toBeNull();
  });

  it('a staff in-store order still needs no shipping address', async () => {
    permissionsService.getAccessLevel.mockResolvedValue(AccessLevel.FULL);
    const staff: AuthenticatedUser = {
      id: 's1',
      email: 'sales@seentair.test',
      role: RoleName.SALES,
    };
    const created = await service.create(order({ channel: OrderChannel.IN_STORE }), staff);
    expect(created.channel).toBe(OrderChannel.IN_STORE);
    expect(created.shippingAddress).toBeNull();
  });

  // ---- tracking without an account ----

  describe('tracking token', () => {
    const tokenRow = (
      orderId: string,
      raw: string,
      expiresAt = new Date(Date.now() + 86_400_000),
    ) =>
      ({
        id: 't1',
        orderId,
        tokenHash: createHash('sha256').update(raw).digest('hex'),
        expiresAt,
      }) as never;

    it('mints a token for a guest order and returns the raw value exactly once', async () => {
      const created = await service.create(order({ guest: GUEST, shippingAddress: SHIP_TO }));
      expect(created.trackingToken).toMatch(/^[0-9a-f]{64}$/);
      // Only the hash is persisted — the raw token is never written down.
      const saved = accessTokenRepo.save.mock.calls[0][0] as { tokenHash: string };
      expect(saved.tokenHash).toBe(
        createHash('sha256').update(created.trackingToken!).digest('hex'),
      );
      expect(saved.tokenHash).not.toBe(created.trackingToken);
    });

    it('mints no token for an account order', async () => {
      const created = await service.create(order({ shippingAddress: SHIP_TO }), customer);
      expect(created.trackingToken).toBeUndefined();
      expect(accessTokenRepo.save).not.toHaveBeenCalled();
    });

    it('opens the order for a valid token, in the customer shape', async () => {
      accessTokenRepo.findOne.mockResolvedValueOnce(tokenRow('o1', 'good-token'));
      orderRepo.findOne.mockResolvedValueOnce({
        id: 'o1',
        status: OrderStatus.STOCK_EXCEPTION,
        deliveredAt: null,
        items: [],
      });
      const result = await service.tracking('o1', undefined, 'good-token');
      // A guest sees the customer projection: the internal stock exception is
      // reported as ORDER_RECEIVED, and staff-authored notes never appear.
      expect(result.status).toBe(OrderStatus.ORDER_RECEIVED);
      expect(result.events).toEqual([]);
    });

    it('a token for another order is a 404, not a 403', async () => {
      accessTokenRepo.findOne.mockResolvedValueOnce(tokenRow('other-order', 'good-token'));
      await expect(service.tracking('o1', undefined, 'good-token')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('an expired token is a 404', async () => {
      accessTokenRepo.findOne.mockResolvedValueOnce(
        tokenRow('o1', 'stale', new Date(Date.now() - 1000)),
      );
      await expect(service.tracking('o1', undefined, 'stale')).rejects.toThrow(NotFoundException);
    });

    it('an unknown token is a 404', async () => {
      accessTokenRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.tracking('o1', undefined, 'nope')).rejects.toThrow(NotFoundException);
    });

    it('no token and no session is a 404, never a listing of the order', async () => {
      await expect(service.tracking('o1')).rejects.toThrow(NotFoundException);
      expect(orderRepo.findOne).not.toHaveBeenCalled();
    });
  });

  // ---- claiming a guest order onto an account ----

  describe('claimGuestOrders', () => {
    it('attaches only unclaimed orders matching the address, normalised', async () => {
      orderRepo.update.mockResolvedValueOnce({ affected: 2 });
      const claimed = await service.claimGuestOrders('u1', '  Ada@Example.COM ');
      expect(claimed).toBe(2);
      expect(orderRepo.update).toHaveBeenCalledWith(
        // Only rows still unclaimed: re-verifying cannot take an order back
        // from whoever claimed it first.
        { guestEmail: 'ada@example.com', claimedAt: expect.anything() },
        { customer: { id: 'u1' }, claimedAt: expect.any(Date) },
      );
    });

    it('reports zero when the address placed no guest orders', async () => {
      orderRepo.update.mockResolvedValueOnce({ affected: 0 });
      expect(await service.claimGuestOrders('u1', 'nobody@example.com')).toBe(0);
    });
  });

  // ---- paying without an account ----

  describe('paying a guest order', () => {
    const guestOrder = (over: Record<string, unknown> = {}) =>
      ({
        id: 'o1',
        customer: null,
        guestEmail: 'ada@example.com',
        guestName: 'Ada Obi',
        paymentStatus: PaymentStatus.UNPAID,
        totalAmount: 18000,
        items: [],
        ...over,
      }) as never;

    const hashOf = (raw: string) => createHash('sha256').update(raw).digest('hex');

    it('starts a Paystack session for a guest holding the order token', async () => {
      // The token is the only thing that authorises this call: there is no
      // session, which is exactly how the storefront pays straight after placing
      // an order as a guest.
      accessTokenRepo.findOne.mockResolvedValueOnce({
        id: 't1',
        orderId: 'o1',
        tokenHash: hashOf('good-token'),
        expiresAt: new Date(Date.now() + 86_400_000),
      });
      orderRepo.findOne.mockResolvedValueOnce(guestOrder());

      const result = await service.initPaystackPayment('o1', undefined, undefined, 'good-token');

      expect(paystackService.initializeTransaction).toHaveBeenCalledWith(
        // No account on the order, so the guest address placed with it is billed.
        'ada@example.com',
        18000,
        expect.stringMatching(/^seentair-o1-[0-9a-f]{8}$/),
        // No callback base configured in this stub, so no redirect is promised.
        null,
      );
      expect(result.authorizationUrl).toBe('https://checkout.test/xyz');
      expect(paymentRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          method: PaymentMethod.PAYSTACK,
          amount: 18000,
          status: PaymentRecordStatus.PENDING,
          recordedBy: null,
        }),
      );
    });

    it('refuses a guest payment with no token and no session', async () => {
      // No token means no proof of ownership, and the order id is not enough:
      // findById throws before any order is loaded.
      await expect(service.initPaystackPayment('o1')).rejects.toThrow(NotFoundException);
      expect(paystackService.initializeTransaction).not.toHaveBeenCalled();
      expect(paymentRepo.save).not.toHaveBeenCalled();
    });

    it('refuses a token minted for a different order', async () => {
      accessTokenRepo.findOne.mockResolvedValueOnce({
        id: 't1',
        orderId: 'other-order',
        tokenHash: hashOf('good-token'),
        expiresAt: new Date(Date.now() + 86_400_000),
      });
      await expect(
        service.initPaystackPayment('o1', undefined, undefined, 'good-token'),
      ).rejects.toThrow(NotFoundException);
      expect(paystackService.initializeTransaction).not.toHaveBeenCalled();
    });

    it('refuses an expired token', async () => {
      accessTokenRepo.findOne.mockResolvedValueOnce({
        id: 't1',
        orderId: 'o1',
        tokenHash: hashOf('stale'),
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(
        service.initPaystackPayment('o1', undefined, undefined, 'stale'),
      ).rejects.toThrow(NotFoundException);
    });

    it('still refuses part-payments, token or not', async () => {
      accessTokenRepo.findOne.mockResolvedValueOnce({
        id: 't1',
        orderId: 'o1',
        tokenHash: hashOf('good-token'),
        expiresAt: new Date(Date.now() + 86_400_000),
      });
      orderRepo.findOne.mockResolvedValueOnce(guestOrder({ totalAmount: 18000 }));
      // The full-payment rule is enforced on the order total, never on the
      // client's amount, so a token cannot be used to underpay.
      await expect(
        service.initPaystackPayment('o1', undefined, undefined, 'good-token'),
      ).resolves.toBeDefined();
      expect(paystackService.initializeTransaction).toHaveBeenCalledWith(
        'ada@example.com',
        18000,
        expect.any(String),
        null,
      );
    });

    it('an account holder still pays without presenting a token', async () => {
      orderRepo.findOne.mockResolvedValueOnce(
        guestOrder({ customer: { id: 'c1' }, guestEmail: null }),
      );
      const result = await service.initPaystackPayment('o1', customer);
      expect(paystackService.initializeTransaction).toHaveBeenCalledWith(
        'c@x.test',
        18000,
        expect.any(String),
        null,
      );
      expect(result.reference).toEqual(expect.any(String));
    });
  });
});
