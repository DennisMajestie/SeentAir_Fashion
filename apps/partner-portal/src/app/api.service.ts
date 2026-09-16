import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { API_BASE, TokenStore } from './auth-token.store';

export { API_BASE, authInterceptor } from './auth-token.store';

export interface PartnerDashboard {
  businessOverview: { totalIncome: number; profitLoss: { net: number; profit: number } };
  investmentInformation: {
    investedAmount: number;
    equityPercentage: number;
    shares: number;
    totalShares: number;
  };
  performance: { income: number; expenditure: number; net: number };
  inventoryVisibility: { finishedGoodsUnits: number };
  accountsReports: { income: { total: number }; profit: { net: number; profit: number } };
  profitSharing: Array<{
    period: string;
    totalProfit: number;
    dividendPool: number;
    myDividend: number;
  }>;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(TokenStore);

  login(email: string, password: string): Observable<{ accessToken: string }> {
    return this.http
      .post<{ accessToken: string }>(`${API_BASE}/auth/login`, { email, password })
      .pipe(tap((res) => this.store.set(res.accessToken)));
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
}
