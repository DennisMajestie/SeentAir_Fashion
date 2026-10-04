import { ForbiddenException } from '@nestjs/common';
import { RoleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { WholesaleAccount, WholesaleAccountStatus } from './entities/wholesale-account.entity';
import { WholesaleService } from './wholesale.service';

/**
 * Staff decision on a wholesale application.
 *
 * The role change is the point of this suite. orders.service.ts resolves the
 * channel with
 *   shopFromRetail = !user || user.role === CUSTOMER || dto.source === 'storefront'
 * and only then consults `dto.source === 'wholesale_portal'`. Because the role
 * check short-circuits first, an approved buyer still on CUSTOMER lands on the
 * RETAIL channel and is stopped by the retail shippingAddress guard -- the
 * batch cannot be committed at all. These tests exist because that shipped
 * broken with no test covering the interaction.
 */
describe('WholesaleService.review - role promotion', () => {
  let service: WholesaleService;
  let accountRepo: { findOne: jest.Mock; save: jest.Mock };
  let usersService: { updateRole: jest.Mock };

  const reviewer: AuthenticatedUser = {
    id: 'staff-1',
    email: 'staff@seentair.test',
    role: RoleName.MANAGEMENT,
  };

  const build = (status: string, roleName: RoleName) => {
    accountRepo = {
      findOne: jest.fn(async () => ({
        id: 'a1',
        status,
        reviewedBy: null,
        tier: null,
        user: { id: 'u1', email: 'buyer@test', role: { name: roleName } },
      })),
      save: jest.fn(async (v: unknown) => v),
    };
    usersService = { updateRole: jest.fn(async () => undefined) };
    service = new WholesaleService(
      accountRepo as never,
      { findOne: jest.fn() } as never, // tierRepo
      {} as never, // orderRepo
      {} as never, // paymentRepo
      usersService as never,
      {} as never, // catalogueService
      {} as never, // approvalsService
      {} as never, // config
      {} as never, // inventoryService
    );
  };

  beforeEach(() => build(WholesaleAccountStatus.PENDING, RoleName.CUSTOMER));

  it('promotes an approved applicant to WHOLESALER', async () => {
    await service.review('a1', { status: WholesaleAccountStatus.APPROVED }, reviewer);

    expect(usersService.updateRole).toHaveBeenCalledWith('u1', RoleName.WHOLESALER);
  });

  it('records the approval and the reviewer together', async () => {
    const saved = await service.review(
      'a1',
      { status: WholesaleAccountStatus.APPROVED },
      reviewer,
    ) as WholesaleAccount;

    expect(saved.status).toBe(WholesaleAccountStatus.APPROVED);
    expect(saved.reviewedBy).toBe('staff-1');
  });

  it('demotes back to CUSTOMER when a granted approval is revoked', async () => {
    build(WholesaleAccountStatus.APPROVED, RoleName.WHOLESALER);

    await service.review('a1', { status: WholesaleAccountStatus.REJECTED }, reviewer);

    // Fail closed: a revoked account must not keep the wholesale channel.
    expect(usersService.updateRole).toHaveBeenCalledWith('u1', RoleName.CUSTOMER);
  });

  it('leaves a non-wholesaler role alone on rejection', async () => {
    build(WholesaleAccountStatus.PENDING, RoleName.CUSTOMER);

    await service.review('a1', { status: WholesaleAccountStatus.REJECTED }, reviewer);

    // A rejected first-time applicant is already CUSTOMER; rewriting the role
    // would be a no-op write on a record we did not grant.
    expect(usersService.updateRole).not.toHaveBeenCalled();
  });
});

/**
 * The retail channel guard, exercised through the real WholesaleService gate to
 * keep the failure mode documented rather than rediscovered in production.
 */
describe('wholesale ordering gate', () => {
  let service: WholesaleService;
  let accountRepo: { findOne: jest.Mock };

  const build = (status: WholesaleAccountStatus | undefined) => {
    accountRepo = {
      findOne: jest.fn(async () =>
        status
          ? { id: 'a1', status, tier: null, user: { id: 'u1', role: { name: RoleName.WHOLESALER } } }
          : null,
      ),
    };
    service = new WholesaleService(
      accountRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: jest.fn() } as never,
      {} as never,
    );
  };

  it('blocks a CUSTOMER whose application is still pending', async () => {
    build(WholesaleAccountStatus.PENDING);

    await expect(service.assertApprovedAccount('u1')).rejects.toThrow(ForbiddenException);
  });
});