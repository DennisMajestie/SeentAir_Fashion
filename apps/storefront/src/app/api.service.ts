import { HttpClient, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

/** Core API base — same NestJS backend all surfaces share. */
export const API_BASE = 'http://localhost:3000/api/v1';

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

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

const TOKEN_KEY = 'seentair.accessToken';

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

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

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
    return this.http.post<TokenPair>(`${API_BASE}/auth/login`, { email, password });
  }

  register(name: string, email: string, phone: string, password: string): Observable<TokenPair> {
    return this.http.post<TokenPair>(`${API_BASE}/auth/register`, {
      name,
      email,
      phone: phone || undefined,
      password,
    });
  }

  storeTokens(tokens: TokenPair): void {
    try {
      localStorage.setItem(TOKEN_KEY, tokens.accessToken);
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

  submitReview(orderId: string, variantId: string, rating: number, comment: string): Observable<unknown> {
    return this.http.post(`${API_BASE}/orders/${orderId}/review`, {
      variantId,
      rating,
      comment: comment || undefined,
    });
  }
}
