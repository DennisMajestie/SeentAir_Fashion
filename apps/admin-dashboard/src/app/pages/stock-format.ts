import { SeActivityEntry } from '@seentair/ui';

/** One row of the stock ledger, as GET /inventory/:id/movements returns it. */
export interface StockMovement {
  id: string;
  movementType: string;
  quantityDelta: number;
  timestamp: string;
  referenceId: string | null;
}

export interface MaterialRow {
  id: string;
  name: string;
  unit: string;
  currentQuantity: number;
  reorderThreshold: number;
  lowStock: boolean;
  category: string | null;
  storageLocation: string | null;
}

export const MATERIAL_CATEGORIES = [
  { value: 'fabrics', label: 'Fabrics' },
  { value: 'trims_hardware', label: 'Trims and hardware' },
  { value: 'thread', label: 'Thread' },
  { value: 'packaging', label: 'Packaging' },
  { value: 'printing', label: 'Printing' },
  { value: 'labels', label: 'Labels' },
  { value: 'other', label: 'Other' },
];

export const categoryLabel = (value: string | null): string =>
  MATERIAL_CATEGORIES.find((c) => c.value === value)?.label ?? 'None';

/** "1 unit", "3 units", "1 yard". */
export const units = (n: number, noun = 'unit'): string =>
  `${n} ${Math.abs(n) === 1 ? noun : noun.endsWith('s') ? noun : noun + 's'}`;

/** "+5" or "-5": a movement always shows its direction. */
export const signed = (n: number): string => (n > 0 ? `+${n}` : `${n}`);

/** "production_output" becomes "Production output". */
export const movementLabel = (type: string): string => {
  const words = type.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** The se-status "stock" value for a quantity; `low` is the server's own low-stock flag. */
export const stockState = (quantity: number, low = false): string =>
  quantity <= 0 ? 'out_of_stock' : low ? 'low_stock' : 'in_stock';

/** The ledger as an activity history, in the order the API gave it (newest first). */
export const movementEntries = (rows: StockMovement[], noun = 'unit'): SeActivityEntry[] =>
  rows.map((m) => ({
    at: m.timestamp,
    text:
      `${movementLabel(m.movementType)}: ${signed(m.quantityDelta)} ${units(m.quantityDelta, noun).split(' ').slice(1).join(' ')}` +
      (m.referenceId ? ` (${m.referenceId})` : ''),
    tone: m.quantityDelta < 0 ? 'warning' : 'success',
  }));

export const errorText = (err: unknown, fallback: string): string =>
  (err as { error?: { message?: string } })?.error?.message ?? fallback;

export const LOAD_FAILED = 'The server did not respond. Nothing has been changed.';
