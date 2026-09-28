import { DeliveryLeg, DeliveryLegStatus } from '../logistics/entities/delivery-leg.entity';
import { CustomerDeliveryLeg, StaffDeliveryLeg, toCustomerLeg, toStaffLeg } from './orders.service';

/**
 * Sentinel values that must never appear in a customer payload. The whole point
 * of the audience split is that staff-authored corridor detail stays staff-side,
 * so the assertions below are on the serialised string, not on key presence:
 * a field that is present-but-null would still leak through a naive UI.
 */
const SEEDED_NOTE = 'INTERNAL-NOTE-driver-swapped-do-not-tell-customer';
const SEEDED_ZONE = 'INTERNAL-ZONE-DEPOT-7';
const SEEDED_DRIVER = 'Ade Okafor';
const SEEDED_SURNAME = 'Okafor';

const leg = (over: Partial<DeliveryLeg> = {}): DeliveryLeg =>
  ({
    id: 'leg-1',
    legNumber: 1,
    carrier: 'gigl',
    status: DeliveryLegStatus.IN_TRANSIT,
    trackingRef: 'GIGL-8891',
    zone: SEEDED_ZONE,
    driverName: SEEDED_DRIVER,
    driverPhone: '+2348000000000',
    // Staff-only fields that must never reach a customer.
    cost: 4200,
    contents: [{ sku: 'SEEN-1', quantity: 2 }],
    createdBy: 'staff-1',
    checkpoints: [
      {
        zone: SEEDED_ZONE,
        status: 'on_track',
        sealId: 'SEAL-77',
        note: SEEDED_NOTE,
        driverName: SEEDED_DRIVER,
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
      driverName: 'Ade',
    });
    expect(out.checkpoints).toEqual([{ status: 'on_track', at: '2026-09-28T07:00:00.000Z' }]);
  });

  it('reduces a full driver name to a first name', () => {
    expect(toCustomerLeg(leg()).driverName).toBe('Ade');
  });

  it('serialises to a payload containing none of the seeded internal values', () => {
    // Requirement: assert on the raw string, so a present-but-null field or a
    // nested leak would still fail this.
    const json = JSON.stringify(toCustomerLeg(leg()));
    expect(json).not.toContain(SEEDED_NOTE);
    expect(json).not.toContain(SEEDED_ZONE);
    expect(json).not.toContain(SEEDED_SURNAME);
    expect(json).not.toContain('Okafor');
    // and the internal fields staff rely on
    expect(json).not.toContain('SEAL-77');
    expect(json).not.toContain('+2348000000000');
    expect(json).not.toContain('4200');
    expect(json).not.toContain('SEEN-1');
    expect(json).not.toContain('staff-1');
  });

  it('has no zone or note keys at all on a checkpoint', () => {
    const cp = toCustomerLeg(leg()).checkpoints[0];
    expect(Object.keys(cp).sort()).toEqual(['at', 'status']);
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

  it('handles a null driver name', () => {
    expect(toCustomerLeg(leg({ driverName: null })).driverName).toBeNull();
    expect(toCustomerLeg(leg({ driverName: '   ' })).driverName).toBeNull();
  });
});

describe('toStaffLeg', () => {
  it('keeps the full corridor detail ops needs', () => {
    const out: StaffDeliveryLeg = toStaffLeg(leg());
    expect(out.driverName).toBe(SEEDED_DRIVER); // full name, not reduced
    expect(out.driverPhone).toBe('+2348000000000');
    expect(out.zone).toBe(SEEDED_ZONE);
    expect(out.cost).toBe(4200);
    expect(out.contents).toEqual([{ sku: 'SEEN-1', quantity: 2 }]);
    expect(out.createdBy).toBe('staff-1');
    expect(out.checkpoints[0]).toMatchObject({
      zone: SEEDED_ZONE,
      status: 'on_track',
      note: SEEDED_NOTE,
      sealId: 'SEAL-77',
      driverName: SEEDED_DRIVER,
    });
  });

  it('carries the same status, ref and leg number as the customer view', () => {
    const c = toCustomerLeg(leg());
    const s = toStaffLeg(leg());
    expect(s.status).toBe(c.status);
    expect(s.trackingRef).toBe(c.trackingRef);
    expect(s.legNumber).toBe(c.legNumber);
  });
});
