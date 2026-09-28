import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AccessLevel, RoleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { OrderStatusBus } from '../orders/order-status.bus';
import { PermissionsService } from '../users/permissions.service';
import { GiglAdapter } from './carriers/gigl.adapter';
import { ManualCarrierAdapter } from './carriers/manual.adapter';
import { DeliveryLeg, DeliveryLegStatus } from './entities/delivery-leg.entity';
import { DeliveryPricing } from './entities/delivery-pricing.entity';
import { Order } from '../orders/entities/order.entity';
import { LogisticsService } from './logistics.service';

/**
 * The ops dashboard (logistics.page.ts, dashboard.page.ts) reads GET /deliveries,
 * not the customer-facing tracking projection. Splitting the tracking audience
 * must not have narrowed this path, so the staff shape it depends on is pinned
 * here: corridor checkpoints with their zone, note and seal id, plus driver
 * contact and cost.
 */
describe('LogisticsService — staff delivery shape', () => {
  let service: LogisticsService;

  const fullLeg = {
    id: 'leg-1',
    legNumber: 1,
    carrier: 'gigl',
    status: DeliveryLegStatus.IN_TRANSIT,
    trackingRef: 'GIGL-8891',
    zone: 'Lagos-Ikeja',
    driverName: 'Ade Okafor',
    driverPhone: '+2348000000000',
    cost: 4200,
    contents: [{ sku: 'SEEN-1', quantity: 2 }],
    createdBy: 'staff-1',
    // tracking() re-reads every leg of the same order, so the relation is needed.
    order: { id: 'order-1', customer: { id: 'cust-1' } },
    checkpoints: [
      {
        zone: 'Ikeja depot',
        status: 'on_track',
        note: 'INTERNAL-NOTE-driver-swapped',
        sealId: 'SEAL-77',
        driverName: 'Ade Okafor',
        driverPhone: '+2348000000000',
        timestamp: '2026-09-28T07:00:00.000Z',
      },
    ],
  };

  const legRepo = {
    findAndCount: jest.fn(async () => [[fullLeg], 1]),
    findOne: jest.fn(async () => fullLeg),
    find: jest.fn(async () => [fullLeg]),
    save: jest.fn(async (v: unknown) => v),
    create: jest.fn((v: unknown) => v),
  };

  const staff: AuthenticatedUser = {
    id: 'staff-1',
    email: 'ops@seentair.test',
    role: RoleName.BUSINESS_OWNER_ADMIN,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        LogisticsService,
        { provide: getRepositoryToken(DeliveryLeg), useValue: legRepo },
        { provide: getRepositoryToken(DeliveryPricing), useValue: {} },
        { provide: getRepositoryToken(Order), useValue: {} },
        {
          provide: PermissionsService,
          useValue: { getAccessLevel: jest.fn(async () => AccessLevel.VIEW) },
        },
        { provide: OrderStatusBus, useValue: new OrderStatusBus() },
        { provide: GiglAdapter, useValue: { key: 'gigl', createShipment: jest.fn() } },
        { provide: ManualCarrierAdapter, useValue: { key: 'manual', createShipment: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(LogisticsService);
  });

  it('returns the full corridor detail the ops dashboard renders', async () => {
    const { data } = await service.findAll();
    const leg = data[0];
    expect(leg.driverName).toBe('Ade Okafor');
    expect(leg.driverPhone).toBe('+2348000000000');
    expect(leg.zone).toBe('Lagos-Ikeja');
    expect(leg.cost).toBe(4200);
    expect(leg.contents).toEqual([{ sku: 'SEEN-1', quantity: 2 }]);
  });

  it('keeps checkpoint zone, note and seal id intact for staff', async () => {
    const { data } = await service.findAll();
    const cp = (data[0].checkpoints as unknown as Array<Record<string, unknown>>)[0];
    expect(cp['zone']).toBe('Ikeja depot');
    expect(cp['note']).toBe('INTERNAL-NOTE-driver-swapped');
    expect(cp['sealId']).toBe('SEAL-77');
    expect(cp['driverName']).toBe('Ade Okafor');
  });

  it('serialises with the internal note still present (no narrowing applied)', async () => {
    const { data } = await service.findAll();
    expect(JSON.stringify(data)).toContain('INTERNAL-NOTE-driver-swapped');
    expect(JSON.stringify(data)).toContain('SEAL-77');
  });

  it('serves a staff caller the full leg through the logistics tracking route', async () => {
    const legs = await service.tracking('leg-1', staff);
    const json = JSON.stringify(legs);
    expect(json).toContain('INTERNAL-NOTE-driver-swapped');
    expect(json).toContain('SEAL-77');
    expect(json).toContain('Okafor');
  });

  it('still refuses a caller with no logistics access', async () => {
    // Access is checked inside the service; a NONE grant must throw.
    const moduleRef = await Test.createTestingModule({
      providers: [
        LogisticsService,
        { provide: getRepositoryToken(DeliveryLeg), useValue: legRepo },
        { provide: getRepositoryToken(DeliveryPricing), useValue: {} },
        { provide: getRepositoryToken(Order), useValue: {} },
        {
          provide: PermissionsService,
          useValue: { getAccessLevel: jest.fn(async () => AccessLevel.NONE) },
        },
        { provide: OrderStatusBus, useValue: new OrderStatusBus() },
        { provide: GiglAdapter, useValue: { key: 'gigl', createShipment: jest.fn() } },
        { provide: ManualCarrierAdapter, useValue: { key: 'manual', createShipment: jest.fn() } },
      ],
    }).compile();
    const svc = moduleRef.get(LogisticsService);
    await expect(svc.tracking('leg-1', staff)).rejects.toThrow('No logistics access');
  });
});
