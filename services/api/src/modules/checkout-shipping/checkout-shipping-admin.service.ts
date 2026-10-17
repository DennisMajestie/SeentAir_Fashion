import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../common/interfaces';
import { AuditService } from '../audit/audit.service';
import { DeliveryMethod } from '../orders/entities/order.entity';
import { CheckoutShippingZone } from './entities/checkout-shipping-zone.entity';
import { CheckoutShippingZoneState } from './entities/checkout-shipping-zone-state.entity';
import { CheckoutShippingRate } from './entities/checkout-shipping-rate.entity';
import { ProductSizeClass } from './shipping-size-class';

export interface ZoneInput {
  name: string;
  isActive?: boolean;
  states: { stateKey: string; state: string }[];
}

export interface RateInput {
  zoneId: string;
  sizeClass: ProductSizeClass;
  method: DeliveryMethod;
  fee: number;
  validFrom?: Date | null;
  validTo?: Date | null;
  isActive?: boolean;
}

/**
 * The operator-facing half of delivery pricing.
 *
 * Two rules are enforced here rather than trusted to the UI: a state belongs to
 * exactly one zone, and two active rates for the same zone + size class +
 * method may not overlap in time. The second one matters because an overlap
 * makes the price ambiguous at quote time, and a silently-ambiguous price is
 * how a business ends up shipping at the wrong figure without anyone noticing.
 *
 * Every write records who changed what and why in the shared audit log.
 */
@Injectable()
export class CheckoutShippingAdminService {
  constructor(
    @InjectRepository(CheckoutShippingZone)
    private readonly zoneRepo: Repository<CheckoutShippingZone>,
    @InjectRepository(CheckoutShippingZoneState)
    private readonly stateRepo: Repository<CheckoutShippingZoneState>,
    @InjectRepository(CheckoutShippingRate)
    private readonly rateRepo: Repository<CheckoutShippingRate>,
    private readonly audit: AuditService,
  ) {}

  listZones(): Promise<CheckoutShippingZone[]> {
    return this.zoneRepo.find({ relations: { states: true }, order: { name: 'ASC' } });
  }

  async createZone(input: ZoneInput, actor: AuthenticatedUser): Promise<CheckoutShippingZone> {
    if (!input.states?.length) {
      throw new BadRequestException('A zone needs at least one state.');
    }
    const keys = input.states.map((s) => s.stateKey);
    if (new Set(keys).size !== keys.length) {
      throw new BadRequestException('A zone cannot list the same state twice.');
    }
    const taken = await this.stateRepo.find({ where: { stateKey: In(keys) } });
    if (taken.length) {
      throw new BadRequestException(
        `Already assigned to another zone: ${taken.map((t) => t.state).join(', ')}`,
      );
    }

    const zone = await this.zoneRepo.save(
      this.zoneRepo.create({ name: input.name, isActive: input.isActive ?? true }),
    );
    await this.stateRepo.save(
      input.states.map((s) => this.stateRepo.create({ zone, stateKey: s.stateKey, state: s.state })),
    );

    await this.audit.record({
      actorId: actor.id,
      action: 'checkout_shipping.zone_create',
      beforeState: { reason: 'created zone', zone: null },
      afterState: { zone: { id: zone.id, name: zone.name, states: keys } },
    });
    return zone;
  }

  async updateZone(
    id: string,
    patch: Partial<ZoneInput>,
    actor: AuthenticatedUser,
  ): Promise<CheckoutShippingZone> {
    const zone = await this.zoneRepo.findOne({ where: { id } });
    if (!zone) throw new NotFoundException('Zone not found.');
    const before = { name: zone.name, isActive: zone.isActive };

    if (patch.name !== undefined) zone.name = patch.name;
    if (patch.isActive !== undefined) zone.isActive = patch.isActive;
    const saved = await this.zoneRepo.save(zone);

    if (patch.states !== undefined) {
      await this.stateRepo.delete({ zone: { id } } as never);
      if (patch.states.length) {
        const keys = patch.states.map((s) => s.stateKey);
        const taken = await this.stateRepo
          .createQueryBuilder('zs')
          .where('zs.state_key IN (:...keys)', { keys })
          .andWhere('zs.zone_id != :id', { id })
          .getMany();
        if (taken.length) {
          throw new BadRequestException(
            `Already assigned to another zone: ${taken.map((t) => t.state).join(', ')}`,
          );
        }
        await this.stateRepo.save(
          patch.states.map((s) =>
            this.stateRepo.create({ zone: saved, stateKey: s.stateKey, state: s.state }),
          ),
        );
      }
    }

    await this.audit.record({
      actorId: actor.id,
      action: 'checkout_shipping.zone_update',
      beforeState: { reason: 'edited zone', zone: before },
      afterState: { zone: { id: saved.id, name: saved.name, isActive: saved.isActive } },
    });
    return saved;
  }

  /**
   * Removes a zone. Its states and rates go with it (both cascade in the
   * database), so this is destructive by design and always audited.
   */
  async removeZone(id: string, actor: AuthenticatedUser): Promise<{ id: string; removed: true }> {
    const zone = await this.zoneRepo.findOne({ where: { id }, relations: { states: true } });
    if (!zone) throw new NotFoundException('Zone not found.');
    await this.zoneRepo.remove(zone);
    await this.audit.record({
      actorId: actor.id,
      action: 'checkout_shipping.zone_delete',
      beforeState: {
        reason: 'deleted zone',
        zone: { id: zone.id, name: zone.name, states: zone.states?.map((s) => s.stateKey) },
      },
      afterState: { zone: null },
    });
    return { id, removed: true };
  }

  listRates(zoneId?: string): Promise<CheckoutShippingRate[]> {
    return this.rateRepo.find({
      where: zoneId ? { zone: { id: zoneId } } : {},
      relations: { zone: true },
      order: { validFrom: 'DESC' },
    });
  }

  async createRate(input: RateInput, actor: AuthenticatedUser): Promise<CheckoutShippingRate> {
    if (input.fee < 0) throw new BadRequestException('A rate cannot be negative.');
    const zone = await this.zoneRepo.findOne({ where: { id: input.zoneId } });
    if (!zone) throw new NotFoundException('Zone not found.');

    const validFrom = input.validFrom ?? new Date();
    const validTo = input.validTo ?? null;
    if (validTo && validTo.getTime() <= validFrom.getTime()) {
      throw new BadRequestException('A rate must end after it starts.');
    }
    await this.assertNoOverlap(input.zoneId, input.sizeClass, input.method, validFrom, validTo, null);

    const rate = await this.rateRepo.save(
      this.rateRepo.create({
        zone,
        sizeClass: input.sizeClass,
        method: input.method,
        fee: input.fee,
        validFrom,
        validTo,
        isActive: input.isActive ?? true,
      }),
    );

    await this.audit.record({
      actorId: actor.id,
      action: 'checkout_shipping.rate_create',
      beforeState: { reason: 'created rate', rate: null },
      afterState: { rate: { id: rate.id, zoneId: input.zoneId, sizeClass: input.sizeClass, fee: input.fee } },
    });
    return rate;
  }

  /**
   * Two active rates for the same triple may not overlap. `valid_to` null means
   * open-ended, which overlaps anything that has not already ended.
   */
  private async assertNoOverlap(
    zoneId: string,
    sizeClass: ProductSizeClass,
    method: DeliveryMethod,
    validFrom: Date,
    validTo: Date | null,
    excludeId: string | null,
  ): Promise<void> {
    const qb = this.rateRepo
      .createQueryBuilder('rate')
      .where('rate.zone_id = :zoneId', { zoneId })
      .andWhere('rate.size_class = :sizeClass', { sizeClass })
      .andWhere('rate.method = :method', { method })
      .andWhere('rate.is_active = true');

    if (excludeId) qb.andWhere('rate.id != :excludeId', { excludeId });

    // The new window is [validFrom, validTo). It overlaps an existing row when
    // that row starts before the new one ends and ends after the new one starts.
    // An existing null valid_to is open-ended, so it overlaps anything later.
    qb.andWhere('(rate.valid_to IS NULL OR rate.valid_to > :validFrom)', { validFrom });
    if (validTo) qb.andWhere('rate.valid_from < :validTo', { validTo });

    const clash = await qb.getOne();
    if (clash) {
      throw new BadRequestException(
        `An active rate already covers that zone, size class and method between ` +
          `${clash.validFrom.toISOString()} and ${clash.validTo ? clash.validTo.toISOString() : 'open-ended'}.`,
      );
    }
  }
}