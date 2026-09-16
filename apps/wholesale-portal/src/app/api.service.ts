import { HttpClient, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export const API_BASE = 'http://localhost:3000/api/v1';
const TOKEN_KEY = 'seentair.wholesale.accessToken';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  let token: string | null = null;
  try {
    token = localStorage.getItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
  if (token && req.url.startsWith(API_BASE)) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }
  return next(req);
};

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
  description: string;
  desiredDate: string;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  login(email: string, password: string): Observable<{ accessToken: string }> {
    return this.http.post<{ accessToken: string }>(`${API_BASE}/auth/login`, { email, password });
  }

  storeToken(accessToken: string): void {
    try {
      localStorage.setItem(TOKEN_KEY, accessToken);
    } catch {
      /* storage unavailable */
    }
  }

  logout(): void {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable */
    }
  }

  get isLoggedIn(): boolean {
    try {
      return !!localStorage.getItem(TOKEN_KEY);
    } catch {
      return false;
    }
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

  placeOrder(items: Array<{ variantId: string; quantity: number }>): Observable<{ id: string; totalAmount: number }> {
    return this.http.post<{ id: string; totalAmount: number }>(`${API_BASE}/orders`, {
      items,
      source: 'wholesale_portal',
    });
  }

  reorder(orderId: string): Observable<{ id: string }> {
    return this.http.post<{ id: string }>(`${API_BASE}/orders/${orderId}/reorder`, {});
  }

  tracking(orderId: string): Observable<{
    status: string;
    events: Array<{ status: string; note: string | null; createdAt: string }>;
  }> {
    return this.http.get<{
      status: string;
      events: Array<{ status: string; note: string | null; createdAt: string }>;
    }>(`${API_BASE}/orders/${orderId}/tracking`);
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
