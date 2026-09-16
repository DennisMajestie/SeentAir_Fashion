import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { RoleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { MovementType } from '../inventory/inventory-movement.entity';
import { InventoryService } from '../inventory/inventory.service';
import { Order, OrderChannel, OrderStatus } from '../orders/entities/order.entity';
import { PermissionsService } from '../users/permissions.service';
import { ReturnRequest, ReturnStatus } from './return-request.entity';
import { ReturnsService } from './returns.service';

const customer: AuthenticatedUser = { id: 'c1', email: 'c@x.test', role: RoleName.CUSTOMER };
const staff: AuthenticatedUser = { id: 's1', email: 's@x.test', role: RoleName.SALES };
const HOURS = 3_600_000;

describe('ReturnsService', () => {
  let service: ReturnsService;
  let order: Record<string, unknown>;
  let request: Record<string, unknown> | null;

  const returnRepo = {
    findOne: jest.fn(async () => null as unknown),
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => v),
    findAndCount: jest.fn(async () => [[], 0]),
  };
  const orderRepo = { findOne: jest.fn(async () => order), save: jest.fn(async (v) => v) };
  const eventRepoLike = { create: jest.fn((v) => v), save: jest.fn(async (v) => v) };
  const inventoryService = { record: jest.fn() };
  const managerRepos = new Map<string, unknown>();
  const dataSource = {
    transaction: jest.fn(async (fn: (m: unknown) => Promise<unknown>) =>
      fn({
        getRepository: (entity: { name?: string }) => {
          if (entity === ReturnRequest) return returnRepo;
          if (entity === Order) return orderRepo;
          return eventRepoLike;
        },
      }),
    ),
  };
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'returns.requestWindowHours') return 12;
      if (key === 'returns.completionWindowHours') return 24;
      return undefined;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    void managerRepos;
    request = null;
    order = {
      id: 'o1',
      channel: OrderChannel.RETAIL,
      status: OrderStatus.DELIVERED,
      deliveredAt: new Date(Date.now() - 2 * HOURS), // delivered 2h ago
      customer: { id: 'c1' },
      items: [{ variant: { id: 'v1' }, quantity: 2, unitPrice: 9000 }],
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReturnsService,
        { provide: getRepositoryToken(ReturnRequest), useValue: returnRepo },
        { provide: getRepositoryToken(Order), useValue: orderRepo },
        { provide: InventoryService, useValue: inventoryService },
        { provide: PermissionsService, useValue: { getAccessLevel: jest.fn() } },
        { provide: ConfigService, useValue: config },
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();
    service = moduleRef.get(ReturnsService);
  });

  const dto = { orderId: 'o1', variantId: 'v1', reason: 'wrong size' };

  it('accepts a return requested within 12 hours of delivery', async () => {
    const result = await service.create(dto, customer);
    expect(result).toEqual(expect.objectContaining({ status: ReturnStatus.REQUESTED }));
    // Completion deadline = requestedAt + 24h.
    const deadline = (result as { returnDeadline: Date }).returnDeadline;
    expect(deadline.getTime()).toBeGreaterThan(Date.now() + 23 * HOURS);
  });

  it('rejects a return after the 12-hour window', async () => {
    order.deliveredAt = new Date(Date.now() - 13 * HOURS);
    await expect(service.create(dto, customer)).rejects.toThrow('Return window closed');
  });

  it('custom/special orders cannot be returned', async () => {
    order.channel = OrderChannel.CUSTOM;
    await expect(service.create(dto, customer)).rejects.toThrow(
      'Custom/special design orders cannot be returned',
    );
  });

  it('only the ordering customer can request', async () => {
    await expect(service.create(dto, staff)).rejects.toThrow(ForbiddenException);
  });

  it('undelivered orders cannot be returned', async () => {
    order.status = OrderStatus.SHIPPED;
    order.deliveredAt = null;
    await expect(service.create(dto, customer)).rejects.toThrow(BadRequestException);
  });

  it('cannot return more than was ordered', async () => {
    await expect(service.create({ ...dto, quantity: 5 }, customer)).rejects.toThrow(
      'only 2 were ordered',
    );
  });

  describe('resolve', () => {
    beforeEach(() => {
      request = {
        id: 'r1',
        status: ReturnStatus.REQUESTED,
        quantity: 2,
        variant: { id: 'v1' },
        order,
        trackingNumber: null,
      };
      returnRepo.findOne.mockResolvedValue(request);
    });

    it('restocked returns write a RETURN ledger movement and mark the order RETURNED', async () => {
      await service.resolve('r1', { decision: 'resolved', resolution: 'refunded', restocked: true }, staff);
      expect(inventoryService.record).toHaveBeenCalledWith(
        expect.objectContaining({ movementType: MovementType.RETURN, quantityDelta: 2 }),
        expect.anything(),
      );
      expect(order.status).toBe(OrderStatus.RETURNED);
    });

    it('damaged returns write NO stock movement', async () => {
      await service.resolve('r1', { decision: 'resolved', resolution: 'refunded', damaged: true }, staff);
      expect(inventoryService.record).not.toHaveBeenCalled();
    });

    it('exactly one of restocked/damaged is required', async () => {
      await expect(
        service.resolve('r1', { decision: 'resolved', resolution: 'x' }, staff),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.resolve(
          'r1',
          { decision: 'resolved', resolution: 'x', restocked: true, damaged: true },
          staff,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('a settled return cannot be re-resolved', async () => {
      (request as { status: ReturnStatus }).status = ReturnStatus.RESOLVED;
      await expect(
        service.resolve('r1', { decision: 'resolved', resolution: 'x', restocked: true }, staff),
      ).rejects.toThrow(ConflictException);
    });
  });
});
