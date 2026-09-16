import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ACCESS_RANK, AccessLevel, ModuleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { InventoryItemType, MovementType } from '../inventory/inventory-movement.entity';
import { InventoryService } from '../inventory/inventory.service';
import { OrderStatusEvent } from '../orders/entities/order-status-event.entity';
import { Order, OrderChannel, OrderStatus } from '../orders/entities/order.entity';
import { PermissionsService } from '../users/permissions.service';
import { CreateReturnDto } from './dto/create-return.dto';
import { ResolveReturnDto } from './dto/resolve-return.dto';
import { ReturnRequest, ReturnStatus } from './return-request.entity';

@Injectable()
export class ReturnsService {
  constructor(
    @InjectRepository(ReturnRequest) private readonly returnRepo: Repository<ReturnRequest>,
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    private readonly inventoryService: InventoryService,
    private readonly permissionsService: PermissionsService,
    private readonly config: ConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  private get requestWindowMs(): number {
    return (this.config.get<number>('returns.requestWindowHours') ?? 12) * 3_600_000;
  }

  private get completionWindowMs(): number {
    return (this.config.get<number>('returns.completionWindowHours') ?? 24) * 3_600_000;
  }

  /** Customer raises a return on their own delivered order, inside the 12h window. */
  async create(dto: CreateReturnDto, user: AuthenticatedUser): Promise<ReturnRequest> {
    const order = await this.orderRepo.findOne({ where: { id: dto.orderId } });
    if (!order) throw new NotFoundException(`Order ${dto.orderId} not found`);
    if (order.customer?.id !== user.id) {
      throw new ForbiddenException('Only the ordering customer can request a return');
    }
    // Eligibility: any product EXCEPT custom/special orders (appendix 10).
    if (order.channel === OrderChannel.CUSTOM) {
      throw new ForbiddenException('Custom/special design orders cannot be returned');
    }
    if (order.status !== OrderStatus.DELIVERED || !order.deliveredAt) {
      throw new BadRequestException('Returns can only be requested after delivery');
    }
    // The 12-hour request window, enforced server-side.
    const elapsed = Date.now() - order.deliveredAt.getTime();
    if (elapsed > this.requestWindowMs) {
      throw new ForbiddenException(
        `Return window closed: requests must be raised within ${
          this.requestWindowMs / 3_600_000
        } hours of delivery`,
      );
    }
    const item = order.items.find((i) => i.variant.id === dto.variantId);
    if (!item) throw new BadRequestException('That product is not part of this order');
    const quantity = dto.quantity ?? item.quantity;
    if (quantity > item.quantity) {
      throw new BadRequestException(
        `Cannot return ${quantity}; only ${item.quantity} were ordered`,
      );
    }
    const existing = await this.returnRepo.findOne({
      where: { order: { id: order.id }, variant: { id: dto.variantId } },
    });
    if (existing) {
      throw new ConflictException('A return for this order item already exists');
    }

    return this.returnRepo.save(
      this.returnRepo.create({
        order,
        variant: item.variant,
        quantity,
        reason: dto.reason,
        returnDeadline: new Date(Date.now() + this.completionWindowMs),
        trackingNumber: dto.trackingNumber ?? null,
        status: ReturnStatus.REQUESTED,
      }),
    );
  }

  /** Staff see all; customers see their own. */
  async findAll(
    user: AuthenticatedUser,
    page = 1,
    limit = 20,
  ): Promise<{ data: ReturnRequest[]; total: number }> {
    const access = await this.permissionsService.getAccessLevel(user.role, ModuleName.RETURNS);
    if (ACCESS_RANK[access] < ACCESS_RANK[AccessLevel.OWN]) {
      throw new ForbiddenException('No returns access');
    }
    const where =
      access === AccessLevel.OWN ? { order: { customer: { id: user.id } } } : {};
    const [data, total] = await this.returnRepo.findAndCount({
      where,
      order: { requestedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total };
  }

  /**
   * Staff resolve the return. Disposition drives stock (appendix 10):
   * restocked → RETURN movement back into the ledger; damaged → written
   * off, no stock movement. The order is marked RETURNED with an event.
   */
  async resolve(
    id: string,
    dto: ResolveReturnDto,
    actor: AuthenticatedUser,
  ): Promise<ReturnRequest> {
    const request = await this.returnRepo.findOne({ where: { id } });
    if (!request) throw new NotFoundException(`Return request ${id} not found`);
    if (request.status !== ReturnStatus.REQUESTED) {
      throw new ConflictException(`Return request ${id} is already ${request.status}`);
    }
    if (dto.decision === 'resolved') {
      const restocked = dto.restocked ?? false;
      const damaged = dto.damaged ?? false;
      if (restocked === damaged) {
        throw new BadRequestException(
          'Exactly one of restocked or damaged must be true when resolving a return',
        );
      }
      return this.dataSource.transaction(async (manager) => {
        request.status = ReturnStatus.RESOLVED;
        request.resolution = dto.resolution;
        request.restocked = restocked;
        request.damaged = damaged;
        request.trackingNumber = dto.trackingNumber ?? request.trackingNumber;
        request.resolvedBy = actor.id;
        request.resolvedAt = new Date();
        const saved = await manager.getRepository(ReturnRequest).save(request);

        if (restocked) {
          await this.inventoryService.record(
            {
              itemType: InventoryItemType.VARIANT,
              itemId: request.variant.id,
              movementType: MovementType.RETURN,
              quantityDelta: request.quantity,
              actorId: actor.id,
              referenceId: request.id,
            },
            manager,
          );
        }

        const order = request.order;
        order.status = OrderStatus.RETURNED;
        await manager.getRepository(Order).save(order);
        await manager.getRepository(OrderStatusEvent).save(
          manager.getRepository(OrderStatusEvent).create({
            order,
            status: OrderStatus.RETURNED,
            note: `Return resolved: ${dto.resolution} (${restocked ? 'restocked' : 'damaged'})`,
          }),
        );
        return saved;
      });
    }

    request.status = ReturnStatus.REJECTED;
    request.resolution = dto.resolution;
    request.resolvedBy = actor.id;
    request.resolvedAt = new Date();
    return this.returnRepo.save(request);
  }
}
