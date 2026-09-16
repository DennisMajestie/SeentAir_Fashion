import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { AccessLevel, ModuleName, RoleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { CatalogueService } from '../catalogue/catalogue.service';
import { MovementType } from '../inventory/inventory-movement.entity';
import { InventoryService } from '../inventory/inventory.service';
import { PermissionsService } from '../users/permissions.service';
import { UsersService } from '../users/users.service';
import { OrderStatusEvent } from './entities/order-status-event.entity';
import { Order, OrderStatus, PaymentStatus } from './entities/order.entity';
import { Payment, PaymentMethod } from './entities/payment.entity';
import { OrdersService } from './orders.service';
import { PaystackService } from './paystack.service';
import { WholesaleService } from '../wholesale/wholesale.service';
import { AccountingService } from '../accounting/accounting.service';
import { NotificationsService } from '../notifications/notifications.service';

const finance: AuthenticatedUser = {
  id: 'fin-1',
  email: 'finance@seentair.test',
  role: RoleName.FINANCE_ACCOUNTING,
};

describe('OrdersService — payment rules', () => {
  let service: OrdersService;
  let order: Record<string, unknown>;

  const orderRepo = {
    findOne: jest.fn(async () => order),
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => v),
    findAndCount: jest.fn(async () => [[], 0]),
  };
  const paymentRepo = { findOne: jest.fn(), create: jest.fn((v) => v), save: jest.fn(async (v) => v) };
  const eventRepo = { create: jest.fn((v) => v), save: jest.fn(async (v) => v), find: jest.fn(async () => []) };
  const inventoryService = { record: jest.fn(), currentQuantity: jest.fn(async () => 100) };
  const permissionsService = {
    getAccessLevel: jest.fn(async (_role: RoleName, module: ModuleName) => {
      if (module === ModuleName.PAYMENTS) return AccessLevel.FULL;
      return AccessLevel.VIEW;
    }),
  };
  const repoByEntity = new Map<unknown, unknown>([
    [Order, orderRepo],
    [Payment, paymentRepo],
    [OrderStatusEvent, eventRepo],
  ]);
  const dataSource = {
    transaction: jest.fn(async (fn: (m: unknown) => Promise<unknown>) =>
      fn({ getRepository: (entity: unknown) => repoByEntity.get(entity) }),
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    order = {
      id: 'o1',
      totalAmount: 17000,
      paymentStatus: PaymentStatus.UNPAID,
      status: OrderStatus.AWAITING_PAYMENT,
      customer: { id: 'cust-1' },
      items: [{ variant: { id: 'v1' }, quantity: 2, unitPrice: 8500 }],
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Order), useValue: orderRepo },
        { provide: getRepositoryToken(Payment), useValue: paymentRepo },
        { provide: getRepositoryToken(OrderStatusEvent), useValue: eventRepo },
        { provide: CatalogueService, useValue: {} },
        { provide: InventoryService, useValue: inventoryService },
        { provide: PermissionsService, useValue: permissionsService },
        { provide: UsersService, useValue: {} },
        { provide: PaystackService, useValue: { configured: false } },
        {
          provide: WholesaleService,
          useValue: {
            moq: 20,
            assertApprovedAccount: jest.fn(),
            applyTierPrice: (p: number) => p,
          },
        },
        { provide: AccountingService, useValue: { record: jest.fn() } },
        {
          provide: NotificationsService,
          useValue: { onOrderStatusChange: jest.fn(async () => undefined) },
        },
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();
    service = moduleRef.get(OrdersService);
  });

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
    await service.recordOfflinePayment('o1', { method: PaymentMethod.CASH, amount: 17000 }, finance);
    expect(order.paymentStatus).toBe(PaymentStatus.PAID);
    expect(order.status).toBe(OrderStatus.ORDER_RECEIVED);
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
    order.paymentStatus = PaymentStatus.PAID;
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

  it('an unpaid order cannot progress through fulfilment statuses', async () => {
    permissionsService.getAccessLevel.mockResolvedValue(AccessLevel.FULL);
    order.paymentStatus = PaymentStatus.UNPAID;
    order.status = OrderStatus.AWAITING_PAYMENT;
    await expect(
      service.updateStatus('o1', OrderStatus.PROCESSING, undefined, finance),
    ).rejects.toThrow('fully paid');
  });

  it('status flow is forward-only', async () => {
    permissionsService.getAccessLevel.mockResolvedValue(AccessLevel.FULL);
    order.paymentStatus = PaymentStatus.PAID;
    order.status = OrderStatus.SHIPPED;
    await expect(
      service.updateStatus('o1', OrderStatus.PROCESSING, undefined, finance),
    ).rejects.toThrow(ConflictException);
  });

  it('RETURNED cannot be set directly (returns workflow owns it)', async () => {
    permissionsService.getAccessLevel.mockResolvedValue(AccessLevel.FULL);
    order.paymentStatus = PaymentStatus.PAID;
    await expect(
      service.updateStatus('o1', OrderStatus.RETURNED, undefined, finance),
    ).rejects.toThrow(BadRequestException);
  });

  it('DELIVERED stamps deliveredAt (anchor for reviews and the 12h return window)', async () => {
    permissionsService.getAccessLevel.mockResolvedValue(AccessLevel.FULL);
    order.paymentStatus = PaymentStatus.PAID;
    order.status = OrderStatus.SHIPPED;
    await service.updateStatus('o1', OrderStatus.DELIVERED, undefined, finance);
    expect(order.deliveredAt).toBeInstanceOf(Date);
  });
});
