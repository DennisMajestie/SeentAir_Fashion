import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { API_BASE, TokenStore } from './auth-token.store';

export { API_BASE, authInterceptor } from './auth-token.store';

export interface Dashboard {
  salesToday: { orders: number; revenue: number };
  profitLoss: { income: number; expenditure: number; net: number };
  salesByChannel: Array<{ channel: string; orders: number; revenue: number }>;
  marketingSourcePerformance: Array<{ source: string; orders: number; revenue: number }>;
  production: Array<{ stage: string; batches: number }>;
  inventory: {
    finishedGoodsUnits: number;
    lowStockMaterialCount: number;
    lowStockMaterials: Array<{ name: string; currentQuantity: number; reorderThreshold: number }>;
  };
  pendingApprovals: number;
}

export interface Approval {
  id: string;
  actionType: string;
  status: string;
  payload: unknown;
  requestedBy: { name: string };
  createdAt: string;
}

export interface Batch {
  id: string;
  quantity: number;
  stage: string;
  variant: { sku: string };
  plannedDate: string | null;
}

export interface AdminOrder {
  id: string;
  channel: string;
  status: string;
  paymentStatus: string;
  totalAmount: number;
  createdAt: string;
  customer: { name: string } | null;
}

export interface ReturnRequest {
  id: string;
  status: string;
  reason: string;
  quantity: number;
  requestedAt: string;
  returnDeadline: string;
  variant: { sku: string };
  order: { id: string };
}

export interface AuditEntry {
  id: string;
  actorId: string | null;
  action: string;
  timestamp: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(TokenStore);

  login(
    email: string,
    password: string,
  ): Observable<{ accessToken?: string; requires2fa?: boolean; challengeToken?: string }> {
    return this.http
      .post<{ accessToken?: string; requires2fa?: boolean; challengeToken?: string }>(
        `${API_BASE}/auth/login`,
        { email, password },
      )
      .pipe(tap((res) => res.accessToken && this.store.set(res.accessToken)));
  }

  verify2fa(challengeToken: string, code: string): Observable<{ accessToken: string }> {
    return this.http
      .post<{ accessToken: string }>(`${API_BASE}/auth/2fa/verify`, { challengeToken, code })
      .pipe(tap((res) => this.store.set(res.accessToken)));
  }

  me(): Observable<{ name: string; email: string; role: string; totpEnabled: boolean }> {
    return this.http.get<{ name: string; email: string; role: string; totpEnabled: boolean }>(
      `${API_BASE}/auth/me`,
    );
  }

  setup2fa(): Observable<{ secret: string; otpauthUrl: string }> {
    return this.http.post<{ secret: string; otpauthUrl: string }>(`${API_BASE}/auth/2fa/setup`, {});
  }

  enable2fa(code: string): Observable<{ enabled: boolean }> {
    return this.http.post<{ enabled: boolean }>(`${API_BASE}/auth/2fa/enable`, { code });
  }

  disable2fa(code: string): Observable<{ enabled: boolean }> {
    return this.http.post<{ enabled: boolean }>(`${API_BASE}/auth/2fa/disable`, { code });
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

  dashboard(): Observable<Dashboard> {
    return this.http.get<Dashboard>(`${API_BASE}/analytics/dashboard`);
  }

  bestSellers(): Observable<Array<{ sku: string; productName: string; unitsSold: number; revenue: number }>> {
    return this.http.get<Array<{ sku: string; productName: string; unitsSold: number; revenue: number }>>(
      `${API_BASE}/analytics/best-sellers?limit=5`,
    );
  }

  pendingApprovals(): Observable<Approval[]> {
    return this.http.get<Approval[]>(`${API_BASE}/approvals/pending`);
  }

  decideApproval(id: string, decision: 'approved' | 'rejected'): Observable<unknown> {
    return this.http.post(`${API_BASE}/approvals/${id}/decide`, { decision });
  }

  batches(): Observable<{ data: Batch[]; stages: string[] }> {
    return this.http.get<{ data: Batch[]; stages: string[] }>(`${API_BASE}/production-batches?limit=100`);
  }

  moveBatch(id: string, stage: string): Observable<unknown> {
    return this.http.patch(`${API_BASE}/production-batches/${id}/stage`, { stage });
  }

  orders(channel?: string): Observable<{ data: AdminOrder[]; total: number }> {
    const query = channel ? `&channel=${channel}` : '';
    return this.http.get<{ data: AdminOrder[]; total: number }>(`${API_BASE}/orders?limit=50${query}`);
  }

  advanceOrder(id: string, status: string): Observable<unknown> {
    return this.http.patch(`${API_BASE}/orders/${id}/status`, { status });
  }

  returns(): Observable<{ data: ReturnRequest[]; total: number }> {
    return this.http.get<{ data: ReturnRequest[]; total: number }>(`${API_BASE}/returns`);
  }

  resolveReturn(
    id: string,
    resolution: string,
    disposition: 'restocked' | 'damaged',
  ): Observable<unknown> {
    return this.http.patch(`${API_BASE}/returns/${id}/resolve`, {
      decision: 'resolved',
      resolution,
      restocked: disposition === 'restocked',
      damaged: disposition === 'damaged',
    });
  }

  auditLog(): Observable<{ data: AuditEntry[]; total: number }> {
    return this.http.get<{ data: AuditEntry[]; total: number }>(`${API_BASE}/audit-log?limit=50`);
  }
}
