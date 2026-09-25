import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { API_BASE, TokenStore } from './auth-token.store';

export { API_BASE, authInterceptor } from './auth-token.store';

/** Ledger report shapes mirror services/api accounting.service report(). */
export interface LedgerReportPeriod {
  from: string | null;
  to: string | null;
}

export interface ProfitReport {
  type?: string;
  period?: LedgerReportPeriod;
  income: number;
  expenditure: number;
  profit: number;
  net: number;
}

export interface IncomeReport {
  type?: string;
  period?: LedgerReportPeriod;
  total: number;
  byType?: Record<string, number>;
}

/** Confirmed covenant from server configuration (partners.service.ts dashboard). */
export interface DashboardConfig {
  totalShares: number;
  founderSharePct: number;
  partnersSharePct: number;
  reinvestmentPct: number;
  dividendsPct: number;
  reservePct: number;
}

export interface PartnerDashboard {
  config: DashboardConfig;
  businessOverview: { totalIncome: number; profitLoss: ProfitReport };
  investmentInformation: {
    investedAmount: number;
    equityPercentage: number;
    shares: number;
    totalShares: number;
  };
  performance: ProfitReport;
  inventoryVisibility: { finishedGoodsUnits: number };
  accountsReports: { income: IncomeReport; profit: ProfitReport };
  profitSharing: Array<{
    period: string;
    totalProfit: number;
    dividendPool: number;
    myDividend: number;
  }>;
}

/** Login either completes (access token) or demands the TOTP second step. */
export type LoginResult = { accessToken: string } | { requires2fa: true; challengeToken: string };

export interface Me {
  id: string;
  email: string;
  name: string;
  role: string;
  totpEnabled: boolean;
}

/** One row of the live event-sourced stock summary (inventory/summary). */
export interface InventorySummaryRow {
  itemType: string;
  itemId: string;
  currentQuantity: number;
  byMovementType: Record<string, number>;
}

/** In-platform message delivered to this partner account (notifications). */
export interface PartnerMessage {
  id: string;
  channel: 'in_platform' | 'sms' | 'whatsapp';
  type: string;
  relatedOrderId: string | null;
  message: string;
  status: 'sent' | 'failed' | 'skipped';
  sentAt: string;
}

/** Public product catalogue compound for labelling variant registers. */
export interface ProductVariantRef {
  id: string;
  sku: string;
  size: string | null;
  colour: string | null;
  /** Added by the store from the owning product row. */
  name?: string;
}

export interface ProductRef {
  id: string;
  name: string;
  variants: ProductVariantRef[];
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(TokenStore);

  login(email: string, password: string): Observable<LoginResult> {
    return this.http.post<LoginResult>(`${API_BASE}/auth/login`, { email, password }).pipe(
      tap((res) => {
        if ('accessToken' in res) this.store.set(res.accessToken);
      }),
    );
  }

  /** Step 2 of a 2FA login — exchanges the challenge token + TOTP code for a session. */
  verify2fa(challengeToken: string, code: string): Observable<{ accessToken: string }> {
    return this.http
      .post<{ accessToken: string }>(`${API_BASE}/auth/2fa/verify`, { challengeToken, code })
      .pipe(tap((res) => this.store.set(res.accessToken)));
  }

  me(): Observable<Me> {
    return this.http.get<Me>(`${API_BASE}/auth/me`);
  }

  /** Begin TOTP enrolment: secret + otpauth URI for an authenticator app. */
  setup2fa(): Observable<{ secret: string; otpauthUrl: string }> {
    return this.http.post<{ secret: string; otpauthUrl: string }>(`${API_BASE}/auth/2fa/setup`, {});
  }

  enable2fa(code: string): Observable<unknown> {
    return this.http.post(`${API_BASE}/auth/2fa/enable`, { code });
  }

  disable2fa(code: string): Observable<unknown> {
    return this.http.post(`${API_BASE}/auth/2fa/disable`, { code });
  }

  logout(): void {
    this.http.post(`${API_BASE}/auth/logout`, {}).subscribe({
      complete: () => this.store.set(null),
      error: () => this.store.set(null),
    });
  }

  get isLoggedIn(): boolean {
    return !!this.store.token();
  }

  dashboard(): Observable<PartnerDashboard> {
    return this.http.get<PartnerDashboard>(`${API_BASE}/partners/me/dashboard`);
  }

  /** Per-item current stock quantities (partner has INVENTORY VIEW). */
  inventorySummary(): Observable<InventorySummaryRow[]> {
    return this.http.get<InventorySummaryRow[]>(`${API_BASE}/inventory/summary`);
  }

  /** In-platform messages addressed to this account (notifications inbox). */
  messages(limit = 50): Observable<{ data: PartnerMessage[]; total: number }> {
    return this.http.get<{ data: PartnerMessage[]; total: number }>(
      `${API_BASE}/notifications?limit=${limit}`,
    );
  }

  /** Public catalogue — used to label variant stock rows with product names. */
  products(limit = 500): Observable<{ data: ProductRef[]; total: number }> {
    return this.http.get<{ data: ProductRef[]; total: number }>(
      `${API_BASE}/products?limit=${limit}`,
    );
  }
}
