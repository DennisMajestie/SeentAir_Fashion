/**
 * Order totals.
 *
 * One function decides what an order costs. Order creation, the delivery quote
 * and (later) coupon previews all call it, so a figure shown to a shopper and
 * the figure charged cannot drift apart.
 *
 * The locked order of operations is: item subtotal, minus item discounts,
 * then the delivery fee (a free-delivery coupon waives it), then VAT per the
 * current settings, then the total. `totalAmount` is that grand total, which is
 * what the Paystack webhook verifies in kobo, so a discount must always land
 * inside it rather than beside it.
 *
 * Every amount enters and leaves in major units (naira) to match the prices
 * that come off the catalogue and the `numeric(12,2)` columns they land in.
 * All arithmetic between those boundaries is in whole kobo, rounded once per
 * component, and the total is the sum of those rounded parts -- a total is
 * never re-rounded from a product, which is where half-kobo drift comes from.
 */

/** Kobo per major unit. */
const KOBO = 100;

/**
 * Largest VAT rate accepted. A mistyped rate must not silently produce a
 * nonsense bill; the rate is clamped, mirroring MAX_SALE_PERCENT.
 */
export const MAX_VAT_PERCENT = 100;

/** One priced cart line. `taxExempt` is optional so a plain line just works. */
export interface TotalLine {
  unitPrice: number;
  quantity: number;
  taxExempt?: boolean;
}

/** The feature flags and tax settings that shape a total. */
export interface TotalSettings {
  /** Master VAT switch. When false the VAT line is zero and hidden. */
  vatEnabled: boolean;
  /** Percent, 0-100. Clamped to MAX_VAT_PERCENT. */
  vatRatePercent: number;
  /** True when listed prices already contain VAT. */
  pricesIncludeVat: boolean;
  /** True when the delivery fee is part of the taxable base. */
  deliveryTaxable: boolean;
  /** Delivery feature flag. When false the delivery fee is always zero. */
  deliveryEnabled: boolean;
  /**
   * Spend at or above this many major units ships free. Null (or zero) means
   * no free-delivery offer. Measured against the subtotal AFTER any item
   * discount, because a coupon has already lowered what the basket is worth.
   */
  freeDeliveryThreshold?: number | null;
}

export interface TotalsInput {
  lines: readonly TotalLine[];
  /** The quoted delivery fee in major units. Ignored while delivery is off. */
  deliveryFee?: number;
  /** Item-level discount in major units (coupons). Never exceeds the subtotal. */
  itemDiscount?: number;
  /** The delivery waiver in major units (a free-delivery coupon). */
  deliveryDiscount?: number;
  settings: TotalSettings;
}

export interface Totals {
  subtotal: number;
  itemDiscount: number;
  /** The fee after any waiver; what the customer is charged to ship. */
  deliveryFee: number;
  deliveryWaived: number;
  /** The post-discount base VAT was computed on, for the settings audit trail. */
  taxableBase: number;
  vat: number;
  total: number;
}

/** Major units to whole kobo. */
export function toKobo(amount: number): number {
  return Math.round((Number.isFinite(amount) ? amount : 0) * KOBO);
}

/** Whole kobo back to major units. */
export function fromKobo(kobo: number): number {
  return kobo / KOBO;
}

/** A rate that is a real percent, never NaN and never above the ceiling. */
function clampVatRate(percent: number): number {
  if (!Number.isFinite(percent) || percent <= 0) return 0;
  return Math.min(percent, MAX_VAT_PERCENT);
}

/** A discount that is non-negative and cannot exceed what it discounts. */
function clampDiscount(amount: number | undefined, ceilingKobo: number): number {
  const kobo = toKobo(amount ?? 0);
  if (kobo <= 0) return 0;
  return Math.min(kobo, Math.max(0, ceilingKobo));
}

/**
 * What an order costs under the given settings.
 *
 * With VAT disabled, delivery disabled and no discounts this returns exactly
 * what order creation has always returned, so switching the features on is not
 * a behaviour change until they are deliberately used.
 */
export function computeTotals(input: TotalsInput): Totals {
  const settings = input.settings;

  let subtotalKobo = 0;
  let exemptKobo = 0;
  for (const line of input.lines) {
    const quantity = Math.trunc(line.quantity ?? 0);
    if (quantity <= 0) continue;
    const unitKobo = Math.max(0, toKobo(line.unitPrice));
    const lineKobo = unitKobo * quantity;
    subtotalKobo += lineKobo;
    if (line.taxExempt) exemptKobo += lineKobo;
  }

  const itemDiscountKobo = clampDiscount(input.itemDiscount, subtotalKobo);
  const subtotalAfterDiscountKobo = subtotalKobo - itemDiscountKobo;

  // An item discount shrinks the taxable lines in proportion to what they were
  // worth, so a coupon that lands on the whole basket also lands on the part of
  // it that is taxable. One rounding, applied here.
  const taxableLinesKobo = Math.max(0, subtotalKobo - exemptKobo);
  const taxableSubtotalKobo =
    subtotalKobo === 0
      ? 0
      : Math.max(
          0,
          Math.round(taxableLinesKobo - (itemDiscountKobo * taxableLinesKobo) / subtotalKobo),
        );

  const quotedDeliveryKobo = settings.deliveryEnabled ? Math.max(0, toKobo(input.deliveryFee ?? 0)) : 0;
  const couponWaiverKobo = clampDiscount(input.deliveryDiscount, quotedDeliveryKobo);
  // The threshold is inclusive: a basket landing exactly on it ships free.
  // Zero is treated as "no offer" rather than "everything is free".
  const thresholdKobo =
    settings.freeDeliveryThreshold == null
      ? null
      : Math.max(0, toKobo(settings.freeDeliveryThreshold));
  const freeByThresholdKobo =
    thresholdKobo !== null && thresholdKobo > 0 && subtotalAfterDiscountKobo >= thresholdKobo
      ? quotedDeliveryKobo - couponWaiverKobo
      : 0;
  const deliveryWaivedKobo = couponWaiverKobo + freeByThresholdKobo;
  const deliveryKobo = quotedDeliveryKobo - deliveryWaivedKobo;

  const rate = clampVatRate(settings.vatRatePercent);
  const taxableBaseKobo = taxableSubtotalKobo + (settings.deliveryTaxable ? deliveryKobo : 0);

  let vatKobo = 0;
  if (settings.vatEnabled && rate > 0 && taxableBaseKobo > 0) {
    // Inclusive prices already carry the VAT, so the tax is extracted from the
    // base rather than added on top of it. Exclusive prices add it.
    vatKobo = settings.pricesIncludeVat
      ? Math.round((taxableBaseKobo * rate) / (100 + rate))
      : Math.round((taxableBaseKobo * rate) / 100);
  }

  // Inclusive VAT is already inside the line prices; adding it here would
  // charge the customer twice.
  const totalKobo =
    subtotalKobo - itemDiscountKobo + deliveryKobo + (settings.pricesIncludeVat ? 0 : vatKobo);

  return {
    subtotal: fromKobo(subtotalKobo),
    itemDiscount: fromKobo(itemDiscountKobo),
    deliveryFee: fromKobo(deliveryKobo),
    deliveryWaived: fromKobo(deliveryWaivedKobo),
    taxableBase: fromKobo(taxableBaseKobo),
    vat: fromKobo(vatKobo),
    total: fromKobo(totalKobo),
  };
}