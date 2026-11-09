import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subject, catchError, debounceTime, map, of, switchMap, tap } from 'rxjs';
import {
  ApiService,
  CouponPreview,
  DeliveryMethod,
  EligibleCoupon,
} from './api.service';

/** The basket facts the preview endpoint needs. `state`/`method` are only known
    once the shopper has reached the delivery step; without them the API quotes
    no delivery fee, so a free-delivery coupon is simply worth nothing yet. */
export interface CouponContext {
  lines: Array<{
    variantId: string;
    productId: string;
    quantity: number;
    unitPrice: number;
    /** True when the line is still on a timed sale; some coupons refuse those. */
    isOnSale: boolean;
    taxExempt?: boolean;
  }>;
  subtotal: number;
  state?: string;
  method?: DeliveryMethod;
}

/**
 * The one place the cart and checkout share coupon state.
 *
 * The API auto-picks the best coupon a shopper holds — there is no "choose your
 * coupon" here, only "what did the API say this basket is worth". The card on
 * both pages renders `preview()`, and the order sends `customerCouponId()`.
 *
 * Requests are debounced and switched, so typing in a quantity stepper or
 * retyping a code fires one call rather than a burst against the preview
 * endpoint's rate limit.
 */
@Injectable({ providedIn: 'root' })
export class CouponService {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly requests = new Subject<CouponContext>();
  /** Kept so a claim can re-preview without the caller re-building the basket. */
  private lastContext: CouponContext | null = null;

  readonly preview = signal<CouponPreview | null>(null);
  readonly loading = signal(false);
  readonly codeError = signal<string | null>(null);
  /** False once the shopper opts out of the auto-picked coupon. */
  readonly useBest = signal(true);

  /** True only while the API says the whole coupon feature is switched on. */
  readonly enabled = computed(() => this.preview()?.status === 'ok');

  /**
   * The best coupon the API found, whether or not the shopper has opted out.
   * The API previews an item coupon and a free-delivery coupon separately, but
   * an order carries a single wallet row — so an item coupon wins, and a
   * free-delivery coupon is only used when there is no item coupon to spend.
   */
  readonly best = computed<EligibleCoupon | null>(() => {
    const p = this.preview();
    if (!p || p.status !== 'ok') return null;
    return p.selected.item ?? p.selected.freeDelivery ?? null;
  });

  /** The coupon that will actually be sent with the order. */
  readonly applied = computed<EligibleCoupon | null>(() =>
    this.useBest() ? this.best() : null,
  );

  readonly customerCouponId = computed(() => this.applied()?.customerCouponId ?? null);
  readonly discount = computed(() => this.applied()?.discount ?? 0);
  readonly nudge = computed(() => this.preview()?.nudge ?? null);

  constructor() {
    this.requests
      .pipe(
        debounceTime(300),
        switchMap((ctx) => {
          this.loading.set(true);
          return this.api
            .previewCoupon({
              lines: ctx.lines.map((l) => ({ ...l, categoryIds: [] })),
              subtotal: ctx.subtotal,
              ...(ctx.state ? { state: ctx.state } : {}),
              ...(ctx.method ? { method: ctx.method } : {}),
            })
            .pipe(catchError(() => of(null)));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((res) => {
        this.loading.set(false);
        // A failed call leaves the last good preview in place rather than
        // flashing the coupon away on a transient error.
        if (res) this.preview.set(res);
      });
  }

  /** Asks the API to re-price the basket. A no-op when signed out: a coupon
      needs an account, and the endpoint is authenticated. */
  refresh(context: CouponContext): void {
    this.lastContext = context;
    if (!this.api.isLoggedIn) return;
    this.requests.next(context);
  }

  /**
   * Claims a typed code into the wallet, then re-previews so the new coupon
   * lands in the card. Returns whether the code was accepted.
   */
  claim(code: string): Observable<boolean> {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return of(false);
    this.codeError.set(null);
    return this.api.claimCoupon(trimmed).pipe(
      tap(() => {
        this.useBest.set(true);
        if (this.lastContext) this.refresh(this.lastContext);
      }),
      map(() => true),
      catchError((err) => {
        this.codeError.set(err?.error?.message ?? 'That code could not be used.');
        return of(false);
      }),
    );
  }

  /** Drops the shop's state after an order, so the next basket starts clean. */
  reset(): void {
    this.preview.set(null);
    this.codeError.set(null);
    this.useBest.set(true);
  }
}
