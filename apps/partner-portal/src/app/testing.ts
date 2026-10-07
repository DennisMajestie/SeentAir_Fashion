import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SeCurrencyService } from '@seentair/ui';
import { PartnerDashboard } from './api.service';
import { PortalStore } from './portal.store';

/** Shared test set-up for the partner portal's page specs. */

/** A dashboard payload the way partners.service.ts serves it: aggregates only. */
export function dashboard(over: Partial<PartnerDashboard> = {}): PartnerDashboard {
  return {
    config: {
      totalShares: 1_000_000,
      founderSharePct: 60,
      partnersSharePct: 40,
      reinvestmentPct: 40,
      dividendsPct: 40,
      reservePct: 20,
    },
    businessOverview: {
      totalIncome: 2_777_000,
      profitLoss: { income: 2_777_000, expenditure: 250_000, profit: 2_527_000, net: 2_527_000 },
    },
    investmentInformation: {
      investedAmount: 2_000_000,
      equityPercentage: 25,
      shares: 250_000,
      totalShares: 1_000_000,
    },
    performance: { income: 2_777_000, expenditure: 250_000, profit: 2_527_000, net: 2_527_000 },
    inventoryVisibility: { finishedGoodsUnits: 1148 },
    accountsReports: {
      income: { total: 2_777_000 },
      profit: { income: 2_777_000, expenditure: 250_000, profit: 2_527_000, net: 2_527_000 },
    },
    profitSharing: [
      { period: '2026-Q3', totalProfit: 1_000_000, dividendPool: 400_000, myDividend: 100_000 },
    ],
    ...over,
  };
}

/** Puts a loaded dashboard in the store without any HTTP. */
export function configurePortal(dash: PartnerDashboard | null = dashboard()): void {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
  });
  TestBed.inject(SeCurrencyService).config.set({
    currencyCode: 'NGN',
    currencySymbol: '₦',
    locale: 'en-NG',
  });
  const store = TestBed.inject(PortalStore);
  store.dash.set(dash);
  store.me.set({
    id: 'p1',
    email: 'partner@seentair.test',
    name: 'Test Partner',
    role: 'partner_investor',
    totpEnabled: false,
  });
}
