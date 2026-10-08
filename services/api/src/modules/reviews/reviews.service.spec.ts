import { ConflictException, ForbiddenException } from '@nestjs/common';
import { RoleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { Order, OrderStatus } from '../orders/entities/order.entity';
import { Review, ReviewStatus } from './review.entity';
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