import { AdminOrder } from '../api.service';

/** How an order is referred to on screen: the first eight characters of its id. */
export function orderRef(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

/** The buyer's name: an account holder, a guest at checkout, or a walk-in sale. */
export function customerName(order: Pick<AdminOrder, 'customer' | 'guestName'>): string {
  return order.customer?.name ?? order.guestName ?? 'Walk-in customer';
}

const CHANNELS: Record<string, string> = {
  retail: 'Retail web',
  wholesale: 'Wholesale',
  in_store: 'In-store',
  custom: 'Custom',
};
export function channelLabel(channel: string): string {
  return CHANNELS[channel] ?? channel.replace(/_/g, ' ');
}
export const CHANNEL_OPTIONS = Object.entries(CHANNELS).map(([value, label]) => ({ value, label }));

export function unitCount(order: AdminOrder): number {
  return (order.items ?? []).reduce((sum, item) => sum + item.quantity, 0);
}

/** The one step an order can take next. Fulfilment only ever moves forward. */
const NEXT_STATUS: Record<string, string> = {
  order_received: 'processing',
  processing: 'shipped',
  shipped: 'delivered',
};

export interface NextStep {
  status: string;
  /** Button label: "Mark as shipped". */
  label: string;
  /** What moving to this status does, for the confirmation dialog. */
  consequence: string;
}

const STEP_COPY: Record<string, { label: string; consequence: string }> = {
  processing: { label: 'Mark as processing', consequence: 'It moves into fulfilment.' },
  shipped: { label: 'Mark as shipped', consequence: 'It is recorded as handed over for delivery.' },
  delivered: {
    label: 'Mark as delivered',
    consequence: "It is recorded as received, which starts the customer's return window.",
  },
};

/**
 * The next fulfilment step for an order, or null when there is none: an unpaid
 * order cannot move forward (full payment upfront), and neither can one that is
 * delivered, cancelled, returned or held on a stock exception.
 */
export function nextStep(order: Pick<AdminOrder, 'status' | 'paymentStatus'>): NextStep | null {
  if (order.paymentStatus !== 'paid') return null;
  const status = NEXT_STATUS[order.status];
  return status ? { status, ...STEP_COPY[status] } : null;
}
