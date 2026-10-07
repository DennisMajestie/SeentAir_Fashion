import { SeBadgeTone } from '@seentair/ui';

export interface CampaignRow {
  id: string;
  name: string;
  type: string;
  channel: string | null;
  discountPercent: number | null;
  startDate: string;
  endDate: string;
}

export const CAMPAIGN_TYPES: { value: string; label: string }[] = [
  { value: 'campaign', label: 'Campaign' },
  { value: 'promotion', label: 'Promotion' },
  { value: 'loyalty', label: 'Loyalty' },
  { value: 'visibility_boost', label: 'Visibility boost' },
];

export const campaignTypeLabel = (type: string): string =>
  CAMPAIGN_TYPES.find((t) => t.value === type)?.label ?? type.replaceAll('_', ' ');

/** Where a campaign is in its run, from its dates alone (the API keeps no state). */
export type CampaignRun = 'upcoming' | 'live' | 'ended';

export const campaignRun = (c: CampaignRow, today = new Date()): CampaignRun => {
  const day = today.toISOString().slice(0, 10);
  if (c.startDate > day) return 'upcoming';
  if (c.endDate < day) return 'ended';
  return 'live';
};

/** Not a domain state the shared mapping knows yet, so the tone lives here. */
export const CAMPAIGN_RUN_BADGE: Record<CampaignRun, { label: string; tone: SeBadgeTone }> = {
  upcoming: { label: 'Upcoming', tone: 'info' },
  live: { label: 'Live', tone: 'success' },
  ended: { label: 'Ended', tone: 'neutral' },
};

/** Order sources and channels are stored as typed-in slugs: "instagram", "seed:reference-ratings". */
export const sourceLabel = (value: string | null): string => {
  if (!value) return 'Unattributed';
  const words = value.replace(/[_:-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};
