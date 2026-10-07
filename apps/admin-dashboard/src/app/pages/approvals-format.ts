import { Approval } from '../api.service';

/** What each request type is called on screen, in plain words. */
export const APPROVAL_TYPE_LABEL: Record<string, string> = {
  price_change: 'Price change',
  purchasing: 'Purchase order',
  production_start: 'Production start',
  fund_movement: 'Fund movement',
  stock_disposal: 'Stock disposal',
};

export function approvalTypeLabel(actionType: string): string {
  return APPROVAL_TYPE_LABEL[actionType] ?? actionType.replaceAll('_', ' ');
}

/** The short reference staff quote for a request. */
export function approvalRef(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

export interface PriceChange {
  product: string;
  from: number;
  to: number;
  /** Percentage change, one decimal, or '-' when the current price is zero. */
  deltaPct: string;
  /** Set when the request is a timed sale rather than a permanent change. */
  saleEndsAt: string | null;
}

/** Decoded price-change payload for the before/after figures; null for any other request. */
export function priceChange(a: Approval): PriceChange | null {
  if (a.actionType !== 'price_change') return null;
  const p = a.payload as Record<string, unknown> | null;
  const from = Number(p?.['from']);
  const to = Number(p?.['to']);
  if (!p || Number.isNaN(from) || Number.isNaN(to)) return null;
  const deltaPct = from > 0 ? (Math.round(((to - from) / from) * 1000) / 10).toFixed(1) : '-';
  const saleEndsAt = p['kind'] === 'sale' ? String(p['saleEndsAt'] ?? '') || null : null;
  return { product: String(p['product'] ?? ''), from, to, deltaPct, saleEndsAt };
}

/** Any other payload, flattened to label/value pairs so nothing in the request is hidden. */
export function payloadEntries(a: Approval): Array<[string, string]> {
  const p = a.payload;
  if (!p || typeof p !== 'object') return [['Request', String(p ?? '-')]];
  return Object.entries(p as Record<string, unknown>).map(([k, v]) => {
    const label = k
      .replace(/([A-Z])/g, ' $1')
      .replaceAll('_', ' ')
      .toLowerCase();
    return [
      label.charAt(0).toUpperCase() + label.slice(1),
      typeof v === 'object' ? JSON.stringify(v) : String(v),
    ];
  });
}
