import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { LoyaltyAccount } from './loyalty-account.entity';
import { LoyaltyEntry, LoyaltyEntryReason } from './loyalty-entry.entity';
import { LoyaltyService } from './loyalty.service';

describe('LoyaltyService', () => {
  let service: LoyaltyService;
  const accounts = {
    findOne: jest.fn(async () => null as unknown),
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => ({ ...v, id: 'a1' })),
    increment: jest.fn(async () => undefined),
    find: jest.fn(async () => []),
    manager: {} as EntityManager,
  };
  const entries = {
    findOne: jest.fn(async () => null as unknown),
    find: jest.fn(async () => []),
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => v),
  };
  const manager = {
    getRepository: jest.fn((entity: unknown) =>
      entity === LoyaltyAccount ? accounts : entries,
    ),
  } as unknown as EntityManager;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        LoyaltyService,
        { provide: getRepositoryToken(LoyaltyAccount), useValue: accounts },
        { provide: getRepositoryToken(LoyaltyEntry), useValue: entries },
      ],
    }).compile();
    service = moduleRef.get(LoyaltyService);
  });

  it('awards one point per N1,000 on a delivered customer order', async () => {
    await service.awardForDeliveredOrder(manager, {
      id: 'o1',
      totalAmount: 24500,
      customer: { id: 'u1' },
    } as never);

    expect(entries.findOne).toHaveBeenCalledWith({
      where: { orderId: 'o1', reason: LoyaltyEntryReason.ORDER_DELIVERED },
    });
    expect(accounts.increment).toHaveBeenCalledWith({ id: 'a1' }, 'points', 24);
    expect(accounts.increment).toHaveBeenCalledWith({ id: 'a1' }, 'lifetimePoints', 24);
    expect(entries.save).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'u1', points: 24, orderId: 'o1' }),
    );
  });

  it('never awards the same order twice', async () => {
    entries.findOne.mockResolvedValueOnce({ id: 'e1' });

    await service.awardForDeliveredOrder(manager, {
      id: 'o1',
      totalAmount: 50000,
      customer: { id: 'u1' },
    } as never);

    expect(entries.save).not.toHaveBeenCalled();
    expect(accounts.increment).not.toHaveBeenCalled();
  });

  it('does not create an account for a guest order', async () => {
    await service.awardForDeliveredOrder(manager, {
      id: 'o2',
      totalAmount: 50000,
      customer: null,
    } as never);

    expect(accounts.increment).not.toHaveBeenCalled();
    expect(entries.save).not.toHaveBeenCalled();
  });

  it('reverses the award once when an order is returned', async () => {
    entries.findOne
      .mockResolvedValueOnce(null as unknown)
      .mockResolvedValueOnce({ id: 'a1', customerId: 'u1', points: 24, orderId: 'o1' } as never);

    await service.reverseForOrder(manager, 'o1');

    expect(accounts.increment).toHaveBeenCalledWith({ id: 'a1' }, 'points', -24);
    expect(entries.save).toHaveBeenCalledWith(
      expect.objectContaining({
        points: -24,
        reason: LoyaltyEntryReason.RETURN_REVERSAL,
      }),
    );
  });
});
