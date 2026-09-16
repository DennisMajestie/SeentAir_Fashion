import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ACCESS_RANK, AccessLevel, ModuleName } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import { Order } from '../orders/entities/order.entity';
import { PermissionsService } from '../users/permissions.service';
import { CarrierAdapter } from './carriers/carrier-adapter.interface';
import { GiglAdapter } from './carriers/gigl.adapter';
import { ManualCarrierAdapter } from './carriers/manual.adapter';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto';
import { UpsertPricingDto } from './dto/upsert-pricing.dto';
import { DeliveryLeg, DeliveryLegStatus } from './entities/delivery-leg.entity';
import { DeliveryPricing } from './entities/delivery-pricing.entity';

@Injectable()
export class LogisticsService {
  /** Carrier registry — new carriers slot in here without touching callers. */
  private readonly adapters: Map<string, CarrierAdapter>;

  constructor(
    @InjectRepository(DeliveryLeg) private readonly legRepo: Repository<DeliveryLeg>,
    @InjectRepository(DeliveryPricing)
    private readonly pricingRepo: Repository<DeliveryPricing>,
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    private readonly permissionsService: PermissionsService,
    giglAdapter: GiglAdapter,
    manualAdapter: ManualCarrierAdapter,
  ) {
    this.adapters = new Map([[giglAdapter.key, giglAdapter]]);
    this.fallbackAdapter = manualAdapter;
  }

  private readonly fallbackAdapter: CarrierAdapter;

  async createDelivery(dto: CreateDeliveryDto, actor: AuthenticatedUser): Promise<DeliveryLeg> {
    const order = await this.orderRepo.findOne({ where: { id: dto.orderId } });
    if (!order) throw new NotFoundException(`Order ${dto.orderId} not found`);

    const adapter = this.adapters.get(dto.carrier) ?? this.fallbackAdapter;
    const { trackingRef } = await adapter.createShipment({
      orderId: order.id,
      weightKg: dto.weightKg ?? null,
      zone: dto.zone ?? null,
    });

    const cost =
      dto.zone && dto.weightKg !== undefined
        ? await this.quote(dto.weightKg, dto.zone).then(
            (q) => q.cost,
            () => null, // no pricing row for the zone yet — cost left open
          )
        : null;

    return this.legRepo.save(
      this.legRepo.create({
        order,
        carrier: dto.carrier,
        legNumber: dto.legNumber ?? 1,
        status: DeliveryLegStatus.PENDING,
        trackingRef,
        weightKg: dto.weightKg ?? null,
        zone: dto.zone ?? null,
        cost,
        createdBy: actor.id,
      }),
    );
  }

  /** Staff view: all delivery legs, newest first. */
  async findAll(page = 1, limit = 50): Promise<{ data: DeliveryLeg[]; total: number }> {
    const [data, total] = await this.legRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total };
  }

  async updateStatus(id: string, dto: UpdateDeliveryStatusDto): Promise<DeliveryLeg> {
    const leg = await this.legRepo.findOne({ where: { id } });
    if (!leg) throw new NotFoundException(`Delivery leg ${id} not found`);
    leg.status = dto.status;
    if (dto.trackingRef !== undefined) leg.trackingRef = dto.trackingRef;
    return this.legRepo.save(leg);
  }

  /** Staff see any delivery; customers only their own order's legs. */
  async tracking(id: string, user: AuthenticatedUser): Promise<DeliveryLeg[]> {
    const leg = await this.legRepo.findOne({ where: { id } });
    if (!leg) throw new NotFoundException(`Delivery leg ${id} not found`);
    const access = await this.permissionsService.getAccessLevel(user.role, ModuleName.LOGISTICS);
    if (ACCESS_RANK[access] < ACCESS_RANK[AccessLevel.OWN]) {
      throw new ForbiddenException('No logistics access');
    }
    if (access === AccessLevel.OWN && leg.order.customer?.id !== user.id) {
      throw new ForbiddenException('Not your delivery');
    }
    // All legs of the same order, in leg order — multi-leg journeys visible at once.
    return this.legRepo.find({
      where: { order: { id: leg.order.id } },
      order: { legNumber: 'ASC' },
    });
  }

  // --- Pricing (weight + location) ---

  async quote(weightKg: number, zone: string): Promise<{ zone: string; weightKg: number; cost: number }> {
    const pricing = await this.pricingRepo.findOne({ where: { zone } });
    if (!pricing) throw new BadRequestException(`No delivery pricing configured for zone '${zone}'`);
    const cost = Math.round((pricing.baseFee + pricing.pricePerKg * weightKg) * 100) / 100;
    return { zone, weightKg, cost };
  }

  async upsertPricing(dto: UpsertPricingDto): Promise<DeliveryPricing> {
    const existing = await this.pricingRepo.findOne({ where: { zone: dto.zone } });
    const pricing = existing ?? this.pricingRepo.create({ zone: dto.zone });
    pricing.baseFee = dto.baseFee;
    pricing.pricePerKg = dto.pricePerKg;
    return this.pricingRepo.save(pricing);
  }

  async listPricing(): Promise<DeliveryPricing[]> {
    return this.pricingRepo.find({ order: { zone: 'ASC' } });
  }
}
