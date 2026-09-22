import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { API_BASE, TokenStore } from './auth-token.store';

export { API_BASE, authInterceptor } from './auth-token.store';

export interface ProductVariant {
  id: string;
  sku: string;
  size: string | null;
  colour: string | null;
  priceOverride: number | null;
  imageUrl: string | null;
  availabilityStatus: string;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  basePrice: number;
  collection: { id: string; name: string } | null;
  createdAt: string;
  variants: ProductVariant[];
}

export interface Order {
  id: string;
  status: string;
  paymentStatus: string;
  totalAmount: number;
  createdAt: string;
  items: Array<{ variant: ProductVariant; quantity: number; unitPrice: number }>;
}

/** Access token only — the refresh token never reaches page JavaScript. */
export interface TokenPair {
  accessToken: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(TokenStore);

  // --- Catalogue (public) ---
  products(): Observable<{ data: Product[]; total: number }> {
    return this.http.get<{ data: Product[]; total: number }>(`${API_BASE}/products?limit=50`);
  }

  product(id: string): Observable<Product> {
    return this.http.get<Product>(`${API_BASE}/products/${id}`);
  }

  reviews(productId: string): Observable<{ data: Array<{ rating: number; comment: string | null }>; total: number }> {
    return this.http.get<{ data: Array<{ rating: number; comment: string | null }>; total: number }>(
      `${API_BASE}/products/${productId}/reviews`,
    );
  }

  // --- Auth ---
  login(email: string, password: string): Observable<TokenPair> {
    return this.http
      .post<TokenPair>(`${API_BASE}/auth/login`, { email, password })
      .pipe(tap((res) => this.store.set(res.accessToken)));
  }

  register(name: string, email: string, phone: string, password: string): Observable<TokenPair> {
    return this.http
      .post<TokenPair>(`${API_BASE}/auth/register`, {
        name,
        email,
        phone: phone || undefined,
        password,
      })
      .pipe(tap((res) => this.store.set(res.accessToken)));
  }

  forgotPassword(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${API_BASE}/auth/forgot-password`, { email });
  }

  resetPassword(token: string, newPassword: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${API_BASE}/auth/reset-password`, {
      token,
      newPassword,
    });
  }

  /** Server-side logout (revokes sessions, clears the cookie), then local wipe. */
  logout(): void {
    this.http.post(`${API_BASE}/auth/logout`, {}).subscribe({
      complete: () => this.store.set(null),
      error: () => this.store.set(null),
    });
  }

  get isLoggedIn(): boolean {
    return !!this.store.token();
  }

  // --- Orders ---
  createOrder(items: Array<{ variantId: string; quantity: number }>, source?: string): Observable<Order> {
    return this.http.post<Order>(`${API_BASE}/orders`, { items, source });
  }

  myOrders(): Observable<{ data: Order[]; total: number }> {
    return this.http.get<{ data: Order[]; total: number }>(`${API_BASE}/orders`);
  }

  order(id: string): Observable<Order> {
    return this.http.get<Order>(`${API_BASE}/orders/${id}`);
  }

  tracking(orderId: string): Observable<{
    status: string;
    deliveredAt: string | null;
    events: Array<{ status: string; note: string | null; createdAt: string }>;
  }> {
    return this.http.get<{
      status: string;
      deliveredAt: string | null;
      events: Array<{ status: string; note: string | null; createdAt: string }>;
    }>(`${API_BASE}/orders/${orderId}/tracking`);
  }

  payWithPaystack(orderId: string, amount: number): Observable<{ authorizationUrl: string }> {
    return this.http.post<{ authorizationUrl: string }>(`${API_BASE}/orders/${orderId}/payment`, {
      method: 'paystack',
      amount,
    });
  }

  notifications(): Observable<{
    data: Array<{ id: string; type: string; message: string; sentAt: string; relatedOrderId: string | null }>;
    total: number;
  }> {
    return this.http.get<{
      data: Array<{ id: string; type: string; message: string; sentAt: string; relatedOrderId: string | null }>;
      total: number;
    }>(`${API_BASE}/notifications`);
  }

  requestReturn(
    orderId: string,
    variantId: string,
    quantity: number,
    reason: string,
  ): Observable<unknown> {
    return this.http.post(`${API_BASE}/returns`, { orderId, variantId, quantity, reason });
  }

  submitReview(orderId: string, variantId: string, rating: number, comment: string): Observable<unknown> {
    return this.http.post(`${API_BASE}/orders/${orderId}/review`, {
      variantId,
      rating,
      comment: comment || undefined,
    });
  }
}
