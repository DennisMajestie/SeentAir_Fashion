import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { AccessLevel, RoleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { CatalogueService } from '../catalogue/catalogue.service';
import { AvailabilityStatus } from '../catalogue/entities/product-variant.entity';
import { InventoryService } from '../inventory/inventory.service';
import { PermissionsService } from '../users/permissions.service';
import { UsersService } from '../users/users.service';
import { WholesaleService } from '../wholesale/wholesale.service';
import { AccountingService } from '../accounting/accounting.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OrderStatusEvent } from './entities/order-status-event.entity';
import { Order } from './entities/order.entity';
import { Payment } from './entities/payment.entity';
import { DeliveryLeg } from '../logistics/entities/delivery-leg.entity';
import { OrderStatusBus } from './order-status.bus';
import { OrdersService } from './orders.service';
import { PaystackService } from './paystack.service';

const wholesaler: AuthenticatedUser = {
  id: 'wh-1',
  email: 'wholesaler@seentair.test',
  role: RoleName.WHOLESALER,
};

describe('OrdersService — wholesale rules', () => {
  let service: OrdersService;

  const orderRepo = {
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => ({ id: 'o-new', ...v })),
    findOne: jest.fn(),
    findAndCount: jest.fn(async () => [[], 0]),
  };
  const variant = {
    id: 'v1',
    sku: 'TEE-BLK-M',
    priceOverride: null,
    availabilityStatus: AvailabilityStatus.IN_STOCK,
    product: { basePrice: 9000 },
  };
  const catalogueService = { findVariantById: jest.fn(async () => variant) };
  const inventoryService = { currentQuantity: jest.fn(async () => 1000), record: jest.fn() };
  const permissionsService = { getAccessLevel: jest.fn(async () => AccessLevel.OWN) };
  const usersService = { findById: jest.fn(async (id: string) => ({ id })) };
  const wholesaleService = {
    moq: 20,
    assertApprovedAccount: jest.fn(async () => ({ tier: { discountPercent: 15 } })),
    applyTierPrice: (p: number, tier: { discountPercent: number } | null) =>
      Math.round(p * (100 - (tier?.discountPercent ?? 0))) / 100,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // `variant` is a shared object the made-to-order tests mutate; clearAllMocks
    // does not restore it, so a leaked made_to_order would silently disable the
    // stock gate for every test that follows.
    variant.availabilityStatus = AvailabilityStatus.IN_STOCK;
    inventoryService.currentQuantity.mockResolvedValue(1000);
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Order), useValue: orderRepo },
        { provide: getRepositoryToken(Payment), useValue: {} },
        { provide: getRepositoryToken(OrderStatusEvent), useValue: {} },
        { provide: getRepositoryToken(DeliveryLeg), useValue: {} },
        { provide: OrderStatusBus, useValue: new OrderStatusBus() },
        { provide: CatalogueService, useValue: catalogueService },
        { provide: InventoryService, useValue: inventoryService },
        { provide: PermissionsService, useValue: permissionsService },
        { provide: UsersService, useValue: usersService },
        { provide: PaystackService, useValue: { configured: false } },
        { provide: WholesaleService, useValue: wholesaleService },
        { provide: AccountingService, useValue: { record: jest.fn() } },
        {
          provide: NotificationsService,
          useValue: { onOrderStatusChange: jest.fn(async () => undefined) },
        },
        { provide: ConfigService, useValue: { get: jest.fn(() => true) } },
        { provide: getDataSourceToken(), useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(OrdersService);
  });

  it('rejects a wholesale order below the MOQ (20 units)', async () => {
    await expect(
      service.create({ items: [{ variantId: 'v1', quantity: 19 }] }, wholesaler),
    ).rejects.toThrow('MOQ');
    expect(orderRepo.save).not.toHaveBeenCalled();
  });

  it('rejects a wholesaler without an approved account', async () => {
    wholesaleService.assertApprovedAccount.mockRejectedValueOnce(
      new ForbiddenException('approved wholesale account required'),
    );
    await expect(
      service.create({ items: [{ variantId: 'v1', quantity: 25 }] }, wholesaler),
    ).rejects.toThrow(ForbiddenException);
  });

  it('applies the tier discount to wholesale order prices', async () => {
    const order = await service.create({ items: [{ variantId: 'v1', quantity: 20 }] }, wholesaler);
    // 9000 retail at 15% off → 7650; 20 units → 153000.
    expect(order.items[0].unitPrice).toBe(7650);
    expect(order.totalAmount).toBe(153000);
    expect(order.channel).toBe('wholesale');
  });

  it('MOQ counts total units across items, not per line', async () => {
    const order = await service.create(
      {
        items: [
          { variantId: 'v1', quantity: 12 },
          { variantId: 'v1', quantity: 8 },
        ],
      },
      wholesaler,
    );
    expect(order.totalAmount).toBe(153000);
  });

  it('retail customers are unaffected by wholesale gates', async () => {
    const customer: AuthenticatedUser = { id: 'c1', email: 'c@x.test', role: RoleName.CUSTOMER };
    const order = await service.create({ items: [{ variantId: 'v1', quantity: 1 }] }, customer);
    expect(wholesaleService.assertApprovedAccount).not.toHaveBeenCalled();
    expect(order.items[0].unitPrice).toBe(9000);
    expect(order.channel).toBe('retail');
  });

  it('a wholesaler-role account ordering from the retail storefront gets a retail order', async () => {
    const order = await service.create(
      { items: [{ variantId: 'v1', quantity: 1 }], source: 'storefront' },
      wholesaler,
    );
    expect(wholesaleService.assertApprovedAccount).not.toHaveBeenCalled();
    expect(order.channel).toBe('retail');
    expect(order.items[0].unitPrice).toBe(9000);
    expect(order.totalAmount).toBe(9000);
  });

  it('the wholesale portal still gates a wholesaler-role account', async () => {
    wholesaleService.assertApprovedAccount.mockRejectedValueOnce(
      new ForbiddenException('approved wholesale account required'),
    );
    await expect(
      service.create(
        { items: [{ variantId: 'v1', quantity: 25 }], source: 'wholesale_portal' },
        wholesaler,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it(
    BadRequestException.name + ': over-stock wholesale orders still fail the stock check',
    async () => {
      inventoryService.currentQuantity.mockResolvedValueOnce(10);
      await expect(
        service.create({ items: [{ variantId: 'v1', quantity: 25 }] }, wholesaler),
      ).rejects.toThrow('Insufficient stock');
    },
  );

  describe('made-to-order variants', () => {
    // The bespoke suit seeds stock 0 + made_to_order and the storefront still
    // offers it with a 3-week lead time. The stock gate used to reject it, so a
    // made-to-order item could never be bought at all.
    const customer: AuthenticatedUser = { id: 'c1', email: 'c@x.test', role: RoleName.CUSTOMER };

    beforeEach(() => {
      variant.availabilityStatus = AvailabilityStatus.MADE_TO_ORDER;
      inventoryService.currentQuantity.mockResolvedValue(0);
    });

    it('accepts a made-to-order line with zero stock on the shelf', async () => {
      // Reproduces the reported storefront failure: 2 bespoke suits, SKU
      // seeded at stock 0, was rejected with "0 available, 2 requested".
      const order = await service.create({ items: [{ variantId: 'v1', quantity: 2 }] }, customer);
      expect(order.items[0].quantity).toBe(2);
      expect(order.totalAmount).toBe(18000);
    });

    it('does not even query stock for a made-to-order line', async () => {
      await service.create({ items: [{ variantId: 'v1', quantity: 2 }] }, customer);
      expect(inventoryService.currentQuantity).not.toHaveBeenCalled();
    });

    it('still enforces the MOQ on made-to-order units', async () => {
      await expect(
        service.create({ items: [{ variantId: 'v1', quantity: 5 }] }, wholesaler),
      ).rejects.toThrow('MOQ');
    });

    it('still prices made-to-order lines at the tier price for wholesale', async () => {
      const order = await service.create(
        { items: [{ variantId: 'v1', quantity: 20 }] },
        wholesaler,
      );
      // Tier pricing still applies; only the stock gate is skipped.
      expect(order.items[0].unitPrice).toBe(7650);
    });
  });

  it('an out_of_stock variant is still refused', async () => {
    // Quantity must clear the MOQ (20) first, otherwise this asserts the MOQ
    // gate rather than the stock gate.
    variant.availabilityStatus = AvailabilityStatus.OUT_OF_STOCK;
    inventoryService.currentQuantity.mockResolvedValue(0);
    await expect(
      service.create({ items: [{ variantId: 'v1', quantity: 20 }] }, wholesaler),
    ).rejects.toThrow('Insufficient stock');
  });

  it('an in_stock variant is still refused when the shelf is short', async () => {
    variant.availabilityStatus = AvailabilityStatus.IN_STOCK;
    inventoryService.currentQuantity.mockResolvedValue(1);
    await expect(
      service.create({ items: [{ variantId: 'v1', quantity: 20 }] }, wholesaler),
    ).rejects.toThrow('Insufficient stock');
  });

  it('a retail customer buying an out_of_stock variant is refused too', async () => {
    const customer: AuthenticatedUser = { id: 'c1', email: 'c@x.test', role: RoleName.CUSTOMER };
    variant.availabilityStatus = AvailabilityStatus.OUT_OF_STOCK;
    inventoryService.currentQuantity.mockResolvedValue(0);
    await expect(
      service.create({ items: [{ variantId: 'v1', quantity: 1 }] }, customer),
    ).rejects.toThrow('Insufficient stock');
  });
});
