import 'dotenv/config';
import { AppDataSource } from '../data-source';
import { CheckoutShippingZone } from '../../modules/checkout-shipping/entities/checkout-shipping-zone.entity';
import { CheckoutShippingZoneState } from '../../modules/checkout-shipping/entities/checkout-shipping-zone-state.entity';
import { CheckoutShippingRate } from '../../modules/checkout-shipping/entities/checkout-shipping-rate.entity';
import { DeliveryMethod } from '../../modules/orders/entities/order.entity';
import { ProductSizeClass } from '../../modules/checkout-shipping/shipping-size-class';
import { NIGERIAN_STATES } from '../../modules/checkout-shipping/nigerian-states';

/**
 * The six Nigerian geopolitical zones, each with its states and the FCT.
 * Idempotent: a zone is matched by name, a state by its stable key, and a
 * state already sitting in a different zone is an error rather than a move.
 */

const ZONES: Array<{ name: string; states: string[] }> = [
  {
    name: 'North Central',
    states: ['abja', 'ben', 'kogi', 'kwara', 'nas', 'ngr', 'pla'],
  },
  {
    name: 'North East',
    states: ['adm', 'bau', 'boc', 'gom', 'tar', 'yob'],
  },
  {
    name: 'North West',
    states: ['jig', 'kad', 'kan', 'kat', 'keb', 'sok', 'zam'],
  },
  {
    name: 'South East',
    states: ['abv', 'ana', 'ebo', 'enugu', 'imi'],
  },
  {
    name: 'South South',
    states: ['aky', 'bay', 'bra', 'del', 'eby', 'rivers'],
  },
  {
    name: 'South West',
    states: ['ekk', 'lag', 'ogi', 'ond', 'osn', 'oyo'],
  },
];

/**
 * Provisional freight fees in naira, anchored on the single factory in the
 * South East (Aba) and rising with distance. NOT final business numbers; the
 * owner adjusts them in the DB or admin screen and this seed will close and
 * re-version rather than fight an operator's edit.
 */
const FREIGHT_FEES: Record<string, Record<ProductSizeClass, number>> = {
  'South East': { light: 2000, medium: 3500, heavy: 5000 },
  'South South': { light: 2500, medium: 4000, heavy: 5500 },
  'South West': { light: 3000, medium: 4500, heavy: 6500 },
  'North Central': { light: 3500, medium: 5000, heavy: 7000 },
  'North East': { light: 4000, medium: 6000, heavy: 8000 },
  'North West': { light: 4000, medium: 6000, heavy: 8000 },
};

async function seed(): Promise<void> {
  await AppDataSource.initialize();
  const zoneRepo = AppDataSource.getRepository(CheckoutShippingZone);
  const stateRepo = AppDataSource.getRepository(CheckoutShippingZoneState);

  const names = new Map(NIGERIAN_STATES.map((s) => [s.key, s.name]));
  const seen = new Set<string>();
  for (const zone of ZONES) {
    for (const key of zone.states) {
      if (!names.has(key)) throw new Error(`Unknown state key '${key}' in ${zone.name}.`);
      if (seen.has(key)) throw new Error(`State key '${key}' listed in more than one zone.`);
      seen.add(key);
    }
  }

  let createdZones = 0;
  let createdStates = 0;
  let renamedStates = 0;

  for (const definition of ZONES) {
    let zone = await zoneRepo.findOne({ where: { name: definition.name } });
    if (!zone) {
      zone = await zoneRepo.save(zoneRepo.create({ name: definition.name, isActive: true }));
      createdZones += 1;
    }

    for (const key of definition.states) {
      const canonical = names.get(key)!;
      const existing = await stateRepo.findOne({
        where: { stateKey: key },
        relations: { zone: true },
      });
      if (!existing) {
        await stateRepo.save(stateRepo.create({ zone, stateKey: key, state: canonical }));
        createdStates += 1;
        continue;
      }
      if (existing.zone.id !== zone.id) {
        throw new Error(
          `'${existing.state}' is already in '${existing.zone.name}', not '${zone.name}'.`,
        );
      }
      if (existing.state !== canonical) {
        existing.state = canonical;
        await stateRepo.save(existing);
        renamedStates += 1;
      }
    }
    console.log(`${definition.name}: ${definition.states.length} states`);
  }

  // --- Rates ---
  // Every zone gets all three size classes for freight, and pickup at zero for
  // every band (pickup is never charged a delivery fee; the rows exist so a
  // quote for pickup resolves a rate instead of falling to NO_RATE). A change
  // to an existing fee closes the old window at now and opens a new one, so a
  // quote already issued keeps the fee it was shown.

  const rateRepo = AppDataSource.getRepository(CheckoutShippingRate);
  const ALL_ZONES = await zoneRepo.find();
  let createdRates = 0;
  let changedRates = 0;
  let unchangedRates = 0;

  for (const zone of ALL_ZONES) {
    const fees = FREIGHT_FEES[zone.name];
    if (!fees) throw new Error(`No fee table maps zone '${zone.name}'.`);
    const desires: Array<{ method: DeliveryMethod; sizeClass: ProductSizeClass; fee: number }> = [
      ...Object.values(ProductSizeClass).map((sizeClass) => ({
        method: DeliveryMethod.FREIGHT,
        sizeClass,
        fee: fees[sizeClass],
      })),
      ...Object.values(ProductSizeClass).map((sizeClass) => ({
        method: DeliveryMethod.PICKUP,
        sizeClass,
        fee: 0,
      })),
    ];
    for (const want of desires) {
      const live = await rateRepo.findOne({
        where: { zone: { id: zone.id }, sizeClass: want.sizeClass, method: want.method },
        order: { validFrom: 'DESC' },
      });
      if (live && live.validTo === null && Number(live.fee) === want.fee) {
        unchangedRates += 1;
        continue;
      }
      if (live && live.validTo === null) {
        await rateRepo.save({ ...live, validTo: new Date() });
        changedRates += 1;
      }
      if (!live || live.validTo === null || Number(live.fee) !== want.fee) {
        await rateRepo.save(
          rateRepo.create({
            zone,
            sizeClass: want.sizeClass,
            method: want.method,
            fee: want.fee,
            validFrom: new Date(),
            isActive: true,
          }),
        );
        if (!live || Number(live.fee) !== want.fee) createdRates += 1;
      }
    }
    console.log(`${zone.name}: freight light/medium/heavy ${fees.light}/${fees.medium}/${fees.heavy}, pickup 0`);
  }

  console.log(
    `Done. ${ZONES.length} zones, ${createdZones} created, ${createdStates} states added, ${renamedStates} names corrected. ` +
      `Rates: ${createdRates} created, ${changedRates} re-versioned, ${unchangedRates} already correct.`,
  );
  await AppDataSource.destroy();
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
