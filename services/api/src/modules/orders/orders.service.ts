import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { ACCESS_RANK, AccessLevel, ModuleName, RoleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { CatalogueService } from '../catalogue/catalogue.service';
import { InventoryItemType, MovementType } from '../inventory/inventory-movement.entity';
import { InventoryService } from '../inventory/inventory.service';
import { PermissionsService } from '../users/permissions.service';
import { UsersService } from '../users/users.service';
import { WholesaleService } from '../wholesale/wholesale.service';
import { AccountingService } from '../accounting/accounting.service';
import { LedgerEntryType } from '../accounting/ledger-entry.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { OrderItem } from './entities/order-item.entity';
import { OrderStatusEvent } from './entities/order-status-event.entity';
import { Order, OrderChannel, OrderStatus, PaymentStatus } from './entities/order.entity';
import { Payment, PaymentMethod, PaymentRecordStatus } from './entities/payment.entity';
import { PaystackService } from './paystack.service';

/** Forward-only customer-facing progression (appendix 09). RETURNED is set by the returns flow (Phase 5). */
const STATUS_FLOW: OrderStatus[] = [
  OrderStatus.AWAITING_PAYMENT,
  OrderStatus.ORDER_RECEIVED,
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
];

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(OrderStatusEvent)
    private readonly eventRepo: Repository<OrderStatusEvent>,
    private readonly catalogueService: CatalogueService,
    private readonly inventoryService: InventoryService,
    private readonly permissionsService: PermissionsService,
    private readonly usersService: UsersService,
    private readonly paystackService: PaystackService,
    private readonly wholesaleService: WholesaleService,
    private readonly accountingService: AccountingService,
    private readonly notificationsService: NotificationsService,
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

    // Channel and customer derive from the caller's role.
    let channel: OrderChannel;
    let customerId: string | null = user.id;
    let tierDiscountTier = null as import('../wholesale/entities/price-tier.entity').PriceTier | null;
    if (user.role === RoleName.CUSTOMER) {
      channel = OrderChannel.RETAIL;
    } else if (user.role === RoleName.WHOLESALER) {
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
    return this.completePayment(order, dto.method, dto.amount, actor.id, null);
  }

  /** Start a Paystack payment for the caller's own (or staff-managed) order. */
  async initPaystackPayment(
    orderId: string,
    user: AuthenticatedUser,
  ): Promise<{ authorizationUrl: string; reference: string }> {
    const order = await this.findById(orderId, user);
    this.assertPayable(order, order.totalAmount);
    const reference = `seentair-${order.id}-${randomUUID().slice(0, 8)}`;
    const email = order.customer?.email ?? user.email;
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

  /** Called by the verified Paystack webhook on charge.success. */
  async confirmPaystackPayment(reference: string, amountKobo: number): Promise<void> {
    const payment = await this.paymentRepo.findOne({
      where: { reference },
      relations: { order: { customer: true, items: { variant: true } } },
    });
    if (!payment) throw new NotFoundException(`No payment with reference ${reference}`);
    if (payment.status === PaymentRecordStatus.SUCCESS) return; // idempotent
    const order = payment.order;
    const expectedKobo = Math.round(order.totalAmount * 100);
    if (amountKobo !== expectedKobo) {
      payment.status = PaymentRecordStatus.FAILED;
      await this.paymentRepo.save(payment);
      throw new BadRequestException(
        `Paystack amount ${amountKobo} does not match order total ${expectedKobo} (no part-payments)`,
      );
    }
    await this.completePayment(order, PaymentMethod.PAYSTACK, order.totalAmount, null, payment);
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
    if (status === OrderStatus.RETURNED) {
      throw new BadRequestException('RETURNED is set by the returns workflow, not directly');
    }
    const from = STATUS_FLOW.indexOf(order.status);
    const to = STATUS_FLOW.indexOf(status);
    if (to <= from) {
      throw new ConflictException(`Cannot move order from '${order.status}' to '${status}'`);
    }
    if (order.paymentStatus !== PaymentStatus.PAID) {
      throw new ForbiddenException('Order must be fully paid before it progresses (no part-payments)');
    }
    order.status = status;
    if (status === OrderStatus.DELIVERED) order.deliveredAt = new Date();
    const saved = await this.orderRepo.save(order);
    await this.eventRepo.save(
      this.eventRepo.create({ order: saved, status, note: note ?? null }),
    );
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

  /** Customer-visible tracking timeline. */
  async tracking(
    orderId: string,
    user: AuthenticatedUser,
  ): Promise<{ status: OrderStatus; deliveredAt: Date | null; events: OrderStatusEvent[] }> {
    const order = await this.findById(orderId, user);
    const events = await this.eventRepo.find({
      where: { order: { id: orderId } },
      order: { createdAt: 'ASC' },
    });
    return { status: order.status, deliveredAt: order.deliveredAt, events };
  }

  // --- internals ---

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
   * Payment success in ONE transaction: payment row, order confirmed
   * (ORDER_RECEIVED + event), and a sale movement per item through the
   * ledger — stock is never edited directly (E2E-critical scenario).
   */
  private async completePayment(
    order: Order,
    method: PaymentMethod,
    amount: number,
    recordedBy: string | null,
    existingPayment: Payment | null,
  ): Promise<Payment> {
    return this.dataSource.transaction(async (manager) => {
      const paymentRepo = manager.getRepository(Payment);
      const payment = existingPayment ?? paymentRepo.create({
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
      await manager.getRepository(Order).save(order);
      await manager.getRepository(OrderStatusEvent).save(
        manager.getRepository(OrderStatusEvent).create({
          order,
          status: OrderStatus.ORDER_RECEIVED,
          note: `Paid in full via ${method}`,
        }),
      );

      for (const item of order.items) {
        await this.inventoryService.record(
          {
            itemType: InventoryItemType.VARIANT,
            itemId: item.variant.id,
            movementType: MovementType.SALE,
            quantityDelta: -item.quantity,
            actorId: recordedBy ?? order.customer?.id ?? null,
            referenceId: order.id,
          },
          manager,
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
      return savedPayment;
    }).then((savedPayment) => {
      void this.notificationsService.onOrderStatusChange(
        order.customer?.id ?? null,
        order.id,
        OrderStatus.ORDER_RECEIVED,
      );
      return savedPayment;
    });
  }
}
