import { ConflictException } from '@nestjs/common';
import { RoleName } from '../../common/enums';
import { WholesaleAccountStatus, WholesaleBuyerType } from './entities/wholesale-account.entity';
import { WholesaleService } from './wholesale.service';

/**
 * Public wholesale application (appendix 06).
 *
 * The sign-in form on the wholesale portal doubles as the application form, so
 * this path has to provision a real customer account without any prior
 * authentication. The two things worth pinning down are that the new account
 * cannot buy wholesale stock until staff approve it, and that a known email is
 * routed to the existing sign-in flow instead of annotating a stranger's
 * record.
 */
describe('WholesaleService.applyPublic', () => {
  let service: WholesaleService;
  let accountRepo: { create: jest.Mock; save: jest.Mock; findOne: jest.Mock };
  let usersService: { create: jest.Mock; findById: jest.Mock };

  const build = () => {
    accountRepo = {
      create: jest.fn((v: unknown) => v),
      save: jest.fn(async (v: unknown) => v),
      findOne: jest.fn(),
    };
    usersService = { create: jest.fn(), findById: jest.fn() };
    service = new WholesaleService(
      accountRepo as never,
      {} as never, // tierRepo
      {} as never, // orderRepo
      {} as never, // paymentRepo
      usersService as never,
      {} as never, // catalogueService
      {} as never, // approvalsService
      {} as never, // config
      {} as never, // inventoryService
    );
  };

  const dto = {
    name: 'Ada Okeke',
    email: 'ada@boutique.test',
    password: 'correct-horse',
    businessName: 'Okeke Fashion Boutique',
    buyerType: WholesaleBuyerType.RETAILER,
    businessPhone: '+2348012345678',
    city: 'Aba',
    state: 'Abia',
    openingVolume: 60,
  };

  beforeEach(build);

  it('stores the business details the reviewer needs, pending, with no tier', async () => {
    const user = { id: 'u1', email: dto.email };
    usersService.create.mockResolvedValue(user);

    const saved = await service.applyPublic(dto);

    expect(saved).toMatchObject({
      user,
      status: WholesaleAccountStatus.PENDING,
      tier: null,
      businessName: 'Okeke Fashion Boutique',
      buyerType: WholesaleBuyerType.RETAILER,
      businessPhone: '+2348012345678',
      city: 'Aba',
      state: 'Abia',
      openingVolume: 60,
    });
  });

  it('provisions the account as a customer, never as a wholesaler', async () => {
    usersService.create.mockResolvedValue({ id: 'u1', email: dto.email });

    await service.applyPublic(dto);

    expect(usersService.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: dto.email, role: RoleName.CUSTOMER }),
    );
  });

  it('keeps a pending application out of the wholesale gate', async () => {
    usersService.create.mockResolvedValue({ id: 'u1', email: dto.email });
    accountRepo.save.mockImplementation(async (v: Record<string, unknown>) => ({ id: 'a1', ...v }));

    const saved = await service.applyPublic(dto);

    // assertApprovedAccount is the only thing that unlocks wholesale ordering,
    // and it keys off status -- not off the account existing at all.
    await expect(service.assertApprovedAccount('u1')).rejects.toThrow(
      /requires an approved wholesale account/,
    );
    expect(saved.status).toBe(WholesaleAccountStatus.PENDING);
  });

  it('refuses a known email rather than attaching an application to it', async () => {
    usersService.create.mockRejectedValue(
      new ConflictException('Email ada@boutique.test is already registered'),
    );

    await expect(service.applyPublic(dto)).rejects.toThrow(ConflictException);
    expect(accountRepo.save).not.toHaveBeenCalled();
  });

  it('treats opening volume as advisory, so a small buyer can still apply', async () => {
    usersService.create.mockResolvedValue({ id: 'u1', email: dto.email });

    const saved = await service.applyPublic({ ...dto, openingVolume: undefined });

    // MOQ is enforced at order time, not at application time. Blocking small
    // buyers here would hide the demand that tier criteria are meant to follow.
    expect(saved.openingVolume).toBeNull();
    expect(saved.status).toBe(WholesaleAccountStatus.PENDING);
  });
});