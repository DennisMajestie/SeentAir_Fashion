/** A tech pack as the API returns it: read field by field, since the client has no typed contract yet. */
export type TechPack = Record<string, unknown>;

export interface VariantRow {
  id: string;
  sku: string;
  size: string | null;
  colour: string | null;
  priceOverride: number | null;
}
export interface ProductRow {
  id: string;
  name: string;
  category: string | null;
  basePrice: number;
  variants: VariantRow[];
}

/** The variant a tech pack belongs to, whichever way the API sent it. */
export function packVariantId(pack: TechPack): string {
  return String((pack['variant'] as TechPack | null)?.['id'] ?? pack['variantId'] ?? '');
}

/** "M, black": the size and colour of a variant, or an empty string when it has neither. */
export function variantLabel(v: Pick<VariantRow, 'size' | 'colour'>): string {
  return [v.size, v.colour].filter((x): x is string => Boolean(x)).join(', ');
}

/** A pack is a draft until it is approved; a variant may have no pack at all. */
export const PACK_STATES: Record<string, string> = {
  none: 'No tech pack',
  draft: 'Draft',
  approved: 'Approved',
};
export const PACK_STATE_OPTIONS = Object.entries(PACK_STATES).map(([value, label]) => ({
  value,
  label,
}));

export function packState(pack: TechPack | null | undefined): string {
  return pack ? String(pack['status'] ?? 'draft') : 'none';
}

export function revisionNumber(pack: TechPack | null | undefined): number {
  return pack ? Number(pack['revision']) || 1 : 0;
}

/** "1 revision", "3 revisions". */
export function countOf(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

export interface MeasurementRow {
  id: string;
  /** The point of measure, then one value per size. */
  [size: string]: string;
}

/**
 * Graded measurements arrive keyed by size ({ S: { chest: 52 }, M: { chest: 54 } }).
 * The shop floor reads them the other way round: one row per point of measure,
 * one column per size.
 */
export function measurementTable(graded: unknown): { sizes: string[]; rows: MeasurementRow[] } {
  if (typeof graded !== 'object' || graded === null) return { sizes: [], rows: [] };
  const bySize = graded as Record<string, Record<string, unknown> | undefined>;
  const sizes = Object.keys(bySize);
  const points = new Set<string>();
  for (const size of sizes) {
    const values = bySize[size];
    if (values && typeof values === 'object') Object.keys(values).forEach((k) => points.add(k));
  }
  const rows = [...points].map((point) => {
    const row: MeasurementRow = { id: point };
    for (const size of sizes) {
      const v = bySize[size]?.[point];
      row[size] = v === undefined || v === null ? '–' : String(v);
    }
    return row;
  });
  return { sizes, rows };
}
