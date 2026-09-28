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
import { randomBytes, randomUUID } from 'crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ACCESS_RANK, AccessLevel, ModuleName, RoleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { CatalogueService } from '../catalogue/catalogue.service';
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
import { OrderFulfilmentDto } from './dto/order-fulfilment.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
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

/** One leg of a multi-leg delivery, as a customer is allowed to see it. */
export interface CustomerDeliveryLeg {
  legNumber: number;
  carrier: string;
  status: DeliveryLegStatus;
  trackingRef: string | null;
  zone: string | null;
  driverName: string | null;
  /** Corridor's live checkpoints: [{ zone, status, note, at }]. */
  checkpoints: Array<Record<string, unknown>>;
}

export interface OrderTracking {
  status: OrderStatus;
  deliveredAt: Date | null;
  events: OrderStatusEvent[];
  deliveries: CustomerDeliveryLeg[];
}

/** DeliveryLeg is loaded `eager: true` with its order, so it must never reach a
 *  customer as an entity — project to CustomerDeliveryLeg instead. `cost`,
 *  `contents`, `createdBy`, `driverPhone` and the internal `sealId` stay
 *  staff-side. */
export function toCustomerLeg(leg: DeliveryLeg): CustomerDeliveryLeg {
  const raw = Array.isArray(leg.checkpoints) ? (leg.checkpoints as Array<unknown>) : [];
  return {
    legNumber: leg.legNumber,
    carrier: leg.carrier,
    status: leg.status,
    trackingRef: leg.trackingRef,
    zone: leg.zone,
    driverName: leg.driverName,
    checkpoints: raw
      .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
      .map(({ zone, status, note, ...rest }) => ({
        zone,
        status,
        note,
        // The writer stamps `timestamp`; the entity doc says `at`. Accept both
        // so an older leg's checkpoints don't render with no time.
        at: rest.timestamp ?? rest.at ?? null,
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

  async create(dto: CreateOrderDto, user: AuthenticatedUser): Promise<Order> {
    const access = await this.effectiveAccess(user);
    if (ACCESS_RANK[access] < ACCESS_RANK[AccessLevel.OWN]) {
      throw new ForbiddenException('No order access');
    }

    // Channel derives from where the order was placed (source tag), with a
    // role fallback for programmatic/staff calls. Each portal tags its own
    // source, so a wholesaler-role account buying on the retail storefront
    // still gets a RETAIL (retail-priced) order instead of a wholesale order.
    let channel: OrderChannel;
    let customerId: string | null = user.id;
    let tierDiscountTier = null as
      import('../wholesale/entities/price-tier.entity').PriceTier | null;
    const shopFromRetail = user.role === RoleName.CUSTOMER || dto.source === 'storefront';
    const shopFromWholesale =
      !shopFromRetail && (user.role === RoleName.WHOLESALER || dto.source === 'wholesale_portal');

    if (shopFromRetail) {
      channel = OrderChannel.RETAIL;
    } else if (shopFromWholesale) {
      channel = OrderChannel.WHOLESALE;
      // Wholesale gate: approved account + MOQ (appendix 06).
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

    // Price items from the catalogue and soft-check stock availability.
    const items: OrderItem[] = [];
    let total = 0;
    for (const itemDto of dto.items) {
      const variant = await this.catalogueService.findVariantById(itemDto.variantId);
      const available = await this.inventoryService.currentQuantity(
        InventoryItemType.VARIANT,
        variant.id,
      );
      if (available < itemDto.quantity) {
        throw new BadRequestException(
          `Insufficient stock for ${variant.sku}: ${available} available, ${itemDto.quantity} requested`,
        );
      }
      const retailPrice = variant.priceOverride ?? variant.product.basePrice;
      const unitPrice =
        channel === OrderChannel.WHOLESALE
          ? this.wholesaleService.applyTierPrice(retailPrice, tierDiscountTier)
          : retailPrice;
      const item = new OrderItem();
      item.variant = variant;
      item.quantity = itemDto.quantity;
      item.unitPrice = unitPrice;
      items.push(item);
      total += unitPrice * itemDto.quantity;
    }

    const order = this.orderRepo.create({
      customer: customerId ? await this.usersService.findById(customerId) : null,
      channel,
      source: dto.source ?? null,
      shippingAddress: dto.shippingAddress ?? null,
      status: OrderStatus.AWAITING_PAYMENT,
      paymentStatus: PaymentStatus.UNPAID,
      totalAmount: Math.round(total * 100) / 100,
      items,
    });
    return this.orderRepo.save(order);
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

  async findById(id: string, user: AuthenticatedUser): Promise<Order> {
    const order = await this.orderRepo.findOne({ where: { id } });
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

  /** Start a Paystack payment for the caller's own (or staff-managed) order. */
  async initPaystackPayment(
    orderId: string,
    user: AuthenticatedUser,
    emailOverride?: string,
  ): Promise<{ authorizationUrl: string; reference: string }> {
    const order = await this.findById(orderId, user);
    this.assertPayable(order, order.totalAmount);
    const email = this.resolvePaystackEmail(order.customer?.email ?? user.email, emailOverride);
    const reference = `seentair-${order.id}-${randomUUID().slice(0, 8)}`;
    const init = await this.paystackService.initializeTransaction(
      email,
      order.totalAmount,
      reference,
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
   * Tracking timeline. Customers see the confirmed progression only: a stock
   * exception is an internal fulfilment state, so it reads as ORDER_RECEIVED
   * and internal notes are omitted; staff see everything.
   */
  async tracking(orderId: string, user: AuthenticatedUser): Promise<OrderTracking> {
    const order = await this.findById(orderId, user);
    const events = await this.eventRepo.find({
      where: { order: { id: orderId } },
      order: { createdAt: 'ASC' },
    });
    const legs = await this.legRepo.find({
      where: { order: { id: orderId } },
      order: { legNumber: 'ASC' },
    });
    if (user.role !== RoleName.CUSTOMER) {
      return {
        status: order.status,
        deliveredAt: order.deliveredAt,
        events,
        deliveries: legs.map(toCustomerLeg),
      };
    }
    const internal: string[] = [OrderStatus.STOCK_EXCEPTION, PAYMENT_EXCEPTION_EVENT];
    return {
      status:
        order.status === OrderStatus.STOCK_EXCEPTION ? OrderStatus.ORDER_RECEIVED : order.status,
      deliveredAt: order.deliveredAt,
      events: events.filter((e) => !internal.includes(e.status)),
      deliveries: legs.map(toCustomerLeg),
    };
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
    void this.notificationsService.onOrderStatusChange(
      saved.customer?.id ?? null,
      saved.id,
      OrderStatus.CANCELLED,
    );
    return saved;
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
    if (!override) return fallback;
    if (!this.config.get<boolean>('paystack.emailOverrideAllowed')) {
      throw new ForbiddenException('Paystack email override is not permitted on this environment');
    }
    return override;
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

  /** Post-commit only: notifications never run inside the transaction. */
  private notifyAfterPayment({ order, short }: PaymentOutcome): void {
    void this.notificationsService.onOrderStatusChange(
      order.customer?.id ?? null,
      order.id,
      OrderStatus.ORDER_RECEIVED,
    );
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
