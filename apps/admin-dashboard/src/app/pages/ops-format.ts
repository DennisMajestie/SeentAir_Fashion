import { SeBadgeTone } from '@seentair/ui';

/** Label and tone for a state the shared status mapping does not cover yet. */
export interface StateCopy {
  label: string;
  tone: SeBadgeTone;
}

const state = (map: Record<string, StateCopy>, value: string): StateCopy =>
  map[value] ?? { label: value.replace(/_/g, ' '), tone: 'neutral' };

/** How a record is referred to on screen: a prefix and the first six characters of its id. */
export function shortRef(prefix: string, id: string): string {
  return `${prefix}-${id.slice(0, 6).toUpperCase()}`;
}

/** "1 return", "3 returns". */
export function countOf(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

// ---- deliveries ----
const DELIVERY: Record<string, StateCopy> = {
  pending: { label: 'Not dispatched', tone: 'warning' },
  in_transit: { label: 'In transit', tone: 'info' },
  delivered: { label: 'Delivered', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
};
export const DELIVERY_STATUSES = Object.keys(DELIVERY);
export const deliveryState = (value: string): StateCopy => state(DELIVERY, value);

const CHECKPOINT: Record<string, StateCopy> = {
  on_track: { label: 'On track', tone: 'info' },
  delayed: { label: 'Delayed', tone: 'warning' },
  seal_intact: { label: 'Seal intact', tone: 'info' },
  delivered: { label: 'Delivered', tone: 'success' },
};
export const CHECKPOINT_STATUSES = Object.keys(CHECKPOINT);
export const checkpointState = (value: string): StateCopy => state(CHECKPOINT, value);

const CARRIERS: Record<string, string> = {
  gigl: 'GIGL',
  dispatch_rider: 'Dispatch rider',
  transport_co: 'Transport company',
};
export const CARRIER_OPTIONS = Object.entries(CARRIERS).map(([value, label]) => ({ value, label }));
export const carrierLabel = (value: string): string => CARRIERS[value] ?? value.replace(/_/g, ' ');

/** "SKU×5" lines (also "SKU x5" or "SKU 5") into the contents the API stores. */
export function parseContents(text: string): Array<{ sku: string; quantity: number }> {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(.*?)×(\d+)$/i) ?? line.match(/^(.*?)\s+x?\s*(\d+)$/i);
      return m ? { sku: m[1].trim(), quantity: Number(m[2]) } : { sku: line, quantity: 1 };
    });
}

// ---- custom orders ----
const CUSTOM: Record<string, StateCopy> = {
  submitted: { label: 'Submitted', tone: 'warning' },
  under_review: { label: 'Under review', tone: 'info' },
  quoted: { label: 'Quoted', tone: 'warning' },
  quote_accepted: { label: 'Quote accepted', tone: 'warning' },
  paid: { label: 'Paid', tone: 'info' },
  sample_in_production: { label: 'Sample in production', tone: 'info' },
  sample_approved: { label: 'Sample approved', tone: 'info' },
  in_production: { label: 'In production', tone: 'info' },
  fulfilled: { label: 'Fulfilled', tone: 'success' },
  delivered: { label: 'Delivered', tone: 'success' },
  declined: { label: 'Declined', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};
export const CUSTOM_STATUS_OPTIONS = Object.entries(CUSTOM).map(([value, copy]) => ({
  value,
  label: copy.label,
}));
export const customState = (value: string): StateCopy => state(CUSTOM, value);

/** The step staff can take next. A sample in production waits for the buyer, not for staff. */
const CUSTOM_NEXT: Record<string, { status: string; label: string; consequence: string }> = {
  submitted: {
    status: 'under_review',
    label: 'Start review',
    consequence: 'The buyer sees that the request is being reviewed.',
  },
  paid: {
    status: 'sample_in_production',
    label: 'Start sample',
    consequence: 'The sample goes into production and the buyer is asked to approve it.',
  },
  sample_approved: {
    status: 'in_production',
    label: 'Start production',
    consequence: 'The full run starts. The buyer has approved the sample.',
  },
  in_production: {
    status: 'fulfilled',
    label: 'Mark as fulfilled',
    consequence: 'The run is recorded as finished and ready for the buyer.',
  },
  fulfilled: {
    status: 'delivered',
    label: 'Mark as delivered',
    consequence: 'The order is recorded as received by the buyer.',
  },
};
export const customNext = (status: string) => CUSTOM_NEXT[status] ?? null;

// ---- returns ----
/** Time left on the 24-hour return deadline, or how far past it. */
export function deadlineLabel(deadline: string, now = Date.now()): string {
  const ms = new Date(deadline).getTime() - now;
  if (Number.isNaN(ms)) return 'No deadline';
  const h = Math.floor(Math.abs(ms) / 3_600_000);
  const m = Math.floor((Math.abs(ms) % 3_600_000) / 60_000);
  return ms < 0 ? `Overdue by ${h}h ${m}m` : `${h}h ${m}m left`;
}
export const isOverdue = (deadline: string, now = Date.now()): boolean =>
  new Date(deadline).getTime() < now;
