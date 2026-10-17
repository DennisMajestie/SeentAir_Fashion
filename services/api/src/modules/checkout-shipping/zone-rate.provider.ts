import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeliveryMethod } from '../orders/entities/order.entity';
import { CheckoutShippingZoneState } from './entities/checkout-shipping-zone-state.entity';
import { CheckoutShippingRate } from './entities/checkout-shipping-rate.entity';
import { ProductSizeClass } from './shipping-size-class';

/**
 * The seam between "what does delivery cost" and the tables that hold the
 * answer. It exists so a future live courier quote can be swapped in without
 * the quote service changing, and so the resolution rules (which zone, which
 * rate) can be tested against a fake.
 */
export interface ZoneRateProvider {
  /** The active zone for a state key, or null when the state is not served. */
  findZoneForState(stateKey: string, now: Date): Promise<ZoneRef | null>;
  /** The rate in force for a zone triple at `now`, or null when none applies. */
  findRate(
    zoneId: string,
    sizeClass: ProductSizeClass,
    method: DeliveryMethod,
    now: Date,
  ): Promise<RateRef | null>;
}

export interface ZoneRef {
  id: string;
  name: string;
  stateKey: string;
  state: string;
}

export interface RateRef {
  id: string;
  fee: number;
  validFrom: Date;
  validTo: Date | null;
}

@Injectable()
export class DatabaseZoneRateProvider implements ZoneRateProvider {
  constructor(
    @InjectRepository(CheckoutShippingZoneState)
    private readonly stateRepo: Repository<CheckoutShippingZoneState>,
    @InjectRepository(CheckoutShippingRate)
    private readonly rateRepo: Repository<CheckoutShippingRate>,
  ) {}

  async findZoneForState(stateKey: string, now: Date): Promise<ZoneRef | null> {
    const row = await this.stateRepo
      .createQueryBuilder('zs')
      .innerJoinAndSelect('zs.zone', 'zone')
      .where('zs.state_key = :stateKey', { stateKey })
      .andWhere('zone.is_active = true')
      .getOne();
    if (!row) return null;
    void now;
    return {
      id: row.zone.id,
      name: row.zone.name,
      stateKey: row.stateKey,
      state: row.state,
    };
  }

  async findRate(
    zoneId: string,
    sizeClass: ProductSizeClass,
    method: DeliveryMethod,
    now: Date,
  ): Promise<RateRef | null> {
    const row = await this.rateRepo
      .createQueryBuilder('rate')
      .where('rate.zone_id = :zoneId', { zoneId })
      .andWhere('rate.size_class = :sizeClass', { sizeClass })
      .andWhere('rate.method = :method', { method })
      .andWhere('rate.is_active = true')
      .andWhere('rate.valid_from <= :now', { now })
      .andWhere('(rate.valid_to IS NULL OR rate.valid_to > :now)', { now })
      .orderBy('rate.valid_from', 'DESC')
      .getOne();
    if (!row) return null;
    return { id: row.id, fee: row.fee, validFrom: row.validFrom, validTo: row.validTo };
  }
}