import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { ACCESS_RANK, AccessLevel, ModuleName, RoleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { CatalogueService } from '../catalogue/catalogue.service';
import { AvailabilityStatus } from '../catalogue/entities/product-variant.entity';
import { retailUnitPrice } from '../catalogue/sale-pricing';
import { InventoryItemType, MovementType } from '../inventory/inventory-movement.entity';
import {
  InsufficientStockException,
  InventoryService,
  LedgerItem,
} from '../inventory/inventory.service';
import { PermissionsService } from '../users/permissions.service';
import { UsersService } from '../users/users.service';
import { WholesaleService } from '../wholesale/wholesale.service';
import { AccountingService } from '../accounting/accounting.service';
import { LedgerEntryType } from '../accounting/ledger-entry.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { DeliveryLeg, DeliveryLegStatus } from '../logistics/entities/delivery-leg.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { GuestContactDto } from './dto/guest-contact.dto';
import { OrderFulfilmentDto } from './dto/order-fulfilment.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { OrderAccessToken } from './entities/order-access-token.entity';
import { OrderItem } from './entities/order-item.entity';
import { OrderStatusEvent } from './entities/order-status-event.entity';
import { Order, OrderChannel, OrderStatus, PaymentStatus } from './entities/order.entity';
import { Payment, PaymentMethod, PaymentRecordStatus } from './entities/payment.entity';
import { ProcessedWebhookEvent } from './entities/processed-webhook-event.entity';
import { OrderStatusBus } from './order-status.bus';
import { PaystackService } from './paystack.service';

/** Forward-only customer-facing progression (appendix 09). RETURNED is set by the returns flow (Phase 5). */
const STATUS_FLOW: OrderStatus[] = [
  OrderStatus.AWAITING_PAYMENT,
  OrderStatus.ORDER_RECEIVED,
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
];

/** The Paystack webhook envelope fields we act on. */
export interface PaystackWebhookEvent {
  event: string;
  data: { id?: number | string; reference?: string; amount?: number };
}

/**
 * Paystack sends no envelope id. The transaction id (data.id) is stable across
 * retries of one event, so event name + data.id is the dedupe key, with the
 * reference as fallback. Null means the event carries nothing to dedupe on.
 */
export function paystackEventId(event: PaystackWebhookEvent): string | null {
  const key = event.data?.id ?? event.data?.reference;
  return key === undefined || key === null ? null : `${event.event}:${key}`;
}

/** Staff alerted when a payment needs a human: stock short, duplicate or mismatched charge. */
const PAYMENT_ATTENTION_ROLES = [
  RoleName.BUSINESS_OWNER_ADMIN,
  RoleName.MANAGEMENT,
  RoleName.INVENTORY,
  RoleName.SALES,
];

/** Status-event marker for internal payment notes; hidden from the customer timeline. */
const PAYMENT_EXCEPTION_EVENT = 'payment_exception';

/** What a Paystack delivery resolved to. Every value is acknowledged with 200. */
export type PaystackWebhookOutcome =
  | 'applied' // payment applied to the order
  | 'duplicate_event' // this event was already processed
  | 'already_applied' // the payment row was SUCCESS from an earlier delivery
  | 'duplicate_charge' // captured, but the order was no longer payable — staff must refund
  | 'amount_mismatch' // captured amount ≠ order total — payment FAILED, staff alerted
  | 'unknown_reference' // no payment row carries this reference
  | 'ignored'; // an event type we do not act on, or a malformed envelope

interface PaymentOutcome {
  payment: Payment;
  order: Order;
  /** Lines the ledger refused, e.g. "TEE-BLK-M ×2"; empty when fully allocated. */
  short: string[];
}

interface StaffAlert {
  order: Order;
  type: string;
  message: string;
}

interface WebhookResult {
  outcome: PaystackWebhookOutcome;
  applied?: PaymentOutcome;
  alert?: StaffAlert;
}

/** Which channel an incoming order belongs to, and why.
 *
 *  The `source` tag is authoritative: each portal tags its own source, so
 *  `wholesale_portal` means wholesale and `storefront` means retail regardless
 *  of who is signed in. The caller's role is only the fallback for
 *  programmatic/staff calls that carry no tag.
 *
 *  This precedence is the whole point of the function. It used to be inverted,
 *  with the CUSTOMER role test inside `shopFromRetail`:
 *
 *      shopFromRetail = !user || user.role === CUSTOMER || dto.source === 'storefront';
 *
 *  which short-circuited on the role before the wholesale tag was consulted.
 *  A buyer approved through the public application kept role CUSTOMER, so the
 *  tag was ignored, the order resolved to RETAIL, and the retail-only
 *  shippingAddress guard rejected the batch -- the wholesale portal never
 *  sends an address, because wholesale addressing is tracked separately.
 *  Those buyers could not commit a batch at all.
 */
export function resolveChannelIntent(
  user: AuthenticatedUser | undefined,
  source?: string,
): { shopFromRetail: boolean; shopFromWholesale: boolean } {
  const taggedRetail = source === 'storefront';
  const taggedWholesale = source === 'wholesale_portal';
  const shopFromRetail =
    !user || taggedRetail || (!taggedWholesale && user.role === RoleName.CUSTOMER);
  return {
    shopFromRetail,
    shopFromWholesale:
      !shopFromRetail && !!user && (taggedWholesale || user.role === RoleName.WHOLESALER),
  };
}

/** Who a tracking response is being shaped for. Derived server-side from the
 *  caller's effective access; never from anything the client sends. */
export type TrackingAudience = 'customer' | 'staff';

/**
 * Customer-facing name for OrderStatus.STOCK_EXCEPTION.
 *
 * Not a member of OrderStatus: it is never stored and never staff-facing, it
 * exists only in the customer projection of /orders/:id/tracking. The stored
 * value stays `stock_exception` so admin, the ledger and the staff tracker are
 * unaffected.
 */
export const CUSTOMER_AWAITING_STOCK = 'awaiting_stock';

/** A checkpoint as a customer may see it. `zone` and `note` are absent by
 *  design: zone is an internal corridor label and `note` is free text typed by
 *  staff, which is not guaranteed to be customer-safe. */
export interface CustomerCheckpoint {
  status: string | null;
  at: string | null;
}

/** One leg of a multi-leg delivery, as a customer is allowed to see it.
 *  `driverName` is reduced to a first name for the same reason. */
export interface CustomerDeliveryLeg {
  legNumber: number;
  carrier: string;
  status: DeliveryLegStatus;
  trackingRef: string | null;
  driverName: string | null;
  checkpoints: CustomerCheckpoint[];
}

/** The staff view keeps everything an ops user needs to run a delivery. */
export interface StaffCheckpoint {
  zone: unknown;
  status: string | null;
  note: string | null;
  sealId: string | null;
  driverName: string | null;
  driverPhone: string | null;
  at: string | null;
}

export interface StaffDeliveryLeg extends Omit<CustomerDeliveryLeg, 'checkpoints'> {
  zone: string | null;
  driverPhone: string | null;
  cost: number | null;
  contents: unknown | null;
  createdBy: string | null;
  checkpoints: StaffCheckpoint[];
}

/** A status event as a customer may see it: status and when it happened.
 *  `note` is staff-authored free text and is not projected. */
export interface CustomerStatusEvent {
  status: string;
  createdAt: Date;
}

export interface OrderTracking<
  T = CustomerDeliveryLeg,
  E = OrderStatusEvent | CustomerStatusEvent,
> {
  /**
   * A stored OrderStatus, plus CUSTOMER_AWAITING_STOCK in the customer
   * projection. Typed as a string union rather than OrderStatus because
   * awaiting_stock is deliberately not a storable order status.
   */
  status: OrderStatus | typeof CUSTOMER_AWAITING_STOCK;
  deliveredAt: Date | null;
  events: E[];
  deliveries: T[];
}

/** First name only. A rider's full name and phone are staff-side detail. */
function firstNameOnly(name: string | null): string | null {
  const raw = (name ?? '').trim();
  if (!raw) return null;
  return raw.split(/\s+/)[0] || null;
}

function checkpointsOf(leg: DeliveryLeg): Array<Record<string, unknown>> {
  const raw = Array.isArray(leg.checkpoints) ? (leg.checkpoints as Array<unknown>) : [];
  return raw.filter((c): c is Record<string, unknown> => !!c && typeof c === 'object');
}

/** The writer stamps `timestamp`; the entity doc says `at`. Accept both so an
 *  older leg's checkpoints do not render with no time. */
function checkpointTime(cp: Record<string, unknown>): string | null {
  const t = cp['timestamp'] ?? cp['at'];
  return t === undefined || t === null ? null : String(t);
}

/** Customer shape. `zone` and `note` are dropped rather than mapped: no
 *  transformation makes staff-authored free text safe to show a customer. */
export function toCustomerLeg(leg: DeliveryLeg): CustomerDeliveryLeg {
  return {
    legNumber: leg.legNumber,
    carrier: leg.carrier,
    status: leg.status,
    trackingRef: leg.trackingRef,
    driverName: firstNameOnly(leg.driverName),
    checkpoints: checkpointsOf(leg).map((cp) => ({
      status: cp['status'] === undefined || cp['status'] === null ? null : String(cp['status']),
      at: checkpointTime(cp),
    })),
  };
}

/** Staff shape: everything the ops dashboard and the GIGL workflow need. */
export function toStaffLeg(leg: DeliveryLeg): StaffDeliveryLeg {
  return {
    legNumber: leg.legNumber,
    carrier: leg.carrier,
    status: leg.status,
    trackingRef: leg.trackingRef,
    driverName: leg.driverName,
    driverPhone: leg.driverPhone,
    zone: leg.zone,
    cost: leg.cost,
    contents: leg.contents,
    createdBy: leg.createdBy,
    checkpoints: checkpointsOf(leg).map((cp) => ({
      zone: cp['zone'] ?? null,
      status: cp['status'] === undefined || cp['status'] === null ? null : String(cp['status']),
      note: cp['note'] === undefined || cp['note'] === null ? null : String(cp['note']),
      sealId: cp['sealId'] === undefined || cp['sealId'] === null ? null : String(cp['sealId']),
      driverName:
        cp['driverName'] === undefined || cp['driverName'] === null
          ? null
          : String(cp['driverName']),
      driverPhone:
        cp['driverPhone'] === undefined || cp['driverPhone'] === null
          ? null
          : String(cp['driverPhone']),
      at: checkpointTime(cp),
    })),
  };
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(OrderStatusEvent)
    private readonly eventRepo: Repository<OrderStatusEvent>,
    @InjectRepository(DeliveryLeg) private readonly legRepo: Repository<DeliveryLeg>,
    @InjectRepository(OrderAccessToken)
    private readonly accessTokenRepo: Repository<OrderAccessToken>,
    private readonly catalogueService: CatalogueService,
    private readonly inventoryService: InventoryService,
    private readonly permissionsService: PermissionsService,
    private readonly usersService: UsersService,
    private readonly paystackService: PaystackService,
    private readonly wholesaleService: WholesaleService,
    private readonly accountingService: AccountingService,
    private readonly notificationsService: NotificationsService,
    private readonly orderStatusBus: OrderStatusBus,
    private readonly config: ConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /**
   * Effective access to the shared /orders resource = the stronger of the
   * caller's retail_orders and wholesale_orders grants; OWN scopes to the
   * caller's own orders.
   */
  async effectiveAccess(user: AuthenticatedUser): Promise<AccessLevel> {
    const retail = await this.permissionsService.getAccessLevel(
      user.role,
      ModuleName.RETAIL_ORDERS,
    );
    const wholesale = await this.permissionsService.getAccessLevel(
      user.role,
      ModuleName.WHOLESALE_ORDERS,
    );
    return ACCESS_RANK[retail] >= ACCESS_RANK[wholesale] ? retail : wholesale;
  }

  /**
   * `user` is undefined for a guest (the route is @OptionalAuth). A guest is
   * always a retail buyer with no account: they cannot reach the wholesale
   * branch, which needs an approved account, nor the staff branch, which needs
   * FULL access. Everything downstream of the channel decision — pricing from
   * the catalogue, the stock gate, the ledger — is identical either way.
   */
  async create(dto: CreateOrderDto, user?: AuthenticatedUser): Promise<Order> {
    const guest = user ? undefined : this.assertGuestPayload(dto);
    const access = user ? await this.effectiveAccess(user) : AccessLevel.OWN;
    if (ACCESS_RANK[access] < ACCESS_RANK[AccessLevel.OWN]) {
      throw new ForbiddenException('No order access');
    }

    // Channel derives from where the order was placed (source tag), with a
    // role fallback for programmatic/staff calls. Each portal tags its own
    // source, so a wholesaler-role account buying on the retail storefront
    // still gets a RETAIL (retail-priced) order instead of a wholesale order.
    let channel: OrderChannel;
    let customerId: string | null = user?.id ?? null;
    let tierDiscountTier = null as
      import('../wholesale/entities/price-tier.entity').PriceTier | null;
    // Precedence matters here and was inverted: the CUSTOMER role test used to
    // run inside `shopFromRetail`, which short-circuited the explicit
    // `source === 'wholesale_portal'` tag before it was ever consulted. A buyer
    // approved through the public application kept role CUSTOMER (review() set
    // status but not role), so the tag was ignored, the order resolved to
    // RETAIL, and the retail-only shippingAddress guard below rejected the
    // batch with "shippingAddress is required" -- the portal never sends one,
    // because wholesale addressing is tracked separately.
    const { shopFromRetail, shopFromWholesale } = resolveChannelIntent(user, dto.source);

    if (shopFromRetail) {
      channel = OrderChannel.RETAIL;
    } else if (shopFromWholesale && user) {
      channel = OrderChannel.WHOLESALE;
      // Wholesale gate, server-side: approved account + MOQ (appendix 06).
      //
      // `channel` is chosen from `dto.source`, which is client-supplied, so it
      // cannot itself be the authorisation. assertApprovedAccount() is what
      // actually decides: it re-reads the account from the database and
      // requires status = approved, so a caller cannot reach wholesale pricing,
      // the wholesale MOQ, or a wholesale channel order without an approved
      // account. It also covers a signed-in CUSTOMER who claims the
      // wholesale_portal tag -- they must already hold an approved account, and
      // review() promotes them to WHOLESALER when it grants one.
      const account = await this.wholesaleService.assertApprovedAccount(user.id);
      tierDiscountTier = account.tier;
      const totalUnits = dto.items.reduce((sum, i) => sum + i.quantity, 0);
      if (totalUnits < this.wholesaleService.moq) {
        throw new BadRequestException(
          `Wholesale orders require at least ${this.wholesaleService.moq} units (MOQ); got ${totalUnits}`,
        );
      }
    } else {
      // Staff with FULL access can record in-store (or other-channel) orders.
      if (ACCESS_RANK[access] < ACCESS_RANK[AccessLevel.FULL]) {
        throw new ForbiddenException('Staff need full order access to create orders');
      }
      channel = dto.channel ?? OrderChannel.IN_STORE;
      customerId = dto.customerId ?? null;
    }

    // A retail parcel cannot be routed without a destination, and a guest order
    // has no account address to fall back on. Scoped to RETAIL deliberately:
    // an in-store sale is handed over the counter, and the wholesale portal
    // does not collect an address today — widening this would break live B2B
    // ordering. Wholesale addressing is tracked separately.
    if (channel === OrderChannel.RETAIL && !dto.shippingAddress) {
      throw new BadRequestException(
        'shippingAddress is required: a delivery cannot be routed without state, city, street and phone',
      );
    }

    // Price items from the catalogue and soft-check stock availability.
    const items: OrderItem[] = [];
    let total = 0;
    for (const itemDto of dto.items) {
      const variant = await this.catalogueService.findVariantById(itemDto.variantId);
      // A made-to-order variant is never stocked (the seed holds 0 and the
      // storefront still offers it with a lead time), so the stock gate must
      // not block it. If it's paid before a batch exists, applyPayment records
      // the line as a shortfall -> STOCK_EXCEPTION -> staff raise the batch.
      // Every other availability state still must have real stock.
      if (variant.availabilityStatus !== AvailabilityStatus.MADE_TO_ORDER) {
        const available = await this.inventoryService.currentQuantity(
          InventoryItemType.VARIANT,
          variant.id,
        );
        if (available < itemDto.quantity) {
          throw new BadRequestException(
            `Insufficient stock for ${variant.sku}: ${available} available, ${itemDto.quantity} requested`,
          );
        }
      }
      const retailPrice = variant.priceOverride ?? variant.product.basePrice;
      // A timed sale is a retail promotion: it is priced here, at order
      // creation, from the same rule the storefront displays, and the result is
      // stored on the line -- so a sale that ends while an order awaits payment
      // does not change what that order costs. Wholesale buyers keep their tier
      // price on the normal retail price; the two discounts never stack.
      const unitPrice =
        channel === OrderChannel.WHOLESALE
          ? this.wholesaleService.applyTierPrice(retailPrice, tierDiscountTier)
          : retailUnitPrice(retailPrice, variant.product);
      const item = new OrderItem();
      item.variant = variant;
      item.quantity = itemDto.quantity;
      item.unitPrice = unitPrice;
      items.push(item);
      total += unitPrice * itemDto.quantity;
    }

    const order = this.orderRepo.create({
      customer: customerId ? await this.usersService.findById(customerId) : null,
      guestName: guest?.name ?? null,
      guestEmail: guest?.email ?? null,
      claimedAt: null,
      channel,
      source: dto.source ?? null,
      shippingAddress: dto.shippingAddress ?? null,
      deliveryMethod: dto.deliveryMethod ?? null,
      customerNote: dto.customerNote?.trim() || null,
      status: OrderStatus.AWAITING_PAYMENT,
      paymentStatus: PaymentStatus.UNPAID,
      totalAmount: Math.round(total * 100) / 100,
      items,
    });
    const saved = await this.orderRepo.save(order);
    // A guest has no account to look the order up from, so the tracking token is
    // minted here and handed back exactly once. It is also emailed on payment;
    // this copy is what lets the storefront show the confirmation immediately.
    if (guest) saved.trackingToken = await this.issueTrackingToken(saved.id);
    return saved;
  }

  /**
   * Attach every unclaimed guest order placed with this address to the account.
   * Returns how many moved.
   *
   * The caller MUST have verified the address first: matching on email alone is
   * what makes this useful and also what would make it a hijack, since anyone
   * could register with a stranger's address and inherit their order history and
   * home address. AuthService only calls this from verifyEmail.
   *
   * Already-claimed orders are skipped, so re-verifying is a no-op rather than a
   * way to steal an order back from whoever claimed it first.
   */
  async claimGuestOrders(userId: string, email: string): Promise<number> {
    const normalised = email.trim().toLowerCase();
    const result = await this.orderRepo.update(
      { guestEmail: normalised, claimedAt: IsNull() },
      { customer: { id: userId }, claimedAt: new Date() },
    );
    const claimed = result.affected ?? 0;
    if (claimed > 0) {
      this.logger.log(`Claimed ${claimed} guest order(s) onto account ${userId}`);
    }
    return claimed;
  }

  /**
   * Mint a tracking token for one order. The raw value is returned to the
   * caller and never stored — only its SHA-256 hash goes to the database, so a
   * leak of the table opens nothing.
   */
  async issueTrackingToken(orderId: string): Promise<string> {
    const rawToken = randomBytes(32).toString('hex');
    const ttlDays = this.config.get<number>('mail.orderTokenTtlDays') ?? 90;
    await this.accessTokenRepo.save(
      this.accessTokenRepo.create({
        orderId,
        tokenHash: createHash('sha256').update(rawToken).digest('hex'),
        expiresAt: new Date(Date.now() + ttlDays * 86_400_000),
      }),
    );
    return rawToken;
  }

  /**
   * Resolve a guest tracking token to its order. A wrong, expired or foreign
   * token is a 404 rather than a 403 — a 403 would confirm that the order id
   * exists, which is exactly what someone probing ids wants to learn.
   */
  private async orderForToken(orderId: string, rawToken: string): Promise<Order> {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const record = await this.accessTokenRepo.findOne({ where: { tokenHash } });
    if (!record || record.orderId !== orderId || record.expiresAt.getTime() < Date.now()) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: { items: { variant: { product: true } } },
    });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);
    return order;
  }

  /**
   * Validate the guest half of a create request. The DTO already checked the
   * shape; this enforces the rules that depend on who is calling.
   */
  private assertGuestPayload(dto: CreateOrderDto): GuestContactDto {
    if (!dto.guest) {
      throw new BadRequestException(
        'Sign in, or provide guest details (name and email) to order without an account',
      );
    }
    // A guest cannot choose a channel or attach the order to somebody's account:
    // both are staff controls, and honouring them unauthenticated would let a
    // stranger write orders onto a real customer's history.
    if (dto.channel && dto.channel !== OrderChannel.RETAIL) {
      throw new ForbiddenException('Guest orders are retail only');
    }
    if (dto.customerId) {
      throw new ForbiddenException('Guest orders cannot be attached to an account');
    }
    return dto.guest;
  }

  async findAll(
    user: AuthenticatedUser,
    filters: { channel?: OrderChannel; status?: OrderStatus; page?: number; limit?: number },
  ): Promise<{ data: Order[]; total: number }> {
    const access = await this.effectiveAccess(user);
    if (ACCESS_RANK[access] < ACCESS_RANK[AccessLevel.OWN]) {
      throw new ForbiddenException('No order access');
    }
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const where: Record<string, unknown> = {};
    if (access === AccessLevel.OWN) where.customer = { id: user.id };
    if (filters.channel) where.channel = filters.channel;
    if (filters.status) where.status = filters.status;
    const [data, total] = await this.orderRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total };
  }

  /**
   * `rawToken` is the guest path: the same order, proven by the emailed link
   * rather than a session. It is only consulted when there is no user, so a
   * signed-in caller can never widen their access by attaching one.
   */
  async findById(id: string, user?: AuthenticatedUser, rawToken?: string): Promise<Order> {
    if (!user) {
      if (!rawToken) throw new NotFoundException(`Order ${id} not found`);
      return this.orderForToken(id, rawToken);
    }
    // items and items.variant load eagerly; variant.product does not, so it is
    // joined here. One extra LEFT JOIN on the single order query, which is what
    // lets the storefront label a line by product name instead of SKU. Not
    // marked eager on the entity: that would load the product for every variant
    // fetch across the whole app, not just order reads.
    const order = await this.orderRepo.findOne({
      where: { id },
      relations: { items: { variant: { product: true } } },
    });
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    const access = await this.effectiveAccess(user);
    if (access === AccessLevel.OWN && order.customer?.id !== user.id) {
      throw new ForbiddenException('Not your order');
    }
    if (ACCESS_RANK[access] < ACCESS_RANK[AccessLevel.OWN]) {
      throw new ForbiddenException('No order access');
    }
    return order;
  }

  /**
   * Offline payment (cash/POS/bank transfer), recorded manually by staff
   * with FULL payments access. Enforces full payment upfront, then confirms
   * the order and decrements stock through the ledger — all in one transaction.
   */
  async recordOfflinePayment(
    orderId: string,
    dto: RecordPaymentDto,
    actor: AuthenticatedUser,
  ): Promise<Payment> {
    if (dto.method === PaymentMethod.PAYSTACK) {
      throw new BadRequestException('Use the Paystack flow for online payments');
    }
    const paymentsAccess = await this.permissionsService.getAccessLevel(
      actor.role,
      ModuleName.PAYMENTS,
    );
    if (ACCESS_RANK[paymentsAccess] < ACCESS_RANK[AccessLevel.FULL]) {
      throw new ForbiddenException('Recording offline payments requires full payments access');
    }
    const order = await this.getOrderOrThrow(orderId);
    this.assertPayable(order, dto.amount);
    return this.completePayment(order.id, dto.method, dto.amount, actor.id);
  }

  /**
   * Start a Paystack payment for the caller's own (or staff-managed) order.
   *
   * A guest has no session, so they present the tracking token minted at
   * checkout instead. findById already treats a missing or wrong token as a
   * 404, so a stranger cannot start a payment against someone else's order —
   * and this is the only thing a token can do to an order's money: recording
   * an offline payment stays behind a real login with full payments access.
   */
  async initPaystackPayment(
    orderId: string,
    user?: AuthenticatedUser,
    emailOverride?: string,
    rawToken?: string,
  ): Promise<{ authorizationUrl: string; reference: string }> {
    const order = await this.findById(orderId, user, rawToken);
    this.assertPayable(order, order.totalAmount);
    // A guest order has no account behind it, so the address it was placed with
    // is the one Paystack bills and receipts.
    const billTo = order.customer?.email ?? order.guestEmail ?? user?.email;
    if (!billTo) {
      throw new BadRequestException('No email address to bill this order to');
    }
    const email = this.resolvePaystackEmail(billTo, emailOverride);
    const reference = `seentair-${order.id}-${randomUUID().slice(0, 8)}`;
    const init = await this.paystackService.initializeTransaction(
      email,
      order.totalAmount,
      reference,
      this.paystackCallbackUrl(order.id),
    );
    await this.paymentRepo.save(
      this.paymentRepo.create({
        order,
        method: PaymentMethod.PAYSTACK,
        amount: order.totalAmount,
        status: PaymentRecordStatus.PENDING,
        reference: init.reference,
        recordedBy: null,
      }),
    );
    return init;
  }

  /**
   * Webhook entry point (signature already verified by the controller). The
   * event is claimed with INSERT … ON CONFLICT DO NOTHING inside the same
   * transaction that processes it: a concurrent duplicate blocks on the unique
   * index until this transaction ends, then finds the row and is acknowledged
   * without reprocessing; if this transaction rolls back, the retry proceeds.
   *
   * Only transient failures propagate (non-2xx, so Paystack retries). Terminal
   * conditions — duplicate charge, amount mismatch, unknown reference — are
   * recorded, alerted to staff and acknowledged, so Paystack stops redelivering.
   */
  async handlePaystackEvent(
    event: PaystackWebhookEvent,
  ): Promise<{ outcome: PaystackWebhookOutcome }> {
    const eventId = paystackEventId(event);
    const result = await this.dataSource.transaction(async (manager): Promise<WebhookResult> => {
      if (eventId !== null) {
        const claim = await manager
          .createQueryBuilder()
          .insert()
          .into(ProcessedWebhookEvent)
          .values({ provider: 'paystack', eventId })
          .orIgnore()
          .execute();
        if ((claim.raw as unknown[]).length === 0) return { outcome: 'duplicate_event' };
      }
      if (event.event !== 'charge.success') return { outcome: 'ignored' };
      const { reference, amount } = event.data ?? {};
      if (!reference || typeof amount !== 'number') {
        this.logger.warn(`Paystack charge.success without reference/amount ignored (${eventId})`);
        return { outcome: 'ignored' };
      }
      return this.confirmPaystackPayment(reference, amount, manager);
    });
    // Post-commit only.
    if (result.applied) this.notifyAfterPayment(result.applied);
    if (result.alert) void this.alertStaff(result.alert);
    return { outcome: result.outcome };
  }

  /** charge.success inside the webhook transaction: lock the payment row, re-check, apply. */
  private async confirmPaystackPayment(
    reference: string,
    amountKobo: number,
    manager: EntityManager,
  ): Promise<WebhookResult> {
    const payment = await manager.findOne(Payment, {
      where: { reference },
      lock: { mode: 'pessimistic_write' },
      loadEagerRelations: false,
    });
    if (!payment) {
      this.logger.warn(`Paystack charge.success for unknown reference ${reference}`);
      return { outcome: 'unknown_reference' };
    }
    if (payment.status === PaymentRecordStatus.SUCCESS) return { outcome: 'already_applied' };
    const order = await manager.findOne(Order, { where: { id: payment.orderId } });
    if (!order) throw new NotFoundException(`Order ${payment.orderId} not found`);
    const ref = `#${order.id.slice(0, 8)}`;

    const expectedKobo = Math.round(order.totalAmount * 100);
    if (amountKobo !== expectedKobo) {
      payment.status = PaymentRecordStatus.FAILED;
      await manager.getRepository(Payment).save(payment);
      const message = `Paystack amount ${amountKobo} does not match order total ${expectedKobo} (no part-payments)`;
      await this.recordStatusEvent(
        manager,
        order,
        PAYMENT_EXCEPTION_EVENT,
        `Paystack charge ${reference} rejected: ${message}`,
      );
      return {
        outcome: 'amount_mismatch',
        alert: {
          order,
          type: PAYMENT_EXCEPTION_EVENT,
          message: `Order ${ref}: ${message}. Payment marked failed — check the charge in Paystack and refund it.`,
        },
      };
    }
    if (
      order.paymentStatus !== PaymentStatus.UNPAID ||
      order.status !== OrderStatus.AWAITING_PAYMENT
    ) {
      // Money was captured, but the order was settled another way (or refunded) first.
      payment.status = PaymentRecordStatus.SUCCESS;
      await manager.getRepository(Payment).save(payment);
      await this.recordStatusEvent(
        manager,
        order,
        PAYMENT_EXCEPTION_EVENT,
        `Duplicate Paystack charge ${reference} captured after the order was ${order.paymentStatus} — refund required`,
      );
      return {
        outcome: 'duplicate_charge',
        alert: {
          order,
          type: PAYMENT_EXCEPTION_EVENT,
          message: `Order ${ref} was already ${order.paymentStatus} when Paystack captured ${reference} for ${order.totalAmount}. Refund the duplicate charge in Paystack.`,
        },
      };
    }
    const applied = await this.applyPayment(
      manager,
      order.id,
      PaymentMethod.PAYSTACK,
      order.totalAmount,
      null,
      payment,
    );
    return { outcome: 'applied', applied };
  }

  /** Staff move orders through the forward-only tracking flow; DELIVERED stamps deliveredAt. */
  async updateStatus(
    orderId: string,
    status: OrderStatus,
    note: string | undefined,
    actor: AuthenticatedUser,
  ): Promise<Order> {
    const access = await this.effectiveAccess(actor);
    if (ACCESS_RANK[access] < ACCESS_RANK[AccessLevel.FULL]) {
      throw new ForbiddenException('Updating order status requires full order access');
    }
    const order = await this.getOrderOrThrow(orderId);
    if (order.status === OrderStatus.STOCK_EXCEPTION || order.status === OrderStatus.CANCELLED) {
      throw new ConflictException(
        `Order is ${order.status.replace('_', ' ')} — resolve it through allocate/refund, not the tracking flow`,
      );
    }
    if (status === OrderStatus.RETURNED) {
      throw new BadRequestException('RETURNED is set by the returns workflow, not directly');
    }
    const from = STATUS_FLOW.indexOf(order.status);
    const to = STATUS_FLOW.indexOf(status);
    if (to <= from) {
      throw new ConflictException(`Cannot move order from '${order.status}' to '${status}'`);
    }
    if (order.paymentStatus !== PaymentStatus.PAID) {
      throw new ForbiddenException(
        'Order must be fully paid before it progresses (no part-payments)',
      );
    }
    order.status = status;
    if (status === OrderStatus.DELIVERED) order.deliveredAt = new Date();
    const saved = await this.orderRepo.save(order);
    await this.eventRepo.save(this.eventRepo.create({ order: saved, status, note: note ?? null }));
    this.orderStatusBus.emit(saved.id, status);
    // Fire-and-forget: notifications never block or fail the status change.
    void this.notificationsService.onOrderStatusChange(
      order.customer?.id ?? null,
      order.id,
      status,
    );
    return saved;
  }

  /** Re-place a previous order: same items, repriced at current prices/tier. */
  async reorder(orderId: string, user: AuthenticatedUser): Promise<Order> {
    const previous = await this.findById(orderId, user);
    if (previous.customer?.id !== user.id) {
      throw new ForbiddenException('Only the ordering customer can reorder');
    }
    return this.create(
      {
        items: previous.items.map((i) => ({ variantId: i.variant.id, quantity: i.quantity })),
      },
      user,
    );
  }

  /**
   * Where Paystack should send the customer back to. Built server-side from
   * configuration rather than accepted from the client, so a caller cannot turn
   * it into an open redirect to a hostile host. Returns null when no base is
   * configured, which leaves Paystack's own success page in place.
   */
  private paystackCallbackUrl(orderId: string): string | null {
    // Coerced, not assumed: a misconfigured or stubbed ConfigService can hand
    // back something that is not a string, and this must never be the reason a
    // payment fails to start.
    const raw = this.config.get<string>('paystack.callbackUrlBase');
    const base = typeof raw === 'string' ? raw.trim() : '';
    if (!base) return null;
    const trimmed = base.replace(/\/+$/, '');
    return `${trimmed}/${encodeURIComponent(orderId)}`;
  }

  /**
   * Fulfilment staging before dispatch: shipping address, gross weight,
   * pallet reference and optional QR stencil generation (appendix 04/05).
   */
  async fulfilment(
    orderId: string,
    dto: OrderFulfilmentDto,
    actor: AuthenticatedUser,
  ): Promise<Order> {
    const access = await this.effectiveAccess(actor);
    if (ACCESS_RANK[access] < ACCESS_RANK[AccessLevel.FULL]) {
      throw new ForbiddenException('Fulfilment requires full order access');
    }
    const order = await this.getOrderOrThrow(orderId);
    if (dto.shippingAddress !== undefined) order.shippingAddress = dto.shippingAddress;
    if (dto.deliveryNote !== undefined) order.deliveryNote = dto.deliveryNote;
    if (dto.grossWeightKg !== undefined) order.grossWeightKg = dto.grossWeightKg;
    if (dto.palletRef !== undefined) order.palletRef = dto.palletRef;
    if (dto.generateQrStencil) {
      order.qrStencilRef = `OQR-${randomBytes(4).toString('hex').toUpperCase()}`;
    }
    return this.orderRepo.save(order);
  }

  /**
   * Tracking timeline.
   *
   * The audience is derived here from the caller's own effective access and
   * nothing else. There is deliberately no query, body or header input: a
   * customer cannot ask for the staff shape by sending `?audience=staff`,
   * because no such parameter is ever read.
   *
   * Customers get the confirmed progression only — a stock exception is an
   * internal fulfilment state, so it reads as ORDER_RECEIVED, and delivery
   * detail is reduced to what is safe to show. Staff, who have at least VIEW
   * access across the module, get the full leg including corridor checkpoints
   * and driver contact.
   */
  async tracking(
    orderId: string,
    user?: AuthenticatedUser,
    rawToken?: string,
  ): Promise<OrderTracking> {
    // A tracking token authenticates, it does not choose a shape: whoever opens
    // a guest link is a customer, even if they happen to be signed in as staff
    // in another tab. Only a caller the permission matrix says is staff gets the
    // staff projection, so there is still nothing a client can send to widen it.
    const viaToken = !user && !!rawToken;
    if (!user && !rawToken) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }
    const order = viaToken
      ? await this.orderForToken(orderId, rawToken!)
      : await this.findById(orderId, user!);
    const events = await this.eventRepo.find({
      where: { order: { id: orderId } },
      order: { createdAt: 'ASC' },
    });
    const legs = await this.legRepo.find({
      where: { order: { id: orderId } },
      order: { legNumber: 'ASC' },
    });
    const audience: TrackingAudience = viaToken ? 'customer' : await this.trackingAudience(user!);
    if (audience === 'staff') {
      return {
        status: order.status,
        deliveredAt: order.deliveredAt,
        events,
        deliveries: legs.map(toStaffLeg),
      };
    }
    const internal: string[] = [OrderStatus.STOCK_EXCEPTION, PAYMENT_EXCEPTION_EVENT];
    // The customer projection reports AWAITING_STOCK, never stock_exception.
    //
    // stock_exception is on the internal list because the raw value plus its
    // staff note ("Paid; stock short: TEE-BLK-M x2") is internal wording. But
    // hiding the state itself left a paid buyer staring at a frozen
    // order_received: the order was unfulfillable and the tracker said
    // everything was fine. A wholesale buyer who paid 1.85M for 20 made-to-order
    // units has no other signal, so the state is surfaced under a name that is
    // honest and free of internal detail. The staff projection above is
    // untouched and still reports stock_exception.
    const customerStatus =
      order.status === OrderStatus.STOCK_EXCEPTION ? CUSTOMER_AWAITING_STOCK : order.status;
    return {
      status: customerStatus,
      deliveredAt: order.deliveredAt,
      // Only the status and the timestamp. `note` is staff-authored free text -
      // PATCH /orders/:id/status accepts an optional note, so a future caller
      // could put anything there, and today it already carries lines like
      // "Paid; stock short: TEE-BLK-M x2" that are not the buyer's business.
      //
      // A stock_exception event is dropped like any other internal status, but
      // the current status above already says awaiting_stock. Rewriting the
      // event to awaiting_stock as well would put the buyer's timeline out of
      // order against itself: an awaiting_stock entry dated before the status
      // was set reads as a state the order was never in.
      events: events
        .filter((e) => !internal.includes(e.status))
        .map((e) => ({ status: e.status, createdAt: e.createdAt })),
      deliveries: legs.map(toCustomerLeg),
    };
  }

  /**
   * Staff see delivery internals; everyone else is treated as a customer.
   * Access is resolved from the role's permission matrix, not from the request.
   */
  private async trackingAudience(user: AuthenticatedUser): Promise<TrackingAudience> {
    if (user.role === RoleName.CUSTOMER) return 'customer';
    const access = await this.effectiveAccess(user);
    return ACCESS_RANK[access] >= ACCESS_RANK[AccessLevel.VIEW] ? 'staff' : 'customer';
  }

  /**
   * Stock exception, staff action: retry the short lines against current stock
   * (a completed production batch lands there). Lines still short stay short.
   */
  async allocateStockException(orderId: string, actor: AuthenticatedUser): Promise<Order> {
    const access = await this.effectiveAccess(actor);
    if (ACCESS_RANK[access] < ACCESS_RANK[AccessLevel.FULL]) {
      throw new ForbiddenException('Allocating stock requires full order access');
    }
    return this.dataSource.transaction(async (manager) => {
      const order = await this.lockStockException(manager, orderId);
      // Lock every line's item up front, in the ledger's sorted order, so two
      // multi-line orders sharing items cannot deadlock (see InventoryService.lockItems).
      await this.inventoryService.lockItems(manager, this.ledgerItems(order));
      const stillShort: string[] = [];
      for (const item of order.items) {
        if (item.shortfall <= 0) continue;
        if (await this.allocateLine(manager, order, item, item.shortfall, actor.id)) {
          item.shortfall = 0;
        } else {
          stillShort.push(`${item.variant.sku} ×${item.shortfall}`);
        }
      }
      if (stillShort.length === 0) order.status = OrderStatus.ORDER_RECEIVED;
      const saved = await manager.getRepository(Order).save(order);
      await this.recordStatusEvent(
        manager,
        saved,
        saved.status,
        stillShort.length === 0
          ? 'Stock allocated from production'
          : `Still short: ${stillShort.join(', ')}`,
      );
      // Tell the buyer. refundStockException() notifies but this did not, so a
      // successful allocation reached the customer as silence: their tracker
      // sat on awaiting_stock with no indication anyone had acted. Only when
      // every line is covered -- a partial allocation leaves the order in
      // STOCK_EXCEPTION and re-notifying on each retry would be noise.
      if (stillShort.length === 0) {
        await this.notifyCustomer(saved, OrderStatus.ORDER_RECEIVED);
      }
      return saved;
    });
  }

  /**
   * Stock exception, staff action: release units already allocated back to
   * stock, record the refund in the accounting ledger and close the order as
   * CANCELLED / REFUNDED. This records the decision; the money itself goes back
   * to the customer through Paystack (or the cash desk) by staff.
   */
  async refundStockException(orderId: string, actor: AuthenticatedUser): Promise<Order> {
    const paymentsAccess = await this.permissionsService.getAccessLevel(
      actor.role,
      ModuleName.PAYMENTS,
    );
    if (ACCESS_RANK[paymentsAccess] < ACCESS_RANK[AccessLevel.FULL]) {
      throw new ForbiddenException('Refunding requires full payments access');
    }
    const saved = await this.dataSource.transaction(async (manager) => {
      const order = await this.lockStockException(manager, orderId);
      // Sorted up-front lock: same rule as every multi-item ledger writer.
      await this.inventoryService.lockItems(manager, this.ledgerItems(order));
      for (const item of order.items) {
        const allocated = item.quantity - item.shortfall;
        if (allocated <= 0) continue;
        await this.inventoryService.record(
          {
            itemType: InventoryItemType.VARIANT,
            itemId: item.variant.id,
            movementType: MovementType.ADJUSTMENT,
            quantityDelta: allocated,
            actorId: actor.id,
            referenceId: order.id,
          },
          manager,
        );
        item.shortfall = item.quantity;
      }
      order.status = OrderStatus.CANCELLED;
      order.paymentStatus = PaymentStatus.REFUNDED;
      const result = await manager.getRepository(Order).save(order);
      await this.recordStatusEvent(
        manager,
        result,
        OrderStatus.CANCELLED,
        'Refunded — stock exception',
      );
      await this.accountingService.record(
        {
          type: LedgerEntryType.EXPENSE,
          amount: order.totalAmount,
          category: `${order.channel}_refund`,
          referenceId: order.id,
          recordedBy: actor.id,
        },
        manager,
      );
      return result;
    });
    await this.notifyCustomer(saved, OrderStatus.CANCELLED);
    return saved;
  }

  /**
   * Customer notification for a status change. Never throws: a failed
   * notification must not roll back a paid order or a stock movement.
   */
  private async notifyCustomer(order: Order, status: string): Promise<void> {
    try {
      await this.notificationsService.onOrderStatusChange(order.customer?.id ?? null, order.id, status);
    } catch (err) {
      this.logger.warn(
        `Customer notification failed for order ${order.id}: ${(err as Error).message}`,
      );
    }
  }

  // --- internals ---

  /**
   * One SALE movement for `units` of a line, through the ledger. False when the
   * ledger refuses for insufficient stock (nothing written — the guard is never
   * bypassed); any other error propagates so the caller's transaction rolls back.
   */
  private async allocateLine(
    manager: EntityManager,
    order: Order,
    item: OrderItem,
    units: number,
    actorId: string | null,
  ): Promise<boolean> {
    try {
      await this.inventoryService.record(
        {
          itemType: InventoryItemType.VARIANT,
          itemId: item.variant.id,
          movementType: MovementType.SALE,
          quantityDelta: -units,
          actorId,
          referenceId: order.id,
        },
        manager,
      );
      return true;
    } catch (err) {
      if (err instanceof InsufficientStockException) return false;
      throw err;
    }
  }

  private async recordStatusEvent(
    manager: EntityManager,
    order: Order,
    status: string,
    note: string,
  ): Promise<void> {
    const events = manager.getRepository(OrderStatusEvent);
    await events.save(events.create({ order, status, note }));
    // Inside the transaction: a subscriber may re-fetch before commit and see
    // the old status, but it re-reads on the next tick, so the notification is
    // never wrong for long and cannot break the write.
    this.orderStatusBus.emit(order.id, status);
  }

  /** The ledger items an order's lines touch — the set a multi-line writer locks up front. */
  private ledgerItems(order: Order): LedgerItem[] {
    return order.items.map((i) => ({ itemType: InventoryItemType.VARIANT, itemId: i.variant.id }));
  }

  /** Row-lock an order that must be in STOCK_EXCEPTION, then return it with relations. */
  private async lockStockException(manager: EntityManager, orderId: string): Promise<Order> {
    const locked = await manager.findOne(Order, {
      where: { id: orderId },
      lock: { mode: 'pessimistic_write' },
      loadEagerRelations: false,
    });
    if (!locked) throw new NotFoundException(`Order ${orderId} not found`);
    if (locked.status !== OrderStatus.STOCK_EXCEPTION) {
      throw new ConflictException(
        `Order ${orderId} is not in stock exception (status '${locked.status}')`,
      );
    }
    const order = await manager.findOne(Order, { where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);
    return order;
  }

  private async getOrderOrThrow(id: string): Promise<Order> {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    return order;
  }

  private assertPayable(order: Order, amount: number): void {
    if (order.paymentStatus === PaymentStatus.PAID) {
      throw new ConflictException(`Order ${order.id} is already paid`);
    }
    // Full payment upfront — the amount must equal the order total exactly.
    if (Math.round(amount * 100) !== Math.round(order.totalAmount * 100)) {
      throw new BadRequestException(
        `No part-payments: amount must equal the order total (${order.totalAmount})`,
      );
    }
  }

  /**
   * Where Paystack sends the charge receipt. The order customer's own address
   * by default; an override exists because seeded accounts sit on the reserved
   * `.test` TLD that Paystack's validator rejects, so local and CI runs have
   * to supply a real inbox. Rejected outside non-production so a live charge
   * can never be redirected away from the customer.
   */
  private resolvePaystackEmail(fallback: string, override?: string): string {
    if (override) {
      if (!this.config.get<boolean>('paystack.emailOverrideAllowed')) {
        throw new ForbiddenException(
          'Paystack email override is not permitted on this environment',
        );
      }
      return override;
    }
    if (!OrdersService.isUndeliverableEmail(fallback)) return fallback;
    // A reserved TLD, which is every seeded account. Paystack rejects these on
    // the *initialise* call, so this used to surface as an opaque 503 from
    // deep inside the SDK with nothing charged and nothing to act on.
    if (!this.config.get<boolean>('paystack.emailOverrideAllowed')) {
      throw new BadRequestException(
        `${fallback} is not a deliverable address, so this charge cannot be receipted. ` +
          'Set PAYSTACK_DEV_INBOX to an inbox you control to run payments locally.',
      );
    }
    const devInbox = this.config.get<string>('paystack.devInbox') ?? '';
    if (!devInbox) {
      throw new BadRequestException(
        `${fallback} is not a deliverable address, so this charge cannot be receipted. ` +
          'Set PAYSTACK_DEV_INBOX to an inbox you control to run payments locally.',
      );
    }
    return devInbox;
  }

  /**
   * True for addresses Paystack will refuse outright: the RFC 2606 reserved TLDs
   * plus RFC 6761's `.invalid` and `.localhost`. Deliberately narrow — an odd
   * but syntactically valid address should still reach Paystack and be judged
   * there, rather than being silently redirected by us.
   */
  private static isUndeliverableEmail(email: string): boolean {
    const domain = email.trim().toLowerCase().split('@').pop() ?? '';
    // The TLD is the last label, not the whole domain: seentair.test ends in
    // `.test` even though the domain string is not equal to it.
    const tld = domain.split('.').pop() ?? '';
    return ['test', 'example', 'invalid', 'localhost'].includes(tld);
  }

  /** Offline path: one transaction, then post-commit notifications. */
  private async completePayment(
    orderId: string,
    method: PaymentMethod,
    amount: number,
    recordedBy: string | null,
  ): Promise<Payment> {
    const outcome = await this.dataSource.transaction((manager) =>
      this.applyPayment(manager, orderId, method, amount, recordedBy, null),
    );
    this.notifyAfterPayment(outcome);
    return outcome.payment;
  }

  /**
   * Payment success, inside the caller's transaction. Locks the order row so a
   * Paystack delivery and an offline record for the same order serialise, then
   * writes what the money movement implies unconditionally: payment row, order
   * PAID + ORDER_RECEIVED + status event, accounting entry. Stock is attempted
   * per line through the ledger; a line the ledger refuses for insufficient
   * stock is recorded as shortfall with no movement (the guard is never
   * bypassed) and the order lands in STOCK_EXCEPTION. Any other error rolls
   * everything back — stock is never edited directly (E2E-critical scenario).
   */
  private async applyPayment(
    manager: EntityManager,
    orderId: string,
    method: PaymentMethod,
    amount: number,
    recordedBy: string | null,
    existingPayment: Payment | null,
  ): Promise<PaymentOutcome> {
    const locked = await manager.findOne(Order, {
      where: { id: orderId },
      lock: { mode: 'pessimistic_write' },
      loadEagerRelations: false,
    });
    if (!locked) throw new NotFoundException(`Order ${orderId} not found`);
    if (
      locked.paymentStatus !== PaymentStatus.UNPAID ||
      locked.status !== OrderStatus.AWAITING_PAYMENT
    ) {
      throw new ConflictException(
        `Order ${orderId} is not awaiting payment (status '${locked.status}', payment '${locked.paymentStatus}')`,
      );
    }
    const order = await manager.findOne(Order, { where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);

    const paymentRepo = manager.getRepository(Payment);
    const payment =
      existingPayment ??
      paymentRepo.create({
        order,
        method,
        amount,
        reference: null,
        recordedBy,
      });
    payment.status = PaymentRecordStatus.SUCCESS;
    const savedPayment = await paymentRepo.save(payment);

    order.paymentStatus = PaymentStatus.PAID;
    order.status = OrderStatus.ORDER_RECEIVED;
    const actorId = recordedBy ?? order.customer?.id ?? null;
    // Lock every line's item up front, in the ledger's sorted order, so two
    // multi-line orders sharing items cannot deadlock (see InventoryService.lockItems).
    await this.inventoryService.lockItems(manager, this.ledgerItems(order));
    const short: string[] = [];
    for (const item of order.items) {
      if (await this.allocateLine(manager, order, item, item.quantity, actorId)) {
        item.shortfall = 0;
      } else {
        item.shortfall = item.quantity;
        short.push(`${item.variant.sku} ×${item.quantity}`);
      }
    }
    if (short.length > 0) order.status = OrderStatus.STOCK_EXCEPTION;
    await manager.getRepository(Order).save(order);

    await this.recordStatusEvent(
      manager,
      order,
      OrderStatus.ORDER_RECEIVED,
      `Paid in full via ${method}`,
    );
    if (short.length > 0) {
      await this.recordStatusEvent(
        manager,
        order,
        OrderStatus.STOCK_EXCEPTION,
        `Paid; stock short: ${short.join(', ')}`,
      );
    }
    // Every sale lands in the accounting ledger automatically.
    await this.accountingService.record(
      {
        type: LedgerEntryType.SALE,
        amount,
        category: `${order.channel}_sale`,
        referenceId: order.id,
        recordedBy,
      },
      manager,
    );
    return { payment: savedPayment, order, short };
  }

  /**
   * A guest's only durable route back to their order. Issues a fresh tracking
   * token rather than reusing the creation one, which the server never kept.
   * Never throws: the payment is already committed and must not be undone by a
   * mail failure.
   */
  private async emailGuestConfirmation(order: Order): Promise<void> {
    if (!order.guestEmail) return;
    try {
      const token = await this.issueTrackingToken(order.id);
      const base = this.config.get<string>('mail.orderUrlBase') ?? '';
      await this.notificationsService.sendGuestOrderConfirmation({
        email: order.guestEmail,
        name: order.guestName,
        orderId: order.id,
        totalAmount: order.totalAmount,
        trackingUrl: `${base}/${order.id}?token=${token}`,
      });
    } catch (err) {
      this.logger.warn(
        `Guest confirmation for order ${order.id} could not be sent: ${(err as Error).message}`,
      );
    }
  }

  /** Post-commit only: notifications never run inside the transaction. */
  private notifyAfterPayment({ order, short }: PaymentOutcome): void {
    void this.notificationsService.onOrderStatusChange(
      order.customer?.id ?? null,
      order.id,
      OrderStatus.ORDER_RECEIVED,
    );
    // In-platform notifications need an account, so a guest would otherwise
    // hear nothing at all about the order they just paid for.
    void this.emailGuestConfirmation(order);
    if (short.length > 0) {
      void this.alertStaff({
        order,
        type: 'stock_exception',
        message: `Order #${order.id.slice(0, 8)} is paid but short on stock (${short.join(', ')}). Allocate from production or refund.`,
      });
    }
  }

  /** In-platform alert to the roles that act on payment and stock problems; never throws. */
  private async alertStaff({ order, type, message }: StaffAlert): Promise<void> {
    try {
      const staff = await this.usersService.findByRoles(PAYMENT_ATTENTION_ROLES);
      await Promise.all(
        staff.map((u) =>
          this.notificationsService.notifyInPlatform({
            recipientId: u.id,
            type,
            message,
            relatedOrderId: order.id,
          }),
        ),
      );
    } catch (err) {
      this.logger.warn(
        `Staff alert (${type}) failed for order ${order.id}: ${(err as Error).message}`,
      );
    }
  }
}
