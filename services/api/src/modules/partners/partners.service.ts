import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ACCESS_RANK,
  AccessLevel,
  ApprovalActionType,
  ModuleName,
  RoleName,
} from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { AccountingService } from '../accounting/accounting.service';
import { LedgerEntryType } from '../accounting/ledger-entry.entity';
import { ApprovalsService } from '../approvals/approvals.service';
import { InventoryItemType } from '../inventory/inventory-movement.entity';
import { InventoryService } from '../inventory/inventory.service';
import { PermissionsService } from '../users/permissions.service';
import { UsersService } from '../users/users.service';
import { CreateDistributionDto } from './dto/create-distribution.dto';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { Partner } from './entities/partner.entity';
import { ProfitDistribution } from './entities/profit-distribution.entity';

const round2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class PartnersService {
  constructor(
    @InjectRepository(Partner) private readonly partnerRepo: Repository<Partner>,
    @InjectRepository(ProfitDistribution)
    private readonly distributionRepo: Repository<ProfitDistribution>,
    private readonly usersService: UsersService,
    private readonly permissionsService: PermissionsService,
    private readonly accountingService: AccountingService,
    private readonly approvalsService: ApprovalsService,
    private readonly inventoryService: InventoryService,
    private readonly config: ConfigService,
  ) {}

  private cfg<T>(key: string, fallback: T): T {
    return this.config.get<T>(`partners.${key}`) ?? fallback;
  }

  async create(dto: CreatePartnerDto, actor: AuthenticatedUser): Promise<Partner> {
    const user = await this.usersService.findById(dto.userId);
    if (user.role.name !== RoleName.PARTNER_INVESTOR) {
      throw new BadRequestException('Partner records require a user with the partner_investor role');
    }
    const existing = await this.partnerRepo.findOne({ where: { user: { id: dto.userId } } });
    if (existing) throw new ConflictException('This user is already a partner');

    // All partners together hold at most the partners' share (40%).
    const partners = await this.partnerRepo.find();
    const allocated = partners.reduce((sum, p) => sum + p.equityPercentage, 0);
    const cap = this.cfg('partnersSharePct', 40);
    if (allocated + dto.equityPercentage > cap) {
      throw new BadRequestException(
        `Partner equity cap exceeded: ${allocated}% allocated of ${cap}%; cannot add ${dto.equityPercentage}%`,
      );
    }

    const partner = await this.partnerRepo.save(
      this.partnerRepo.create({
        user,
        equityPercentage: dto.equityPercentage,
        investedAmount: dto.investedAmount,
      }),
    );
    // The investment lands in the accounting ledger (investment reports).
    await this.accountingService.record({
      type: LedgerEntryType.INVESTMENT,
      amount: dto.investedAmount,
      category: 'partner_investment',
      referenceId: partner.id,
      recordedBy: actor.id,
    });
    return partner;
  }

  async findAll(): Promise<Partner[]> {
    return this.partnerRepo.find({ order: { createdAt: 'ASC' } });
  }

  /** The caller's own partner record (partner-portal entry point). */
  async findByUserId(userId: string): Promise<Partner> {
    const partner = await this.partnerRepo.findOne({ where: { user: { id: userId } } });
    if (!partner) throw new NotFoundException('No partner record for this account');
    return partner;
  }

  /**
   * Quarterly distribution per the confirmed model: 40/40/20 split, dividend
   * pool shared 60% founder / partners by equity %. Fund movement → approval-gated.
   */
  async createDistribution(
    dto: CreateDistributionDto,
    actor: AuthenticatedUser,
  ): Promise<ProfitDistribution> {
    await this.approvalsService.assertApproved(
      dto.approvalRequestId,
      ApprovalActionType.FUND_MOVEMENT,
    );
    const existing = await this.distributionRepo.findOne({ where: { period: dto.period } });
    if (existing) throw new ConflictException(`Period ${dto.period} is already distributed`);

    const reinvestment = round2((dto.totalProfit * this.cfg('reinvestmentPct', 40)) / 100);
    const dividendPool = round2((dto.totalProfit * this.cfg('dividendsPct', 40)) / 100);
    const reserve = round2((dto.totalProfit * this.cfg('reservePct', 20)) / 100);

    const partners = await this.partnerRepo.find();
    const founderShare = round2((dividendPool * this.cfg('founderSharePct', 60)) / 100);
    // Each partner: their equity % of total shares, applied to the dividend pool.
    const partnerRows = partners.map((p) => ({
      partnerId: p.id,
      name: p.user.name,
      equityPercentage: p.equityPercentage,
      amount: round2((dividendPool * p.equityPercentage) / 100),
    }));

    return this.distributionRepo.save(
      this.distributionRepo.create({
        period: dto.period,
        totalProfit: dto.totalProfit,
        reinvestmentAmount: reinvestment,
        dividendPool,
        reserveAmount: reserve,
        perPartnerBreakdown: { founderCeo: founderShare, partners: partnerRows },
        createdBy: actor.id,
      }),
    );
  }

  /** Confirmed dashboard flow: overview → investment → performance → inventory → reports → profit sharing. */
  async dashboard(partnerId: string, user: AuthenticatedUser) {
    const partner = await this.getPartnerWithAccessCheck(partnerId, user);

    const [income, profit, inventorySummary, distributions] = await Promise.all([
      this.accountingService.report('income'),
      this.accountingService.report('profit'),
      this.inventoryService.summary(),
      this.distributionRepo.find({ order: { period: 'DESC' } }),
    ]);

    const finishedGoodsUnits = inventorySummary
      .filter((i) => i.itemType === InventoryItemType.VARIANT)
      .reduce((sum, i) => sum + i.currentQuantity, 0);
    const totalShares = this.cfg('totalShares', 1_000_000);

    // Aggregates only — never customer PII (client-explicit boundary).
    return {
      businessOverview: {
        totalIncome: (income as { total: number }).total,
        profitLoss: profit,
      },
      investmentInformation: {
        investedAmount: partner.investedAmount,
        equityPercentage: partner.equityPercentage,
        shares: Math.round((totalShares * partner.equityPercentage) / 100),
        totalShares,
      },
      performance: profit,
      inventoryVisibility: { finishedGoodsUnits },
      accountsReports: { income, profit },
      profitSharing: distributions.map((d) => {
        const breakdown = d.perPartnerBreakdown as {
          partners: Array<{ partnerId: string; amount: number }>;
        };
        const mine = breakdown.partners.find((p) => p.partnerId === partner.id);
        return {
          period: d.period,
          totalProfit: d.totalProfit,
          dividendPool: d.dividendPool,
          myDividend: mine?.amount ?? 0,
        };
      }),
    };
  }

  async distributions(partnerId: string, user: AuthenticatedUser) {
    await this.getPartnerWithAccessCheck(partnerId, user);
    return this.distributionRepo.find({ order: { period: 'DESC' } });
  }

  private async getPartnerWithAccessCheck(
    partnerId: string,
    user: AuthenticatedUser,
  ): Promise<Partner> {
    const partner = await this.partnerRepo.findOne({ where: { id: partnerId } });
    if (!partner) throw new NotFoundException(`Partner ${partnerId} not found`);
    const access = await this.permissionsService.getAccessLevel(user.role, ModuleName.PARTNERS);
    if (ACCESS_RANK[access] < ACCESS_RANK[AccessLevel.OWN]) {
      throw new ForbiddenException('No partner-module access');
    }
    if (access === AccessLevel.OWN && partner.user.id !== user.id) {
      throw new ForbiddenException('Not your partner record');
    }
    return partner;
  }
}
