/** Shapes and helpers for the Partners screen. */

export interface PartnerRow {
  id: string;
  equityPercentage: number;
  investedAmount: number;
  user: { id: string; name: string; email: string };
}

export interface DistributionRow {
  id?: string;
  period: string;
  totalProfit: number;
  reinvestmentAmount: number;
  dividendPool: number;
  reserveAmount: number;
  perPartnerBreakdown: {
    founderCeo: number;
    partners: Array<{ partnerId?: string; name: string; amount: number }>;
  };
}

/** The confirmed covenant, as the API serves it on a partner dashboard. */
export interface ShareConfig {
  totalShares: number;
  founderSharePct: number;
  partnersSharePct: number;
  reinvestmentPct: number;
  dividendsPct: number;
  reservePct: number;
}

/** What a partner sees on their own portal, as served by GET /partners/:id/dashboard. */
export interface PartnerDashboard {
  config: ShareConfig;
  businessOverview: { totalIncome: number; profitLoss: unknown };
  investmentInformation: {
    investedAmount: number;
    equityPercentage: number;
    shares: number;
    totalShares: number;
  };
  inventoryVisibility: { finishedGoodsUnits: number };
  profitSharing: Array<{
    period: string;
    totalProfit: number;
    dividendPool: number;
    myDividend: number;
  }>;
}

/** Fallback until a dashboard has been read; matches the API defaults. */
export const DEFAULT_SHARE_CONFIG: ShareConfig = {
  totalShares: 1_000_000,
  founderSharePct: 60,
  partnersSharePct: 40,
  reinvestmentPct: 40,
  dividendsPct: 40,
  reservePct: 20,
};

export const allocatedEquity = (partners: ReadonlyArray<Pick<PartnerRow, 'equityPercentage'>>) =>
  partners.reduce((sum, p) => sum + Number(p.equityPercentage), 0);

export const sharesFor = (equityPercentage: number, totalShares: number): number =>
  Math.round((totalShares * Number(equityPercentage)) / 100);

/** One sentence for the page header, from configuration rather than from memory. */
export function covenantSentence(c: ShareConfig): string {
  return (
    `${c.totalShares.toLocaleString('en')} shares: ${c.founderSharePct}% founder, ` +
    `${c.partnersSharePct}% partners. Each quarter's profit is split ${c.reinvestmentPct}% ` +
    `reinvested, ${c.dividendsPct}% paid out as dividends and ${c.reservePct}% kept in reserve.`
  );
}

/** Quarter labels the way the business writes them: 2026-Q4. */
export const PERIOD_PATTERN = /^\d{4}-Q[1-4]$/;
