/**
 * Human-readable order number formatting.
 *
 * Single source of truth for the display format so every surface (API,
 * receipts, emails, tracking pages) renders the same string.
 *
 * Format: `SO-1001` (prefix `SO` + zero-padded? no, plain integer).
 * Parser accepts `SO-1001` or bare `1001`.
 */
export const ORDER_NUMBER_PREFIX = 'SO';

/** Render an order number as `SO-<n>`. */
export function formatOrderNumber(n: number | string): string {
  const value = typeof n === 'number' ? BigInt(Math.trunc(n)) : BigInt(n);
  return `${ORDER_NUMBER_PREFIX}-${value}`;
}

/** Parse `SO-1001` or `1001` back into the integer number; null when invalid. */
export function parseOrderNumber(value: string): number | null {
  const s = (value ?? '').trim();
  if (s === '') return null;
  const withPrefix = new RegExp(`^${ORDER_NUMBER_PREFIX}-(\\d+)$`, 'i');
  const m = s.match(withPrefix);
  if (m) return Number(m[1]);
  const bare = /^(\d+)$/.exec(s);
  if (bare) return Number(bare[1]);
  return null;
}
