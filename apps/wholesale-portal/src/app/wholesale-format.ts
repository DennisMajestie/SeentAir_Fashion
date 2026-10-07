import { SeBadgeTone } from '@seentair/ui';
import { Invoice } from './api.service';

/** How a buyer refers to an order: the first eight characters of its id. */
export const orderRef = (id: string): string => `#${id.slice(0, 8).toUpperCase()}`;

export const units = (invoice: Pick<Invoice, 'items'>): number =>
  invoice.items.reduce((n, i) => n + i.quantity, 0);

export const isPaid = (invoice: Pick<Invoice, 'paymentStatus'>): boolean =>
  invoice.paymentStatus === 'paid';

export const isClosed = (invoice: Pick<Invoice, 'status'>): boolean =>
  /delivered|cancelled|completed|returned|refunded/.test(invoice.status);

export const inTransit = (invoice: Pick<Invoice, 'status'>): boolean =>
  /shipped|transit|dispatch|out_for/.test(invoice.status);

/**
 * The stages a wholesale batch walks, keyed on the real OrderStatus values
 * the API emits, so the track never implies a stage the server does not
 * have. Payment is not a stage: it is a gate the buyer resolves.
 */
export const PIPELINE = [
  { key: 'received', label: 'Received' },
  { key: 'processing', label: 'Processing' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'delivered', label: 'Delivered' },
] as const;

/**
 * Furthest stage reached across the live orders, so the track answers "where
 * are my batches now" rather than averaging them. -1 when nothing is in flight.
 */
export function pipelineStep(invoices: ReadonlyArray<Pick<Invoice, 'status'>>): number {
  let best = -1;
  for (const inv of invoices) {
    if (/cancelled|returned|refunded/.test(inv.status)) continue;
    const s = inv.status.toLowerCase();
    const r = PIPELINE.findIndex((p) => s.includes(p.key));
    if (r > best) best = r;
  }
  return best;
}

export interface AccountSummary {
  open: number;
  awaitingPayment: number;
  inTransit: number;
  /** Status word, its tone, and the one thing to do next. */
  status: string;
  tone: SeBadgeTone;
  next: string;
}

/** One account state from the invoice list, shared by Home and Orders. */
export function summarise(invoices: ReadonlyArray<Invoice>): AccountSummary {
  const open = invoices.filter((i) => !isClosed(i)).length;
  // A cancelled batch is not waiting for money.
  const awaitingPayment = invoices.filter((i) => !isPaid(i) && !isClosed(i)).length;
  const transit = invoices.filter(inTransit).length;
  if (awaitingPayment > 0) {
    return {
      open,
      awaitingPayment,
      inTransit: transit,
      status: 'Awaiting payment',
      tone: 'warning',
      next: 'Settle the outstanding total so the factory can release your batch.',
    };
  }
  if (transit > 0) {
    return {
      open,
      awaitingPayment,
      inTransit: transit,
      status: 'In transit',
      tone: 'info',
      next: 'Track the courier and confirm delivery on arrival.',
    };
  }
  if (open > 0) {
    return {
      open,
      awaitingPayment,
      inTransit: transit,
      status: 'In production',
      tone: 'info',
      next: 'Your batch is with the factory floor. Nothing to do.',
    };
  }
  return {
    open,
    awaitingPayment,
    inTransit: transit,
    status: 'All settled',
    tone: 'success',
    next: 'Browse the catalogue to start your next batch.',
  };
}

export const payMethod = (invoice: Pick<Invoice, 'payments'>): string =>
  (invoice.payments[0]?.method ?? 'confirmed').replaceAll('_', ' ');
