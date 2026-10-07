export interface AccountRow {
  id: string;
  status: string;
  createdAt: string;
  reviewedAt?: string | null;
  user: { name: string; email: string };
  tier: { id: string; name: string } | null;
  // Application-form details. Null on rows created through the one-click apply
  // in the catalogue, so every read here has to tolerate null.
  businessName: string | null;
  buyerType: string | null;
  businessPhone: string | null;
  city: string | null;
  state: string | null;
  openingVolume: number | null;
}

export interface TierRow {
  id: string;
  name: string;
  discountPercent: number;
  ruleDescription: string | null;
}

/** "Aba, Abia" from whatever the applicant supplied; empty when neither. */
export const place = (row: { city: string | null; state: string | null }): string =>
  [row.city, row.state].filter((v): v is string => !!v && v.length > 0).join(', ');

const BUYER_LABELS: Record<string, string> = {
  retailer: 'Retailer or boutique',
  online_reseller: 'Online reseller',
  institution: 'Institution',
  distributor: 'Distributor',
  other: 'Other',
};

/** Buyer type is stored as a machine value; staff read a label. */
export const buyerLabel = (value: string | null): string =>
  BUYER_LABELS[value ?? ''] ?? 'Not given';

export const tierLabel = (t: TierRow): string => `${t.name} (${t.discountPercent}% off)`;
