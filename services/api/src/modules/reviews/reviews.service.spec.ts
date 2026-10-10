import { ConflictException, ForbiddenException } from '@nestjs/common';
import { RoleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { Order, OrderStatus } from '../orders/entities/order.entity';
import { ReviewStatus } from './review.entity';
import { ReviewsService } from './reviews.service';

const customer: AuthenticatedUser = {
  id: 'cust-1',
  email: 'ada@seentair.test',
  role: RoleName.CUSTOMER,
};

/** An order whose only line is variant v1; customerId == null means a pure guest. */
function delivered(customerId: string | null): Order {
  return {
    status: OrderStatus.DELIVERED,
    customer: customerId ? { id: customerId } : null,
    items: [{ variant: { id: 'v1' }, quantity: 1 }],
  } as never as Order;
}

function harness(order: Order) {
  const reviewRepo = {
    findOne: jest.fn(async () => null),
    create: jest.fn((v) => v),
    save: jest.fn(async (v: { customerId?: string | null }) => ({ ...v, id: 'r1' })),
  };
  const ordersService = {
    findById: jest.fn(async (_id: string, _user?: AuthenticatedUser, _token?: string) => order),
  };
  const service = new ReviewsService(reviewRepo as never, ordersService as never);
  return { service, reviewRepo, ordersService };
}

const dto = { variantId: 'v1', rating: 5, comment: 'Great fit' };

describe('ReviewsService.create', () => {
  it('records the review for the delivered order of the signed-in customer', async () => {
    const { service, reviewRepo, ordersService } = harness(delivered('cust-1'));

    await service.create('o1', dto, customer);

    expect(ordersService.findById).toHaveBeenCalledWith('o1', customer, undefined);
    const saved = (reviewRepo.save as jest.Mock).mock.calls[0][0];
    expect(saved.customerId).toBe('cust-1');
    expect(saved.variant.id).toBe('v1');
    expect(saved.rating).toBe(5);
    expect(saved.comment).toBe('Great fit');
    expect(saved.status).toBe(ReviewStatus.PENDING);
  });

  it('accepts a guest who proves ownership with the tracking token', async () => {
    const { service, reviewRepo, ordersService } = harness(delivered(null));

    await service.create('o1', dto, undefined, 'the-emailed-token');

    expect(ordersService.findById).toHaveBeenCalledWith('o1', undefined, 'the-emailed-token');
    const saved = (reviewRepo.save as jest.Mock).mock.calls[0][0];
    expect(saved.customerId).toBeNull();
    expect(saved.status).toBe(ReviewStatus.PENDING);
  });

  it('attributes a claimed guest order to its owner user', async () => {
    const { service, reviewRepo } = harness(delivered('cust-1'));

    await service.create('o1', dto, undefined, 'the-emailed-token');

    const saved = (reviewRepo.save as jest.Mock).mock.calls[0][0];
    expect(saved.customerId).toBe('cust-1');
  });

  it('rejects a signed-in caller who is not that order\'s customer', async () => {
    const { service } = harness(delivered('cust-2'));

    await expect(service.create('o1', dto, customer)).rejects.toThrow(
      ForbiddenException, // 'Only the ordering customer can review this order'
    );
  });

  it('rejects reviews before delivery', async () => {
    const order = { ...delivered('cust-1'), status: OrderStatus.SHIPPED } as Order;
    const { service } = harness(order);

    await expect(service.create('o1', dto, customer)).rejects.toThrow(ForbiddenException);
  });

  it('rejects a line that is not part of the order', async () => {
    const order = delivered('cust-1');
    const { service } = harness(order);

    await expect(service.create('o1', { ...dto, variantId: 'v99' }, customer)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects a second review of the same order line', async () => {
    const { service, reviewRepo } = harness(delivered('cust-1'));
    (reviewRepo.findOne as jest.Mock).mockResolvedValue({ id: 'existing' });

    await expect(service.create('o1', dto, customer)).rejects.toThrow(ConflictException);
    expect(reviewRepo.save as jest.Mock).not.toHaveBeenCalled();
  });
});

/** Minimal stand-in for the chained query builder ratingSummaries builds. */
function summaryHarness(rows: Array<{ productId: string; avg: string; count: string }>) {
  const qb = {
    innerJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(async () => rows),
  };
  const reviewRepo = {
    createQueryBuilder: jest.fn(() => qb),
    findOne: jest.fn(async () => null),
    create: jest.fn((v) => v),
    save: jest.fn(async (v: unknown) => v),
  };
  const ordersService = { findById: jest.fn() };
  const service = new ReviewsService(reviewRepo as never, ordersService as never);
  return { service, reviewRepo, qb };
}

const uuid = (n: string): string => `${n.repeat(8)}-0000-0000-0000-000000000000`;

describe('ReviewsService.ratingSummaries', () => {
  it('returns averages for many products in a single query', async () => {
    const { service, reviewRepo, qb } = summaryHarness([
      { productId: uuid('a'), avg: '4.5000000000000000', count: '2' },
      { productId: uuid('b'), avg: '5.0000000000000000', count: '7' },
    ]);

    const out = await service.ratingSummaries([uuid('a'), uuid('b')]);

    expect(out).toEqual([
      { productId: uuid('a'), avg: 4.5, count: 2 },
      { productId: uuid('b'), avg: 5, count: 7 },
    ]);
    // One query for the whole page, not one per product.
    expect(reviewRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(qb.getRawMany).toHaveBeenCalledTimes(1);
  });

  it('counts only published reviews, so a card cannot disagree with its product page', async () => {
    const { service, qb } = summaryHarness([]);

    await service.ratingSummaries([uuid('a')]);

    const statusFilter = (qb.andWhere as jest.Mock).mock.calls[0];
    expect(statusFilter[0]).toContain('status');
    expect(statusFilter[1]).toEqual({ status: ReviewStatus.PUBLISHED });
  });

  it('omits products with no published reviews rather than reporting a zero', async () => {
    const { service } = summaryHarness([]);

    expect(await service.ratingSummaries([uuid('a'), uuid('b')])).toEqual([]);
  });

  it('issues no query when asked for nothing', async () => {
    const { service, reviewRepo } = summaryHarness([]);

    expect(await service.ratingSummaries([])).toEqual([]);
    expect(reviewRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('drops ids that are not uuids instead of building an invalid IN clause', async () => {
    const { service, qb } = summaryHarness([]);

    await service.ratingSummaries(["'; DROP TABLE products; --", uuid('a')]);

    const where = (qb.where as jest.Mock).mock.calls[0][1] as { ids: string[] };
    expect(where.ids).toEqual([uuid('a')]);
  });

  it('de-duplicates repeated ids so the IN list stays minimal', async () => {
    const { service, qb } = summaryHarness([]);

    await service.ratingSummaries([uuid('a'), uuid('a'), uuid('b')]);

    const where = (qb.where as jest.Mock).mock.calls[0][1] as { ids: string[] };
    expect(where.ids).toEqual([uuid('a'), uuid('b')]);
  });
});