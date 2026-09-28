import { DeliveryLeg, DeliveryLegStatus } from '../logistics/entities/delivery-leg.entity';
import { CustomerDeliveryLeg, toCustomerLeg } from './orders.service';

const leg = (over: Partial<DeliveryLeg> = {}): DeliveryLeg =>
  ({
    id: 'leg-1',
    legNumber: 1,
    carrier: 'gigl',
    status: DeliveryLegStatus.IN_TRANSIT,
    trackingRef: 'GIGL-8891',
    zone: 'Lagos-Ikeja',
    driverName: 'Ade',
    driverPhone: '+2348000000000',
    // Staff-only fields that must never reach a customer.
    cost: 4200,
    contents: [{ sku: 'SEEN-1', quantity: 2 }],
    createdBy: 'staff-1',
    checkpoints: [
      {
        zone: 'Ikeja depot',
        status: 'on_track',
        sealId: 'SEAL-77',
        note: 'Loaded',
        driverName: 'Ade',
        driverPhone: '+2348000000000',
        timestamp: '2026-09-28T07:00:00.000Z',
      },
    ],
    ...over,
  }) as DeliveryLeg;

describe('toCustomerLeg', () => {
  it('exposes the movement a customer actually waits on', () => {
    const out: CustomerDeliveryLeg = toCustomerLeg(leg());
    expect(out).toMatchObject({
      legNumber: 1,
      carrier: 'gigl',
      status: DeliveryLegStatus.IN_TRANSIT,
      trackingRef: 'GIGL-8891',
      zone: 'Lagos-Ikeja',
      driverName: 'Ade',
    });
    expect(out.checkpoints).toHaveLength(1);
    expect(out.checkpoints[0]).toEqual({
      zone: 'Ikeja depot',
      status: 'on_track',
      note: 'Loaded',
      at: '2026-09-28T07:00:00.000Z',
    });
  });

  it('keeps internal cost, consignment contents and driver phone staff-side', () => {
    const out = toCustomerLeg(leg()) as unknown as Record<string, unknown>;
    expect(out).not.toHaveProperty('cost');
    expect(out).not.toHaveProperty('contents');
    expect(out).not.toHaveProperty('driverPhone');
    expect(out).not.toHaveProperty('createdBy');
    expect(JSON.stringify(out)).not.toContain('SEAL-77');
    expect(JSON.stringify(out)).not.toContain('+2348000000000');
  });

  it('never leaks the eagerly-loaded order relation', () => {
    const out = toCustomerLeg(leg({ order: { customer: { email: 'leak@test' } } } as never));
    expect(JSON.stringify(out)).not.toContain('leak@test');
  });

  it('accepts the legacy "at" checkpoint key as well as "timestamp"', () => {
    const out = toCustomerLeg(
      leg({ checkpoints: [{ zone: 'Yaba', status: 'on_track', at: '2026-01-01T00:00:00.000Z' }] }),
    );
    expect(out.checkpoints[0].at).toBe('2026-01-01T00:00:00.000Z');
  });

  it('tolerates null or malformed checkpoints', () => {
    expect(toCustomerLeg(leg({ checkpoints: null })).checkpoints).toEqual([]);
    expect(toCustomerLeg(leg({ checkpoints: [null, 'x', 7] as never })).checkpoints).toEqual([]);
  });
});
