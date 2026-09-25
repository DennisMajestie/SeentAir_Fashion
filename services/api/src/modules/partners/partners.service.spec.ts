import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AccessLevel, RoleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { AccountingService } from '../accounting/accounting.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { InventoryService } from '../inventory/inventory.service';
import { PermissionsService } from '../users/permissions.service';
import { UsersService } from '../users/users.service';
import { Partner } from './entities/partner.entity';
import { ProfitDistribution } from './entities/profit-distribution.entity';
import { PartnersService } from './partners.service';

const owner: AuthenticatedUser = {
  id: 'own-1',
  email: 'owner@seentair.test',
  role: RoleName.BUSINESS_OWNER_ADMIN,
};

describe('PartnersService — confirmed profit-sharing model', () => {
  let service: PartnersService;
  let partners: Array<Record<string, unknown>>;

  const partnerRepo = {
    find: jest.fn(async () => partners),
    findOne: jest.fn(async () => null as unknown),
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => ({ id: 'p-new', ...v })),
  };
  const distributionRepo = {
    findOne: jest.fn(async () => null as unknown),
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => v),
    find: jest.fn(async () => []),
  };
  const approvalsService = { assertApproved: jest.fn(async () => undefined) };
  const accountingService = {
    record: jest.fn(),
    report: jest.fn(async (kind: string) =>
      kind === 'income'
        ? { type: 'income', total: 1_000_000, byType: {} }
        : { type: 'profit', income: 1_000_000, expenditure: 400_000, profit: 600_000, net: 600_000 },
    ),
  };
  const config = {
    get: jest.fn((key: string) => {
      const values: Record<string, number> = {
        'partners.totalShares': 1_000_000,
        'partners.founderSharePct': 60,
        'partners.partnersSharePct': 40,
        'partners.reinvestmentPct': 40,
        'partners.dividendsPct': 40,
        'partners.reservePct': 20,
      };
      return values[key];
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    partners = [
      { id: 'p1', user: { name: 'Ada' }, equityPercentage: 25 },
      { id: 'p2', user: { name: 'Bola' }, equityPercentage: 15 },
    ];
    const moduleRef = await Test.createTestingModule({
      providers: [
        PartnersService,
        { provide: getRepositoryToken(Partner), useValue: partnerRepo },
        { provide: getRepositoryToken(ProfitDistribution), useValue: distributionRepo },
        { provide: UsersService, useValue: { findById: jest.fn() } },
        { provide: PermissionsService, useValue: { getAccessLevel: jest.fn() } },
        { provide: AccountingService, useValue: accountingService },
        { provide: ApprovalsService, useValue: approvalsService },
        { provide: InventoryService, useValue: { summary: jest.fn(async () => []) } },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    service = moduleRef.get(PartnersService);
  });

  it('splits profit 40/40/20 and the dividend pool 60% founder / partners by equity', async () => {
    const distribution = await service.createDistribution(
      { period: '2026-Q3', totalProfit: 1_000_000, approvalRequestId: 'req-1' },
      owner,
    );
    const d = distribution as unknown as {
      reinvestmentAmount: number;
      dividendPool: number;
      reserveAmount: number;
      perPartnerBreakdown: {
        founderCeo: number;
        partners: Array<{ partnerId: string; amount: number }>;
      };
    };
    expect(d.reinvestmentAmount).toBe(400_000);
    expect(d.dividendPool).toBe(400_000);
    expect(d.reserveAmount).toBe(200_000);
    // Founder: 60% of the pool; partners: their equity % of total shares applied to the pool.
    expect(d.perPartnerBreakdown.founderCeo).toBe(240_000);
    expect(d.perPartnerBreakdown.partners).toEqual([
      expect.objectContaining({ partnerId: 'p1', amount: 100_000 }), // 25% of 400k
      expect.objectContaining({ partnerId: 'p2', amount: 60_000 }), // 15% of 400k
    ]);
    // Founder 240k + partners 160k = the whole 400k pool.
  });

  it('refuses distribution without an approved fund-movement request', async () => {
    approvalsService.assertApproved.mockRejectedValueOnce(new Error('not approved'));
    await expect(
      service.createDistribution(
        { period: '2026-Q3', totalProfit: 1_000_000, approvalRequestId: 'bad' },
        owner,
      ),
    ).rejects.toThrow('not approved');
    expect(distributionRepo.save).not.toHaveBeenCalled();
  });

  it('enforces the 40% partner equity cap', async () => {
    const usersService = service['usersService'] as unknown as { findById: jest.Mock };
    usersService.findById.mockResolvedValue({
      id: 'u9',
      role: { name: RoleName.PARTNER_INVESTOR },
    });
    partnerRepo.findOne.mockResolvedValue(null);
    // 25 + 15 already allocated; adding 5 more exceeds 40.
    await expect(
      service.create({ userId: 'u9', equityPercentage: 5, investedAmount: 100000 }, owner),
    ).rejects.toThrow(BadRequestException);
  });

  it('records the partner investment in the accounting ledger', async () => {
    const usersService = service['usersService'] as unknown as { findById: jest.Mock };
    usersService.findById.mockResolvedValue({
      id: 'u9',
      role: { name: RoleName.PARTNER_INVESTOR },
    });
    partnerRepo.findOne.mockResolvedValue(null);
    partners = [{ id: 'p1', user: { name: 'Ada' }, equityPercentage: 10 }];
    await service.create({ userId: 'u9', equityPercentage: 10, investedAmount: 2_000_000 }, owner);
    expect(accountingService.record).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'investment', amount: 2_000_000 }),
    );
  });

  it('exposes the confirmed covenant config on the partner dashboard', async () => {
    const permissionsService = service['permissionsService'] as unknown as {
      getAccessLevel: jest.Mock;
    };
    permissionsService.getAccessLevel.mockResolvedValue(AccessLevel.VIEW);
    partnerRepo.findOne.mockResolvedValue({
      id: 'p1',
      user: { id: 'u1', name: 'Ada' },
      equityPercentage: 25,
      investedAmount: 2_000_000,
    });
    const dash = (await service.dashboard('p1', owner)) as unknown as {
      config: Record<string, number>;
      investmentInformation: { shares: number; totalShares: number };
    };
    expect(dash.config).toEqual({
      totalShares: 1_000_000,
      founderSharePct: 60,
      partnersSharePct: 40,
      reinvestmentPct: 40,
      dividendsPct: 40,
      reservePct: 20,
    });
    expect(dash.investmentInformation.shares).toBe(250_000);
    expect(dash.investmentInformation.totalShares).toBe(1_000_000);
  });
});
