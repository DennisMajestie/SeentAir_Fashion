import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of, tap } from 'rxjs';
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
  /**
   * Parent product name. The order endpoint does not send this yet, so every
   * consumer must treat it as absent and fall back to the SKU. Widened here
   * ahead of the matching API change so the fallback is the only path exercised
   * until the backend starts populating it.
   */
  product?: { id: string; name: string } | null;
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
  /**
   * The product's own photograph (products.primary_image_url): an absolute URL
   * for admin uploads, a resolvable path for seeded assets. Read through
   * productImage() — the storefront's one hierarchy for "which photo do we
   * show", never raw. Optional because older API builds predate the column.
   */
  primaryImageUrl?: string | null;
  /**
   * Seller-applied "Bestseller" merchandising label (products.is_bestseller).
   * Optional because older API builds predate the column: consumers must treat
   * missing as "not flagged", never as "flagged". It is a label, not a claim --
   * real popularity stays on `soldCount`.
   */
  isBestseller?: boolean;
  /**
   * How many separate paid orders contain this product, from the public
   * catalogue endpoint. Counts orders rather than units, so the storefront can
   * honestly say "N bought". Absent from older API builds, hence optional:
   * consumers must treat missing as "no sales data", not as zero sales.
   */
  soldCount?: number;
  /**
   * Timed sale: `salePercent` off until `saleEndsAt` (ISO). `salePrice` is the
   * discounted base price and is set only while the sale is live, so it doubles
   * as the "is this on sale right now" flag. All absent on older API builds and
   * null on a product that is not on sale. Read them through pricing.ts.
   */
  salePercent?: number | null;
  saleEndsAt?: string | null;
  salePrice?: number | null;
  /**
   * Audience segment for filtering. Derived from category on the API side;
   * optional here so older API builds don't break. Consumers should treat
   * missing as "unclassified".
   */
  segment?: string | null;
}

export interface Order {
  id: string;
  status: string;
  paymentStatus: string;
  totalAmount: number;
  /** Final delivery fee as saved when the order was created. Null when not priced. */
  deliveryFee?: number | null;
  createdAt: string;
  /**
   * Shipping address as captured at checkout. The API has sent this since the
   * address work; the interface was simply never widened to match.
   */
  shippingAddress?: ShippingAddress | null;
  /** Set by the API the moment the order reaches `delivered`. */
  deliveredAt?: string | null;
  /** Courier/rider instructions staff recorded separately from the address. */
  deliveryNote?: string | null;
  /**
   * Returned once, on creating a guest order: the key that opens it without an
   * account. Stored locally so the confirmation page works after the Paystack
   * round-trip; the same link also arrives by email.
   */
  trackingToken?: string;
  items: Array<{ variant: ProductVariant; quantity: number; unitPrice: number }>;
}

/**
 * How the order is getting to the customer. Mirrors the API's own enum rather
 * than inventing a third spelling: `pickup` is never delivered, so it is never
 * charged.
 */
export type DeliveryMethod = 'freight' | 'pickup';

/**
 * What the API says delivery costs for a basket and destination. The fee is for
 * DISPLAY only - order creation re-reads prices and re-verifies the quote, so
 * a tampered response cannot change what is charged.
 */
export interface DeliveryQuote {
  status: 'quoted' | 'not_applicable' | 'unserviceable_state' | 'no_rate' | 'empty';
  method: DeliveryMethod;
  sizeClass: string | null;
  zoneName: string | null;
  stateName: string | null;
  /** Kobo, so no float arithmetic happens on the client. */
  feeKobo: number;
  estimate: string;
  freeDeliveryApplied: boolean;
  quoteId?: string;
  expiresAt?: string;
}

/** Delivery destination captured at checkout. The API stores this as free-form
    jsonb on the order, so the shape is ours to keep stable. */
export interface ShippingAddress {
  state: string;
  city: string;
  line: string;
  phone: string;
  landmark?: string;
}

/** How a coupon reduces an order. Mirrors the API's coupon_type enum. */
export type CouponType = 'percent_off' | 'fixed_off' | 'free_delivery';

/** Why a coupon in the wallet cannot be used on this basket. */
export type CouponRejection =
  | 'MIN_SPEND'
  | 'EXPIRED'
  | 'NOT_STARTED'
  | 'USAGE_CAP'
  | 'PER_CUSTOMER_CAP'
  | 'NEW_CUSTOMERS_ONLY'
  | 'EXCLUDED_ITEMS'
  | 'SALE_ITEMS'
  | 'NOT_COMBINABLE'
  | 'INACTIVE';

/**
 * One coupon the API evaluated against the basket. `customerCouponId` is the
 * wallet row to send back when placing the order — the coupon id is not enough,
 * a coupon is only the shopper's once they hold it.
 */
export interface EligibleCoupon {
  customerCouponId: string;
  couponId: string;
  code: string;
  name: string;
  type: CouponType;
  /** Major units the coupon is worth on this basket. */
  discount: number;
  /** Present only on coupons that were evaluated but cannot be used. */
  rejection?: CouponRejection;
}

/** The priced order the API would charge with the chosen coupon applied. */
export interface CouponTotals {
  subtotal: number;
  itemDiscount: number;
  deliveryFee: number;
  deliveryWaived: number;
  taxableBase: number;
  vat: number;
  total: number;
}

/**
 * The result of previewing coupons for a basket. Read-only: it reserves
 * nothing, so it is safe to call as the basket changes. `status` is
 * `disabled` when the platform's coupon feature is switched off, in which case
 * the card must render nothing.
 */
export interface CouponPreview {
  status: 'ok' | 'disabled';
  selected: { item: EligibleCoupon | null; freeDelivery: EligibleCoupon | null };
  eligible: EligibleCoupon[];
  /** Why a code the shopper typed could not be used, when one was sent. */
  codeRejection?: CouponRejection;
  /** How much more must be spent to unlock a coupon, in major units. */
  nudge: { spendMore: number; code: string } | null;
  totals: CouponTotals | null;
}

/** One basket line as the preview endpoint wants it. */
export interface CouponPreviewLine {
  variantId: string;
  productId: string;
  categoryIds: string[];
  quantity: number;
  unitPrice: number;
  isOnSale: boolean;
  taxExempt?: boolean;
}

export interface CouponPreviewRequest {
  lines: CouponPreviewLine[];
  state?: string;
  method?: DeliveryMethod;
  subtotal: number;
  code?: string;
}

/** Access token only, the refresh token never reaches page JavaScript. */
export interface TokenPair {
  accessToken: string;
}

/**
 * One delivery checkpoint as the API projects it for a customer: status and
 * time only. `zone` and `note` are deliberately absent from this type - the
 * customer-facing projection omits them, because they are staff-authored free
 * text and an internal corridor label.
 */
export interface DeliveryCheckpoint {
  status: string | null;
  at: string | null;
}

/** A leg of the journey to the customer, some destinations need several. */
export interface DeliveryLegView {
  legNumber: number;
  carrier: string;
  status: 'pending' | 'in_transit' | 'delivered' | 'failed';
  trackingRef: string | null;
  /** Already reduced to a first name by the API. */
  driverName: string | null;
  checkpoints: DeliveryCheckpoint[];
}

export interface OrderTracking {
  status: string;
  deliveredAt: string | null;
  /** `note` is optional: the customer projection omits staff-authored free text. */
  events: Array<{ status: string; note?: string | null; createdAt: string }>;
  deliveries: DeliveryLegView[];
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(TokenStore);

  // --- Catalogue (public) ---
  /**
   * Catalogue page. `limit` is explicit because the shop grid filters and sorts
   * client-side over the whole set, so it must be able to ask for more than one
   * page rather than silently truncating at the default.
   */
  products(
    page = 1,
    limit = 50,
  ): Observable<{ data: Product[]; total: number }> {
    return this.http.get<{ data: Product[]; total: number }>(
      `${API_BASE}/products?page=${page}&limit=${limit}`,
    );
  }

  product(id: string): Observable<Product> {
    return this.http.get<Product>(`${API_BASE}/products/${id}`);
  }

  /** The full review list for one product — used by the product page. */
  reviews(
    productId: string,
  ): Observable<{ data: Array<{ rating: number; comment: string | null }>; total: number }> {
    return this.http.get<{
      data: Array<{ rating: number; comment: string | null }>;
      total: number;
    }>(`${API_BASE}/products/${productId}/reviews`);
  }

  /**
   * Ratings for a whole page of products in one request. Replaces a per-card
   * `reviews(id)` call, which cost one round trip per card on every grid load.
   */
  ratingSummaries(
    productIds: string[],
  ): Observable<Array<{ productId: string; avg: number; count: number }>> {
    if (productIds.length === 0) return of([]);
    const params = productIds
      .map((id) => `productId=${encodeURIComponent(id)}`)
      .join('&');
    return this.http.get<Array<{ productId: string; avg: number; count: number }>>(
      `${API_BASE}/reviews/summaries?${params}`,
    );
  }

  // --- Wishlist (account-scoped; the local copy is merged in on sign-in) ---
  wishlist(): Observable<Array<{ product: Product; addedAt: string }>> {
    return this.http.get<Array<{ product: Product; addedAt: string }>>(`${API_BASE}/wishlist`);
  }

  addToWishlist(productId: string): Observable<unknown> {
    return this.http.post(`${API_BASE}/wishlist/items`, { productId });
  }

  removeFromWishlist(productId: string): Observable<unknown> {
    return this.http.delete(`${API_BASE}/wishlist/items/${productId}`);
  }

  /** Folds a guest's local wishlist into their account. Called once, on sign-in. */
  mergeWishlist(productIds: string[]): Observable<{ merged: number }> {
    return this.http.post<{ merged: number }>(`${API_BASE}/wishlist/merge`, { productIds });
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

  /** Current account, used to tell a seeded dev login from a real shopper. */
  me(): Observable<{ id: string; email: string; name: string; role: string }> {
    return this.http.get<{ id: string; email: string; name: string; role: string }>(
      `${API_BASE}/auth/me`,
    );
  }

  get isLoggedIn(): boolean {
    return !!this.store.token();
  }

  // --- Orders ---
  /**
   * `guest` is sent only when nobody is signed in. The API rejects it alongside
   * a token, so passing both would fail the whole order.
   */
  createOrder(
    items: Array<{ variantId: string; quantity: number }>,
    source?: string,
    shippingAddress?: ShippingAddress,
    guest?: { name: string; email: string },
    deliveryMethod?: DeliveryMethod,
    quoteId?: string,
    customerCouponId?: string,
  ): Observable<Order> {
    return this.http.post<Order>(`${API_BASE}/orders`, {
      items,
      source,
      ...(shippingAddress ? { shippingAddress } : {}),
      ...(guest ? { guest } : {}),
      ...(deliveryMethod ? { deliveryMethod } : {}),
      // Sent only when the quote endpoint produced one. The API ignores it while
      // delivery pricing is off, and requires it while it is on.
      ...(quoteId ? { quoteId } : {}),
      // A coupon the shopper is spending, named by its wallet row. Ignored by
      // the API while the coupon feature is off or for a guest order.
      ...(customerCouponId ? { customerCouponId } : {}),
    });
  }

  /**
   * Asks the API what delivery costs for this basket and destination.
   *
   * Public and unauthenticated, because a guest must be able to see a delivery
   * figure before deciding to sign in. The returned quoteId is what order
   * creation is checked against; the fee is never trusted from the response,
   * only displayed.
   */
  deliveryQuote(request: {
    state: string;
    lines: Array<{ variantId: string; sizeClass?: string; quantity: number; unitPrice: number }>;
    method: DeliveryMethod;
    subtotal: number;
  }): Observable<DeliveryQuote> {
    return this.http.post<DeliveryQuote>(`${API_BASE}/checkout-shipping/quote`, request);
  }

  /**
   * What the shopper's held coupons are worth on this basket, and what the
   * order would cost with the best one applied. Read-only — it reserves
   * nothing — so the cart and checkout can call it on every change. Requires a
   * signed-in shopper: a coupon is tied to an account.
   */
  previewCoupon(request: CouponPreviewRequest): Observable<CouponPreview> {
    return this.http.post<CouponPreview>(`${API_BASE}/coupons/preview`, request);
  }

  /**
   * Adds a coupon to the shopper's wallet by typed code. Idempotent: asking
   * twice returns the entry already held rather than minting a duplicate.
   */
  claimCoupon(code: string): Observable<{ wallet: unknown; alreadyHeld: boolean }> {
    return this.http.post<{ wallet: unknown; alreadyHeld: boolean }>(
      `${API_BASE}/coupons/claim`,
      { code },
    );
  }

  verifyEmail(token: string): Observable<{ message: string; ordersClaimed: number }> {
    return this.http.post<{ message: string; ordersClaimed: number }>(
      `${API_BASE}/auth/verify-email`,
      { token },
    );
  }

  resendVerification(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${API_BASE}/auth/resend-verification`, { email });
  }

  myOrders(): Observable<{ data: Order[]; total: number }> {
    return this.http.get<{ data: Order[]; total: number }>(`${API_BASE}/orders`);
  }

  /** `token` opens a guest's own order with no session; ignored when signed in. */
  order(id: string, token?: string): Observable<Order> {
    const query = token ? `?token=${encodeURIComponent(token)}` : '';
    return this.http.get<Order>(`${API_BASE}/orders/${id}${query}`);
  }

  /** `token` opens a guest's own order with no session; ignored when signed in. */
  tracking(orderId: string, token?: string): Observable<OrderTracking> {
    const query = token ? `?token=${encodeURIComponent(token)}` : '';
    return this.http.get<OrderTracking>(`${API_BASE}/orders/${orderId}/tracking${query}`);
  }

  /**
   * Live status push for one order. Uses `fetch` + a stream reader rather than
   * `EventSource` because EventSource cannot send an Authorization header, and
   * putting the access token in the query string would leak it into logs and
   * referrers. Frames are notifications only, this re-fetches `tracking()`.
   *
   * Yields a `false` signal when the stream ends or errors, which is the
   * caller's cue to fall back to polling. Never throws.
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

  /** Socket.IO notifications only prompt a fresh authorized tracking request. */
  async orderSocketStream(
    orderId: string,
    onEvent: (kind: 'open' | 'status') => void,
    signal: AbortSignal,
    guestToken?: string,
  ): Promise<void> {
    if (signal.aborted) return;
    const { io } = await import('socket.io-client');
    if (signal.aborted) return;

    const socket = io(new URL(API_BASE, window.location.origin).origin, {
      withCredentials: true,
      reconnection: false,
      auth: (callback) => callback({ token: this.store.token() }),
    });

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', finish);
        socket.removeAllListeners();
        socket.disconnect();
        resolve();
      };
      signal.addEventListener('abort', finish, { once: true });
      socket.on('connect', () => {
        socket.emit(
          'order:subscribe',
          { orderId, ...(guestToken ? { guestToken } : {}) },
          (response: { ok?: boolean }) => {
            if (!response?.ok) return finish();
            onEvent('open');
          },
        );
      });
      socket.on('order:updated', (event: { orderId?: string }) => {
        if (event.orderId === orderId) onEvent('status');
      });
      socket.on('connect_error', finish);
      socket.on('disconnect', finish);
    });
  }

  /** `email` overrides where Paystack sends the receipt. The API refuses it in
      production unless PAYSTACK_EMAIL_OVERRIDE_ALLOWED is explicitly on, so
      only send it when the shopper actually changed it. */
  payWithPaystack(
    orderId: string,
    amount: number,
    email?: string,
    token?: string,
  ): Observable<{ authorizationUrl: string }> {
    // A guest has no session: the tracking token from checkout is what lets
    // them pay for the order they just placed.
    const qs = token ? `?token=${encodeURIComponent(token)}` : '';
    return this.http.post<{ authorizationUrl: string }>(
      `${API_BASE}/orders/${orderId}/payment${qs}`,
      {
        method: 'paystack',
        amount,
        ...(email ? { email } : {}),
      },
    );
  }

  notifications(): Observable<{
    data: Array<{
      id: string;
      type: string;
      message: string;
      sentAt: string;
      relatedOrderId: string | null;
    }>;
    total: number;
  }> {
    return this.http.get<{
      data: Array<{
        id: string;
        type: string;
        message: string;
        sentAt: string;
        relatedOrderId: string | null;
      }>;
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

  submitReview(
    orderId: string,
    variantId: string,
    rating: number,
    comment: string,
    token?: string,
  ): Observable<unknown> {
    const query = token ? `?token=${encodeURIComponent(token)}` : '';
    return this.http.post(`${API_BASE}/orders/${orderId}/review${query}`, {
      variantId,
      rating,
      comment: comment || undefined,
    });
  }

  createSpecialRequest(payload: {
    type: 'size' | 'logistics' | 'preorder';
    productName: string;
    variant?: string;
    desiredSize?: string;
    destination?: string;
    quantity: number;
    contact: string;
    note?: string;
    productId?: string;
    variantId?: string;
  }): Observable<{ id: string }> {
    return this.http.post<{ id: string }>(`${API_BASE}/special-requests`, payload);
  }
}
