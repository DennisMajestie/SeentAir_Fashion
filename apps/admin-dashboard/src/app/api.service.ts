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

/** Reorder view: materials under threshold + variants running thin. */
export interface LowStock {
  materials: Array<{
    id: string;
    name: string;
    unit: string;
    currentQuantity: number;
    reorderThreshold: number;
  }>;
  variants: Array<{ variantId: string; currentQuantity: number }>;
  variantThreshold: number;
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
  source?: string | null;
  deliveredAt?: string | null;
  customer: { id: string; name: string } | null;
  items?: Array<{ id: string; quantity: number; unitPrice: number; variant: { id: string; sku: string; size?: string | null; colour?: string | null } }>;
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
  beforeState?: unknown;
  afterState?: unknown;
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

  lowStock(variantThreshold = 10): Observable<LowStock> {
    return this.http.get<LowStock>(
      `${API_BASE}/analytics/low-stock?variantThreshold=${variantThreshold}`,
    );
  }
  dashboard(): Observable<Dashboard> {
    return this.http.get<Dashboard>(`${API_BASE}/analytics/dashboard`);
  }

  bestSellers(direction: 'best' | 'slow' = 'best', limit = 5): Observable<Array<{ sku: string; productName: string; unitsSold: number; revenue: number }>> {
    return this.http.get<Array<{ sku: string; productName: string; unitsSold: number; revenue: number }>>(
      `${API_BASE}/analytics/best-sellers?limit=${limit}&direction=${direction}`,
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

  batch(id: string): Observable<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(`${API_BASE}/production-batches/${id}`);
  }

  moveBatch(id: string, stage: string): Observable<unknown> {
    return this.http.patch(`${API_BASE}/production-batches/${id}/stage`, { stage });
  }

  orders(channel?: string, limit = 50): Observable<{ data: AdminOrder[]; total: number }> {
    const query = channel ? `&channel=${channel}` : '';
    return this.http.get<{ data: AdminOrder[]; total: number }>(`${API_BASE}/orders?limit=${limit}${query}`);
  }

  order(id: string): Observable<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(`${API_BASE}/orders/${id}`);
  }

  orderTracking(id: string): Observable<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(`${API_BASE}/orders/${id}/tracking`);
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

  auditLog(filters?: { action?: string; actorId?: string; from?: string; to?: string; page?: number; limit?: number }): Observable<{ data: AuditEntry[]; total: number }> {
    const p = new URLSearchParams();
    p.set('limit', String(filters?.limit ?? 50));
    if (filters?.page) p.set('page', String(filters.page));
    if (filters?.action) p.set('action', filters.action);
    if (filters?.actorId) p.set('actorId', filters.actorId);
    if (filters?.from) p.set('from', filters.from);
    if (filters?.to) p.set('to', filters.to);
    return this.http.get<{ data: AuditEntry[]; total: number }>(`${API_BASE}/audit-log?${p.toString()}`);
  }

  // --- Approvals helper: gated forms request an approval, management decides in the queue ---
  createApproval(actionType: string, payload: Record<string, unknown>): Observable<{ id: string }> {
    return this.http.post<{ id: string }>(`${API_BASE}/approvals`, { actionType, payload });
  }

  // --- Catalogue management ---
  products(): Observable<{ data: Array<Record<string, unknown>>; total: number }> {
    return this.http.get<{ data: Array<Record<string, unknown>>; total: number }>(`${API_BASE}/products?limit=100`);
  }
  createProduct(body: Record<string, unknown>): Observable<unknown> {
    return this.http.post(`${API_BASE}/products`, body);
  }
  updateProduct(id: string, body: Record<string, unknown>): Observable<unknown> {
    return this.http.patch(`${API_BASE}/products/${id}`, body);
  }
  productVariants(productId: string): Observable<Array<Record<string, unknown>>> {
    return this.http.get<Array<Record<string, unknown>>>(`${API_BASE}/products/${productId}/variants`);
  }
  createVariant(productId: string, body: Record<string, unknown>): Observable<unknown> {
    return this.http.post(`${API_BASE}/products/${productId}/variants`, body);
  }
  collections(): Observable<Array<{ id: string; name: string }>> {
    return this.http.get<Array<{ id: string; name: string }>>(`${API_BASE}/collections`);
  }
  createCollection(name: string): Observable<unknown> {
    return this.http.post(`${API_BASE}/collections`, { name });
  }

  // --- Materials ---
  materials(): Observable<Array<Record<string, unknown>>> {
    return this.http.get<Array<Record<string, unknown>>>(`${API_BASE}/materials`);
  }
  lowStockMaterials(): Observable<Array<Record<string, unknown>>> {
    return this.http.get<Array<Record<string, unknown>>>(`${API_BASE}/materials/low-stock`);
  }
  material(id: string): Observable<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(`${API_BASE}/materials/${id}`);
  }
  createMaterial(body: Record<string, unknown>): Observable<unknown> {
    return this.http.post(`${API_BASE}/materials`, body);
  }
  recordPurchase(materialId: string, body: Record<string, unknown>): Observable<unknown> {
    return this.http.post(`${API_BASE}/materials/${materialId}/purchase`, body);
  }
  recordUsage(materialId: string, body: Record<string, unknown>): Observable<unknown> {
    return this.http.post(`${API_BASE}/materials/${materialId}/usage`, body);
  }

  // --- Wholesale admin ---
  wholesaleAccounts(): Observable<Array<Record<string, unknown>>> {
    return this.http.get<Array<Record<string, unknown>>>(`${API_BASE}/wholesale/accounts`);
  }
  wholesaleAccount(id: string): Observable<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(`${API_BASE}/wholesale/accounts/${id}`);
  }
  reviewWholesaleAccount(id: string, body: Record<string, unknown>): Observable<unknown> {
    return this.http.patch(`${API_BASE}/wholesale/accounts/${id}`, body);
  }
  tiers(): Observable<Array<Record<string, unknown>>> {
    return this.http.get<Array<Record<string, unknown>>>(`${API_BASE}/wholesale/tiers`);
  }
  createTier(body: Record<string, unknown>): Observable<unknown> {
    return this.http.post(`${API_BASE}/wholesale/tiers`, body);
  }
  updateTier(id: string, body: Record<string, unknown>): Observable<unknown> {
    return this.http.patch(`${API_BASE}/wholesale/tiers/${id}`, body);
  }

  // --- Custom orders admin ---
  customOrders(): Observable<{ data: Array<Record<string, unknown>>; total: number }> {
    return this.http.get<{ data: Array<Record<string, unknown>>; total: number }>(`${API_BASE}/custom-orders?limit=50`);
  }
  customOrder(id: string): Observable<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(`${API_BASE}/custom-orders/${id}`);
  }
  customQuotation(id: string): Observable<Record<string, unknown> | null> {
    return this.http.get<Record<string, unknown> | null>(`${API_BASE}/custom-orders/${id}/quotation`);
  }
  issueQuotation(id: string, amount: number, note?: string): Observable<unknown> {
    return this.http.post(`${API_BASE}/custom-orders/${id}/quotation`, { amount, note });
  }
  recordCustomPayment(id: string, method: string, amount: number): Observable<unknown> {
    return this.http.post(`${API_BASE}/custom-orders/${id}/payment`, { method, amount });
  }
  updateCustomStatus(id: string, status: string): Observable<unknown> {
    return this.http.patch(`${API_BASE}/custom-orders/${id}/status`, { status });
  }

  // --- Accounting ---
  ledger(type?: string): Observable<{ data: Array<Record<string, unknown>>; total: number }> {
    const q = type ? `&type=${type}` : '';
    return this.http.get<{ data: Array<Record<string, unknown>>; total: number }>(`${API_BASE}/accounting/ledger?limit=50${q}`);
  }
  report(type: string): Observable<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(`${API_BASE}/accounting/reports/${type}`);
  }
  recordLedgerEntry(body: Record<string, unknown>): Observable<unknown> {
    return this.http.post(`${API_BASE}/accounting/ledger`, body);
  }

  // --- Staff ---
  users(): Observable<{ data: Array<Record<string, unknown>>; total: number }> {
    return this.http.get<{ data: Array<Record<string, unknown>>; total: number }>(`${API_BASE}/users?limit=100`);
  }
  user(id: string): Observable<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(`${API_BASE}/users/${id}`);
  }
  createUser(body: Record<string, unknown>): Observable<unknown> {
    return this.http.post(`${API_BASE}/users`, body);
  }
  changeRole(id: string, role: string): Observable<unknown> {
    return this.http.patch(`${API_BASE}/users/${id}/role`, { role });
  }

  // --- Logistics ---
  deliveries(): Observable<{ data: Array<Record<string, unknown>>; total: number }> {
    return this.http.get<{ data: Array<Record<string, unknown>>; total: number }>(`${API_BASE}/deliveries`);
  }
  deliveryTracking(id: string): Observable<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(`${API_BASE}/deliveries/${id}/tracking`);
  }
  createDelivery(body: Record<string, unknown>): Observable<unknown> {
    return this.http.post(`${API_BASE}/deliveries`, body);
  }
  updateDeliveryStatus(id: string, status: string): Observable<unknown> {
    return this.http.patch(`${API_BASE}/deliveries/${id}/status`, { status });
  }
  deliveryPricing(): Observable<Array<Record<string, unknown>>> {
    return this.http.get<Array<Record<string, unknown>>>(`${API_BASE}/logistics/pricing`);
  }
  upsertPricing(body: Record<string, unknown>): Observable<unknown> {
    return this.http.post(`${API_BASE}/logistics/pricing`, body);
  }
  quote(weightKg: number, zone: string): Observable<{ cost: number }> {
    return this.http.get<{ cost: number }>(`${API_BASE}/logistics/quote?weightKg=${weightKg}&zone=${encodeURIComponent(zone)}`);
  }

  // --- Production (create/cost/QC) ---
  createBatch(body: Record<string, unknown>): Observable<unknown> {
    return this.http.post(`${API_BASE}/production-batches`, body);
  }
  recordBatchCost(id: string, body: Record<string, unknown>): Observable<unknown> {
    return this.http.post(`${API_BASE}/production-batches/${id}/cost`, body);
  }
  batchCost(id: string): Observable<Record<string, unknown> | null> {
    return this.http.get<Record<string, unknown> | null>(`${API_BASE}/production-batches/${id}/cost`);
  }
  recordQcRejection(id: string, body: Record<string, unknown>): Observable<unknown> {
    return this.http.post(`${API_BASE}/production-batches/${id}/qc-rejection`, body);
  }
  qcRejections(id: string): Observable<Array<Record<string, unknown>>> {
    return this.http.get<Array<Record<string, unknown>>>(`${API_BASE}/production-batches/${id}/qc-rejections`);
  }

  // --- Reviews moderation ---
  pendingReviews(): Observable<Array<Record<string, unknown>>> {
    return this.http.get<Array<Record<string, unknown>>>(`${API_BASE}/reviews/pending`);
  }
  moderateReview(id: string, status: 'published' | 'rejected'): Observable<unknown> {
    return this.http.patch(`${API_BASE}/reviews/${id}/status`, { status });
  }

  // --- Inventory ledger ---
  inventorySummary(): Observable<Array<{ itemType: string; itemId: string; currentQuantity: number; byMovementType: Record<string, number> }>> {
    return this.http.get<Array<{ itemType: string; itemId: string; currentQuantity: number; byMovementType: Record<string, number> }>>(`${API_BASE}/inventory/summary`);
  }
  movements(itemId: string, itemType: 'variant' | 'material'): Observable<{ data: Array<Record<string, unknown>>; total: number; currentQuantity: number }> {
    return this.http.get<{ data: Array<Record<string, unknown>>; total: number; currentQuantity: number }>(`${API_BASE}/inventory/${itemId}/movements?itemType=${itemType}`);
  }
  recordMovement(itemId: string, itemType: 'variant' | 'material', body: Record<string, unknown>): Observable<unknown> {
    return this.http.post(`${API_BASE}/inventory/${itemId}/movements?itemType=${itemType}`, body);
  }

  // --- Partners administration ---
  partners(): Observable<Array<Record<string, unknown>>> {
    return this.http.get<Array<Record<string, unknown>>>(`${API_BASE}/partners`);
  }
  createPartner(body: Record<string, unknown>): Observable<unknown> {
    return this.http.post(`${API_BASE}/partners`, body);
  }
  partnerDashboard(partnerId: string): Observable<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(`${API_BASE}/partners/${partnerId}/dashboard`);
  }
  partnerDistributions(partnerId: string): Observable<Array<Record<string, unknown>>> {
    return this.http.get<Array<Record<string, unknown>>>(`${API_BASE}/partners/${partnerId}/profit-distributions`);
  }
  createDistribution(body: Record<string, unknown>): Observable<Record<string, unknown>> {
    return this.http.post<Record<string, unknown>>(`${API_BASE}/profit-distributions`, body);
  }

  // --- Notifications ---
  sendNotification(body: Record<string, unknown>): Observable<unknown> {
    return this.http.post(`${API_BASE}/notifications/send`, body);
  }

  // --- Approvals history ---
  approvalsHistory(status?: string): Observable<{ data: Approval[]; total: number }> {
    const q = status ? `?status=${status}` : '';
    return this.http.get<{ data: Approval[]; total: number }>(`${API_BASE}/approvals${q}`);
  }

  // --- Marketing ---
  campaigns(): Observable<Array<Record<string, unknown>>> {
    return this.http.get<Array<Record<string, unknown>>>(`${API_BASE}/campaigns`);
  }
  createCampaign(body: Record<string, unknown>): Observable<unknown> {
    return this.http.post(`${API_BASE}/campaigns`, body);
  }
}
