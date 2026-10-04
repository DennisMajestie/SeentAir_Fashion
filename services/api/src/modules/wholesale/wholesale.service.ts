import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApprovalActionType, RoleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { ApprovalsService } from '../approvals/approvals.service';
import { AvailabilityStatus } from '../catalogue/entities/product-variant.entity';
import { CatalogueService } from '../catalogue/catalogue.service';
import { InventoryItemType } from '../inventory/inventory-movement.entity';
import { InventoryService } from '../inventory/inventory.service';
import { Order, OrderChannel } from '../orders/entities/order.entity';
import { Payment, PaymentRecordStatus } from '../orders/entities/payment.entity';
import { UsersService } from '../users/users.service';
import { CreateTierDto } from './dto/create-tier.dto';
import { CreateWholesaleApplicationDto } from './dto/create-application.dto';
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
    private readonly inventoryService: InventoryService,
  ) {}

  get moq(): number {
    return this.config.get<number>('wholesale.moq') ?? 20;
  }

  // --- Accounts ---

  /** A user applies once; staff review and assign a tier. */
  async apply(user: AuthenticatedUser): Promise<WholesaleAccount> {
    const existing = await this.findByUserId(user.id);
    if (existing) {
      throw new ConflictException(
        `A wholesale account already exists (status: ${existing.status})`,
      );
    }
    return this.accountRepo.save(
      this.accountRepo.create({
        user: await this.usersService.findById(user.id),
        status: WholesaleAccountStatus.PENDING,
        tier: null,
      }),
    );
  }

  /**
   * Public application from an unauthenticated visitor (appendix 06).
   *
   * Creates the customer account and the pending wholesale application
   * together, because a first-time buyer has no account to apply from and the
   * portal's sign-in form doubles as the application form.
   *
   * The account is created with the customer role and a pending application
   * attached. It cannot buy wholesale stock until staff approve -- the gate is
   * the account status, checked by assertApprovedAccount. No role change is
   * needed for the wholesale portal channel, which orders.service.ts selects
   * from dto.source.
   *
   * Sequential rather than transactional: usersService.create is a single save
   * and this is a second single save, so the only failure mode is a customer
   * account with no application attached -- a record staff can still see, not
   * a silently wrong wholesale account.
   */
  async applyPublic(dto: CreateWholesaleApplicationDto): Promise<WholesaleAccount> {
    // Reuse create() so email uniqueness and bcrypt hashing stay in one place.
    // It throws ConflictException on a known email, which the controller
    // surfaces as "already registered, sign in and apply from the catalogue" --
    // attaching an application to an account whose ownership we cannot prove
    // would let anyone annotate a stranger's record.
    const user = await this.usersService.create({
      name: dto.name,
      email: dto.email,
      phone: dto.businessPhone,
      password: dto.password,
      role: RoleName.CUSTOMER,
    });

    return this.accountRepo.save(
      this.accountRepo.create({
        user,
        status: WholesaleAccountStatus.PENDING,
        tier: null,
        businessName: dto.businessName,
        buyerType: dto.buyerType,
        businessPhone: dto.businessPhone ?? null,
        city: dto.city,
        state: dto.state,
        openingVolume: dto.openingVolume ?? null,
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

  /**
   * Staff decision on an application.
   *
   * Approval also promotes the user to RoleName.WHOLESALER, and rejection
   * demotes them back to CUSTOMER. The role is not cosmetic here:
   * orders.service.ts decides the channel with
   * `shopFromRetail = !user || user.role === CUSTOMER || dto.source === 'storefront'`,
   * which short-circuits on the role *before* the `dto.source === 'wholesale_portal'`
   * fallback is ever consulted. So an approved buyer left on CUSTOMER resolves
   * to the RETAIL channel and is then rejected by the retail shippingAddress
   * guard -- they could never commit a batch at all.
   *
   * Demotion on rejection is the mirror image, so a revoked account cannot keep
   * the wholesale channel. Only demote from WHOLESALER: a staff-set role is not
   * ours to clobber.
   */
  async review(
    id: string,
    dto: ReviewAccountDto,
    reviewer: AuthenticatedUser,
  ): Promise<WholesaleAccount> {
    const account = await this.findById(id);
    account.status = dto.status;
    account.reviewedBy = reviewer.id;
    if (dto.tierId) account.tier = await this.getTier(dto.tierId);

    if (dto.status === WholesaleAccountStatus.APPROVED) {
      await this.usersService.updateRole(account.user.id, RoleName.WHOLESALER);
    } else if (account.user.role.name === RoleName.WHOLESALER) {
      await this.usersService.updateRole(account.user.id, RoleName.CUSTOMER);
    }

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

  /**
   * The tier's discount as a number. An account with no tier discounts by 0,
   * which is what makes its wholesale price equal its retail price.
   */
  tierDiscount(tier: PriceTier | null): number {
    return tier?.discountPercent ?? 0;
  }

  /** Tier discount applied to the retail price; 2dp rounding. */
  applyTierPrice(retailPrice: number, tier: PriceTier | null): number {
    return Math.round(retailPrice * (100 - this.tierDiscount(tier))) / 100;
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
    if (dto.name !== undefined && dto.name !== tier.name) {
      const clash = await this.tierRepo.findOne({ where: { name: dto.name } });
      if (clash) throw new ConflictException(`Tier '${dto.name}' already exists`);
      tier.name = dto.name;
    }
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

  /** Deleting a tier only succeeds when no wholesale account still uses it —
      otherwise their price silently changes. */
  async deleteTier(id: string): Promise<{ removed: true }> {
    const tier = await this.getTier(id);
    const inUse = await this.accountRepo.count({ where: { tier: { id } } });
    if (inUse > 0) {
      throw new ConflictException(
        `Tier '${tier.name}' is assigned to ${inUse} account(s) — reassign them before deleting.`,
      );
    }
    await this.tierRepo.remove(tier);
    return { removed: true };
  }

  // --- Pricing & invoices ---

  /**
   * The caller's tier-priced catalogue (wholesalers see their own tier).
   *
   * `imageUrl` is the first variant that actually has one, so the catalogue
   * list can show a thumbnail without inventing a placeholder asset. It stays
   * null when no variant carries an image, which the UI renders as its
   * no-image state.
   *
   * `availabilityStatus` is the variant's display status only. Stock quantity
   * is derived from the inventory ledger and is deliberately NOT projected
   * here: WHOLESALER has no INVENTORY module access, and the server re-checks
   * stock on commit.
   */
  async pricing(user: AuthenticatedUser, page = 1, limit = 20) {
    const account = await this.assertApprovedAccount(user.id);
    const { data, total } = await this.catalogueService.findAll(page, limit);
    return {
      tier: account.tier,
      /** True when the account has no tier, so wholesale == retail by construction. */
      hasDiscount: this.tierDiscount(account.tier) > 0,
      moq: this.moq,
      total,
      data: data.map((product) => ({
        id: product.id,
        name: product.name,
        category: product.category,
        imageUrl: product.variants.find((v) => !!v.imageUrl)?.imageUrl ?? null,
        retailPrice: product.basePrice,
        wholesalePrice: this.applyTierPrice(product.basePrice, account.tier),
        variants: product.variants.map((v) => ({
          id: v.id,
          sku: v.sku,
          size: v.size,
          colour: v.colour,
          imageUrl: v.imageUrl,
          availabilityStatus: v.availabilityStatus,
          retailPrice: v.priceOverride ?? product.basePrice,
          wholesalePrice: this.applyTierPrice(v.priceOverride ?? product.basePrice, account.tier),
        })),
      })),
    };
  }

  /**
   * Derived stock per variant, for an approved wholesale account.
   *
   * Reads the movement ledger through InventoryService rather than widening
   * the WHOLESALER role's INVENTORY permission: this endpoint is deliberately
   * narrow (variant ids only, no ledger details, no raw movement history), so
   * /inventory/* stays staff-only while buyers get the number they need to
   * size an order.
   *
   * `made_to_order` variants report null: they carry no shelf stock, and the
   * order service skips the stock gate for them. The server still re-checks
   * everything at commit, so a stale number here can never oversell.
   */
  async stock(
    user: AuthenticatedUser,
    variantIds: string[],
  ): Promise<Record<string, number | null>> {
    await this.assertApprovedAccount(user.id);
    const wanted = [...new Set(variantIds)].filter((id) => !!id);
    if (wanted.length === 0) return {};

    const variants = await this.catalogueService.findVariantsByIds(wanted);

    const entries = await Promise.all(
      wanted.map(async (variantId): Promise<[string, number | null]> => {
        const variant = variants.get(variantId);
        if (!variant || variant.availabilityStatus === AvailabilityStatus.MADE_TO_ORDER) {
          return [variantId, null];
        }
        const qty = await this.inventoryService.currentQuantity(
          InventoryItemType.VARIANT,
          variantId,
        );
        return [variantId, qty];
      }),
    );
    return Object.fromEntries(entries);
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
