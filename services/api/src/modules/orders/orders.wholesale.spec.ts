import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { AccessLevel, RoleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { CatalogueService } from '../catalogue/catalogue.service';
import { InventoryService } from '../inventory/inventory.service';
import { PermissionsService } from '../users/permissions.service';
import { UsersService } from '../users/users.service';
import { WholesaleService } from '../wholesale/wholesale.service';
import { AccountingService } from '../accounting/accounting.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OrderStatusEvent } from './entities/order-status-event.entity';
import { Order } from './entities/order.entity';
import { Payment } from './entities/payment.entity';
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
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Order), useValue: orderRepo },
        { provide: getRepositoryToken(Payment), useValue: {} },
        { provide: getRepositoryToken(OrderStatusEvent), useValue: {} },
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
    const order = await service.create(
      { items: [{ variantId: 'v1', quantity: 20 }] },
      wholesaler,
    );
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

  it(BadRequestException.name + ': over-stock wholesale orders still fail the stock check', async () => {
    inventoryService.currentQuantity.mockResolvedValueOnce(10);
    await expect(
      service.create({ items: [{ variantId: 'v1', quantity: 25 }] }, wholesaler),
    ).rejects.toThrow('Insufficient stock');
  });
});
