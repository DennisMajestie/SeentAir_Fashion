import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApprovalActionType } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { ApprovalsService } from '../approvals/approvals.service';
import { CatalogueService } from '../catalogue/catalogue.service';
import { Order, OrderChannel } from '../orders/entities/order.entity';
import { Payment, PaymentRecordStatus } from '../orders/entities/payment.entity';
import { UsersService } from '../users/users.service';
import { CreateTierDto } from './dto/create-tier.dto';
import { ReviewAccountDto } from './dto/review-account.dto';
import { UpdateTierDto } from './dto/update-tier.dto';
import { PriceTier } from './entities/price-tier.entity';
import { WholesaleAccount, WholesaleAccountStatus } from './entities/wholesale-account.entity';

@Injectable()
export class WholesaleService {
  constructor(
    @InjectRepository(WholesaleAccount)
    private readonly accountRepo: Repository<WholesaleAccount>,
    @InjectRepository(PriceTier) private readonly tierRepo: Repository<PriceTier>,
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
    private readonly usersService: UsersService,
    private readonly catalogueService: CatalogueService,
    private readonly approvalsService: ApprovalsService,
    private readonly config: ConfigService,
  ) {}

  get moq(): number {
    return this.config.get<number>('wholesale.moq') ?? 20;
  }

  // --- Accounts ---

  /** A user applies once; staff review and assign a tier. */
  async apply(user: AuthenticatedUser): Promise<WholesaleAccount> {
    const existing = await this.findByUserId(user.id);
    if (existing) {
      throw new ConflictException(`A wholesale account already exists (status: ${existing.status})`);
    }
    return this.accountRepo.save(
      this.accountRepo.create({
        user: await this.usersService.findById(user.id),
        status: WholesaleAccountStatus.PENDING,
        tier: null,
      }),
    );
  }

  /** Staff view: all applications/accounts, optionally by status. */
  async findAllAccounts(status?: WholesaleAccountStatus): Promise<WholesaleAccount[]> {
    return this.accountRepo.find({
      where: status ? { status } : {},
      order: { createdAt: 'DESC' },
    });
  }

  async findByUserId(userId: string): Promise<WholesaleAccount | null> {
    return this.accountRepo.findOne({ where: { user: { id: userId } } });
  }

  async findById(id: string): Promise<WholesaleAccount> {
    const account = await this.accountRepo.findOne({ where: { id } });
    if (!account) throw new NotFoundException(`Wholesale account ${id} not found`);
    return account;
  }

  async review(id: string, dto: ReviewAccountDto, reviewer: AuthenticatedUser): Promise<WholesaleAccount> {
    const account = await this.findById(id);
    account.status = dto.status;
    account.reviewedBy = reviewer.id;
    if (dto.tierId) account.tier = await this.getTier(dto.tierId);
    return this.accountRepo.save(account);
  }

  /** The gate OrdersService calls for wholesale orders. */
  async assertApprovedAccount(userId: string): Promise<WholesaleAccount> {
    const account = await this.findByUserId(userId);
    if (!account || account.status !== WholesaleAccountStatus.APPROVED) {
      throw new ForbiddenException(
        'Wholesale ordering requires an approved wholesale account (MOQ eligibility)',
      );
    }
    return account;
  }

  /** Tier discount applied to the retail price; 2dp rounding. */
  applyTierPrice(retailPrice: number, tier: PriceTier | null): number {
    const discount = tier?.discountPercent ?? 0;
    return Math.round(retailPrice * (100 - discount)) / 100;
  }

  // --- Tiers ---

  async findTiers(): Promise<PriceTier[]> {
    return this.tierRepo.find({ order: { discountPercent: 'ASC' } });
  }

  async createTier(dto: CreateTierDto): Promise<PriceTier> {
    const existing = await this.tierRepo.findOne({ where: { name: dto.name } });
    if (existing) throw new ConflictException(`Tier '${dto.name}' already exists`);
    return this.tierRepo.save(
      this.tierRepo.create({
        name: dto.name,
        ruleDescription: dto.ruleDescription ?? null,
        discountPercent: dto.discountPercent,
      }),
    );
  }

  /** Discount changes are price changes — approval-gated at the API layer. */
  async updateTier(id: string, dto: UpdateTierDto): Promise<PriceTier> {
    const tier = await this.getTier(id);
    const isDiscountChange =
      dto.discountPercent !== undefined && dto.discountPercent !== tier.discountPercent;
    if (isDiscountChange) {
      if (!dto.approvalRequestId) {
        throw new ForbiddenException(
          'Tier discount changes require an approved request (approvalRequestId)',
        );
      }
      await this.approvalsService.assertApproved(
        dto.approvalRequestId,
        ApprovalActionType.PRICE_CHANGE,
      );
      tier.discountPercent = dto.discountPercent!;
    }
    if (dto.ruleDescription !== undefined) tier.ruleDescription = dto.ruleDescription;
    return this.tierRepo.save(tier);
  }

  // --- Pricing & invoices ---

  /** The caller's tier-priced catalogue (wholesalers see their own tier). */
  async pricing(user: AuthenticatedUser, page = 1, limit = 20) {
    const account = await this.assertApprovedAccount(user.id);
    const { data, total } = await this.catalogueService.findAll(page, limit);
    return {
      tier: account.tier,
      moq: this.moq,
      total,
      data: data.map((product) => ({
        id: product.id,
        name: product.name,
        category: product.category,
        retailPrice: product.basePrice,
        wholesalePrice: this.applyTierPrice(product.basePrice, account.tier),
        variants: product.variants.map((v) => ({
          id: v.id,
          sku: v.sku,
          size: v.size,
          colour: v.colour,
          retailPrice: v.priceOverride ?? product.basePrice,
          wholesalePrice: this.applyTierPrice(v.priceOverride ?? product.basePrice, account.tier),
        })),
      })),
    };
  }

  /** Order & invoice/payment history for the caller's wholesale account. */
  async invoices(user: AuthenticatedUser, page = 1, limit = 20) {
    await this.assertApprovedAccount(user.id);
    const [orders, total] = await this.orderRepo.findAndCount({
      where: { customer: { id: user.id }, channel: OrderChannel.WHOLESALE },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    const data = await Promise.all(
      orders.map(async (order) => {
        const payments = await this.paymentRepo.find({
          where: { order: { id: order.id }, status: PaymentRecordStatus.SUCCESS },
          order: { createdAt: 'ASC' },
        });
        return {
          orderId: order.id,
          createdAt: order.createdAt,
          status: order.status,
          paymentStatus: order.paymentStatus,
          totalAmount: order.totalAmount,
          items: order.items.map((i) => ({
            sku: i.variant.sku,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            lineTotal: Math.round(i.unitPrice * i.quantity * 100) / 100,
          })),
          payments: payments.map((p) => ({
            id: p.id,
            method: p.method,
            amount: p.amount,
            date: p.createdAt,
          })),
        };
      }),
    );
    return { data, total };
  }

  private async getTier(id: string): Promise<PriceTier> {
    const tier = await this.tierRepo.findOne({ where: { id } });
    if (!tier) throw new NotFoundException(`Price tier ${id} not found`);
    return tier;
  }
}
