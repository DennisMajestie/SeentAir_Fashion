import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { API_BASE, TokenStore } from './auth-token.store';

export { API_BASE, authInterceptor } from './auth-token.store';

export interface PricingVariant {
  id: string;
  sku: string;
  size: string | null;
  colour: string | null;
  retailPrice: number;
  wholesalePrice: number;
}

export interface PricingProduct {
  id: string;
  name: string;
  category: string | null;
  retailPrice: number;
  wholesalePrice: number;
  variants: PricingVariant[];
}

export interface Pricing {
  tier: { name: string; discountPercent: number } | null;
  moq: number;
  total: number;
  data: PricingProduct[];
}

export interface Invoice {
  orderId: string;
  createdAt: string;
  status: string;
  paymentStatus: string;
  totalAmount: number;
  items: Array<{ sku: string; quantity: number; unitPrice: number; lineTotal: number }>;
  payments: Array<{ id: string; method: string; amount: number; date: string }>;
}

export interface CustomOrder {
  id: string;
  status: string;
  sizes: string;
  colours: string;
  quantity: number;
  location: string;
  fabricQuality: string;
  description: string;
  desiredDate: string;
  reviewNote: string | null;
  paidAt: string | null;
  createdAt: string;
}

/**
 * One delivery checkpoint as the API projects it for a wholesale buyer.
 * `zone` and `note` are optional because a customer-facing projection omits
 * them; the UI treats them as absent rather than rendering a blank.
 */
export interface DeliveryCheckpoint {
  zone?: string | null;
  status: string | null;
  note?: string | null;
  at: string | null;
}

/** A leg of the freight journey, some destinations need several. */
export interface DeliveryLegView {
  legNumber: number;
  carrier: string;
  status: 'pending' | 'in_transit' | 'delivered' | 'failed';
  trackingRef: string | null;
  /** Optional: absent from a customer-facing projection. */
  zone?: string | null;
  driverName: string | null;
  checkpoints: DeliveryCheckpoint[];
}

export interface WholesaleTracking {
  status: string;
  deliveredAt: string | null;
  /**
   * `note` is optional: a customer-facing projection omits it, because it is
   * staff-authored free text. The page already falls back to its own copy when
   * it is absent.
   */
  events: Array<{ status: string; note?: string | null; createdAt: string }>;
  deliveries: DeliveryLegView[];
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

  forgotPassword(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${API_BASE}/auth/forgot-password`, { email });
  }

  get isLoggedIn(): boolean {
    return !!this.store.token();
  }

  /** Signed-in buyer profile (name drives the W2 identity card). */
  me(): Observable<{ id: string; email: string; role: string; name: string }> {
    return this.http.get<{ id: string; email: string; role: string; name: string }>(
      `${API_BASE}/auth/me`,
    );
  }

  notifications(): Observable<{
    data: Array<{ id: string; type: string; message: string; sentAt: string }>;
    total: number;
  }> {
    return this.http.get<{
      data: Array<{ id: string; type: string; message: string; sentAt: string }>;
      total: number;
    }>(`${API_BASE}/notifications`);
  }

  pricing(): Observable<Pricing> {
    return this.http.get<Pricing>(`${API_BASE}/wholesale/pricing?limit=50`);
  }

  applyForAccount(): Observable<unknown> {
    return this.http.post(`${API_BASE}/wholesale/accounts`, {});
  }

  invoices(): Observable<{ data: Invoice[]; total: number }> {
    return this.http.get<{ data: Invoice[]; total: number }>(`${API_BASE}/wholesale/invoices`);
  }

  placeOrder(
    items: Array<{ variantId: string; quantity: number }>,
  ): Observable<{ id: string; totalAmount: number }> {
    return this.http.post<{ id: string; totalAmount: number }>(`${API_BASE}/orders`, {
      items,
      source: 'wholesale_portal',
    });
  }

  reorder(orderId: string): Observable<{ id: string }> {
    return this.http.post<{ id: string }>(`${API_BASE}/orders/${orderId}/reorder`, {});
  }

  tracking(orderId: string): Observable<WholesaleTracking> {
    return this.http.get<WholesaleTracking>(`${API_BASE}/orders/${orderId}/tracking`);
  }

  /**
   * Live status push for one order. Uses `fetch` + a stream reader rather than
   * `EventSource`, which cannot send an Authorization header and would force
   * the token into a query string. Frames are notifications only, this
   * re-fetches `tracking()`. Resolves quietly on error; the caller falls back
   * to polling.
   */
  async orderStream(
    orderId: string,
    onEvent: (kind: 'open' | 'status') => void,
    signal: AbortSignal,
  ): Promise<void> {
    const token = this.store.token();
    if (!token) return;
    let response: Response;
    try {
      response = await fetch(`${API_BASE}/orders/${orderId}/stream`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
        signal,
      });
    } catch {
      return;
    }
    if (!response.ok || !response.body) return;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // SSE frames are separated by a blank line.
        let split: number;
        while ((split = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);
          for (const line of frame.split('\n')) {
            if (!line.startsWith('event:')) continue;
            const kind = line.slice(6).trim();
            if (kind === 'open' || kind === 'status') onEvent(kind);
          }
        }
      }
    } catch {
      /* aborted or network dropped - caller falls back to polling */
    }
  }

  // --- Custom design requests (post-MVP module, now live) ---
  customOrders(): Observable<{ data: CustomOrder[]; total: number }> {
    return this.http.get<{ data: CustomOrder[]; total: number }>(`${API_BASE}/custom-orders`);
  }

  submitCustomOrder(body: {
    sizes: string;
    colours: string;
    quantity: number;
    location: string;
    fabricQuality: string;
    description: string;
    desiredDate: string;
  }): Observable<CustomOrder> {
    return this.http.post<CustomOrder>(`${API_BASE}/custom-orders`, body);
  }

  quotation(id: string): Observable<{ amount: number; note: string | null } | null> {
    return this.http.get<{ amount: number; note: string | null } | null>(
      `${API_BASE}/custom-orders/${id}/quotation`,
    );
  }

  acceptQuote(id: string): Observable<unknown> {
    return this.http.post(`${API_BASE}/custom-orders/${id}/accept-quote`, {});
  }

  decideSample(id: string, approved: boolean, note?: string): Observable<unknown> {
    return this.http.post(`${API_BASE}/custom-orders/${id}/sample-approval`, { approved, note });
  }
}
