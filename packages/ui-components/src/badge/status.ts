import { SeBadgeTone } from './badge.component';

/** The domain vocabularies a status can come from. */
export type SeStatusKind =
  | 'order'
  | 'payment'
  | 'approval'
  | 'stock'
  | 'production'
  | 'return'
  | 'account'
  | 'delivery'
  | 'custom_order'
  | 'review'
  | 'qc';

export interface SeStatusMeaning {
  label: string;
  tone: SeBadgeTone;
}

const s = (label: string, tone: SeBadgeTone): SeStatusMeaning => ({ label, tone });

/**
 * The one mapping from a domain state to its wording and colour, for all three
 * apps. A state is the same colour everywhere because it is only defined here.
 *
 * The keys are the values the API sends. How the tones are assigned:
 *   success  the good end state, nothing left to do
 *   info     in progress, moving normally
 *   warning  waiting on someone, or needs attention soon
 *   danger   failed, refused or blocked
 *   neutral  closed without being a success or a failure
 */
export const SE_STATUS: Record<SeStatusKind, Record<string, SeStatusMeaning>> = {
  order: {
    awaiting_payment: s('Awaiting payment', 'warning'),
    order_received: s('Order received', 'info'),
    processing: s('Processing', 'info'),
    shipped: s('Shipped', 'info'),
    delivered: s('Delivered', 'success'),
    returned: s('Returned', 'neutral'),
    stock_exception: s('Stock exception', 'danger'),
    // The buyer-facing name for stock_exception: a paid order short on stock.
    awaiting_stock: s('Awaiting stock', 'warning'),
    cancelled: s('Cancelled', 'neutral'),
  },
  payment: {
    unpaid: s('Unpaid', 'warning'),
    pending: s('Payment pending', 'warning'),
    paid: s('Paid', 'success'),
    success: s('Paid', 'success'),
    failed: s('Payment failed', 'danger'),
    refunded: s('Refunded', 'neutral'),
  },
  approval: {
    pending: s('Awaiting approval', 'warning'),
    approved: s('Approved', 'success'),
    rejected: s('Rejected', 'danger'),
  },
  stock: {
    in_stock: s('In stock', 'success'),
    low_stock: s('Low stock', 'warning'),
    out_of_stock: s('Out of stock', 'danger'),
    made_to_order: s('Made to order', 'info'),
  },
  // Production stages are configuration (PRODUCTION_STAGES on the API), so a
  // factory can rename them. These are the defaults; a renamed stage shows as
  // neutral text in the factory's own words.
  production: {
    production_planned: s('Planned', 'neutral'),
    planned: s('Planned', 'neutral'),
    cutting: s('Cutting', 'info'),
    sewing: s('Sewing', 'info'),
    finishing: s('Finishing', 'info'),
    qc: s('Quality check', 'warning'),
    quality_control: s('Quality check', 'warning'),
    completed: s('Completed', 'success'),
  },
  return: {
    requested: s('Return requested', 'warning'),
    resolved: s('Return resolved', 'success'),
    rejected: s('Return rejected', 'danger'),
  },
  account: {
    pending: s('Awaiting review', 'warning'),
    approved: s('Approved', 'success'),
    active: s('Active', 'success'),
    rejected: s('Rejected', 'danger'),
    disabled: s('Disabled', 'neutral'),
  },
  delivery: {
    pending: s('Not dispatched', 'warning'),
    in_transit: s('In transit', 'info'),
    delivered: s('Delivered', 'success'),
    failed: s('Delivery failed', 'danger'),
  },
  custom_order: {
    submitted: s('Submitted', 'warning'),
    under_review: s('Under review', 'info'),
    quoted: s('Quoted', 'warning'),
    quote_accepted: s('Quote accepted', 'info'),
    paid: s('Paid', 'success'),
    sample_in_production: s('Sample in production', 'info'),
    sample_approved: s('Sample approved', 'info'),
    in_production: s('In production', 'info'),
    fulfilled: s('Fulfilled', 'success'),
    delivered: s('Delivered', 'success'),
    declined: s('Declined', 'danger'),
    cancelled: s('Cancelled', 'neutral'),
  },
  review: {
    pending: s('Awaiting moderation', 'warning'),
    published: s('Published', 'success'),
    rejected: s('Rejected', 'danger'),
  },
  qc: {
    burned: s('Burned', 'danger'),
    repaired_restocked: s('Repaired and restocked', 'info'),
  },
};

/**
 * Looks a state up. An unknown value is shown as readable neutral text rather
 * than hidden, so a state the API adds later is visible until it is mapped.
 */
export function statusMeaning(
  kind: SeStatusKind,
  value: string | null | undefined,
): SeStatusMeaning {
  // "Quality Control", "quality-control" and "quality_control" are one state.
  const key = (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  const known = SE_STATUS[kind][key];
  if (known) return known;
  const words = key.replace(/[_-]+/g, ' ').trim();
  return { label: words ? words[0].toUpperCase() + words.slice(1) : 'Unknown', tone: 'neutral' };
}
