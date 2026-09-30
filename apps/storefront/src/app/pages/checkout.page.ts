import { CommonModule } from '@angular/common';
import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, ShippingAddress } from '../api.service';
import { BrandAlertService } from '../brand-alert.service';
import { CartService } from '../cart.service';

/** GIGL delivers nationwide, so the state list is all 36 plus FCT. */
const NIGERIAN_STATES = [
  'Abia',
  'Adamawa',
  'Akwa Ibom',
  'Anambra',
  'Bauchi',
  'Bayelsa',
  'Benue',
  'Borno',
  'Cross River',
  'Delta',
  'Ebonyi',
  'Edo',
  'Ekiti',
  'Enugu',
  'FCT: Abuja',
  'Gombe',
  'Imo',
  'Jigawa',
  'Kaduna',
  'Kano',
  'Katsina',
  'Kebbi',
  'Kogi',
  'Kwara',
  'Lagos',
  'Nasarawa',
  'Niger',
  'Ogun',
  'Ondo',
  'Osun',
  'Oyo',
  'Plateau',
  'Rivers',
  'Sokoto',
  'Taraba',
  'Yobe',
  'Zamfara',
] as const;

/** Checkout, Stitch approved screen, stages 02 "Final payment" and
    03 "Order placed": manifest with thumbnails, condition-gated policy
    notices, summary card (dashed divider + gradient total), sign-in,
    sticky CTA footer with in-flight spinner, safe-area + WCAG AA. */
@Component({
  selector: 'app-checkout',
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="stage-bar u-rise">
      <div class="stage-label-line">
        <b>{{ orderId() ? 'Stage 03 · Order placed' : 'Stage 02 · Final payment' }}</b>
        <span>Step {{ orderId() ? 3 : 2 }} of 3</span>
      </div>
      <div
        class="stage-segs"
        role="progressbar"
        [attr.aria-label]="
          orderId() ? 'Checkout progress, step 3 of 3' : 'Checkout progress, step 2 of 3'
        "
        aria-valuemin="1"
        aria-valuemax="3"
        [attr.aria-valuenow]="orderId() ? 3 : 2"
      >
        <span class="seg on"></span><span class="seg on"></span
        ><span class="seg" [class.on]="!!orderId()"></span>
      </div>
    </div>
    <h1 class="page-title">Cart & checkout</h1>

    @if (orderId()) {
      <section class="success-box u-rise box-narrow">
        <h2>Order placed</h2>
        <p class="sku-line">Reference // {{ orderId() }}</p>
        @if (paystackUrl()) {
          <p class="muted small">Final payment due: settle online or offline below.</p>
          <a class="cta" [href]="paystackUrl()!"
            >Pay with Paystack [₦{{ paidTotal() | number: '1.0-0' }}]</a
          >
        } @else if (paymentError()) {
          <!-- The order exists, so the generic error banner below is unreachable.
               This panel is the only place the customer can still see that
               payment failed, so it has to carry the reason and a way out. -->
          <div class="notice notice-error u-rise" role="alert">
            <svg
              class="notice-icon"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              aria-hidden="true"
              focusable="false"
            >
              <circle cx="10" cy="10" r="8.2" />
              <path d="M10 5.6v5.4M10 13.9h.01" stroke-linecap="round" />
            </svg>
            <span>
              <span class="notice-title">Online payment unavailable</span>
              {{ paymentError() }} Your order is reserved: nothing is lost, and you can retry here
              or pay offline.
            </span>
          </div>
          <button class="cta" type="button" (click)="startPayment()" [disabled]="startingPayment()">
            {{ startingPayment() ? 'Opening Paystack…' : 'Retry online payment' }}
          </button>
          <div class="settlement-box">
            <strong>Or settle directly.</strong> Pay the exact total
            <strong>₦{{ paidTotal() | number: '1.0-0' }}</strong> by bank transfer, cash, or POS and
            our team will confirm it. No part-payments.
          </div>
        } @else {
          <div class="settlement-box">
            <strong>Direct settlement.</strong> Online payment is not available right now. Your
            order is reserved: pay the exact total by <strong>bank transfer, cash, or POS</strong>
            and our team will confirm it. No part-payments.
          </div>
        }
        <p class="small"><a routerLink="/account">Track it from your account →</a></p>
      </section>
    } @else if (cart.items().length === 0) {
      <div class="empty-state u-rise">
        <span class="empty-state-icon" aria-hidden="true"
          ><svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="m8.2 12.4 2.6 2.6 5-5.2" /></svg
        ></span>
        <h2 class="empty-state-title">Nothing to check out</h2>
        <p class="empty-state-sub">Add something to your cart first, then come back here.</p>
        <p class="empty-state-cta"><a class="cta" routerLink="/shop">Back to the shop</a></p>
      </div>
    } @else {
      @if (cart.moqEligible) {
        <div class="notice notice-warn u-rise" role="status">
          <svg
            class="notice-icon"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M10 2.2 18.4 17H1.6L10 2.2Zm0 4-1.2 6h2.4L10 6.2Zm0 8.1a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Z"
            />
          </svg>
          <span>
            <span class="notice-title">Wholesale eligibility</span>
            {{ cart.count | number: '2.0' }} units meets the 20-unit MOQ, tiered wholesale pricing
            and bulk dispatch apply via the wholesale portal. This retail order is final at the
            retail rate.
          </span>
        </div>
      }
      @if (cart.hasMadeToOrder) {
        <div class="notice notice-warn u-rise" role="status">
          <svg
            class="notice-icon"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M9 2.5 1.8 15.5A1 1 0 0 0 2.8 17h14.4a1 1 0 0 0 1-1.5L11 2.5a1 1 0 0 0-2 0Z" />
            <path d="M10 7v4M10 13.5h.01" />
          </svg>
          <span>
            <span class="notice-title">Made to order</span>
            One or more pieces are produced on request, sample approval and a production run happen
            before dispatch, so allow extra time.
          </span>
        </div>
      }

      @if (error()) {
        <div class="notice notice-error u-rise" role="alert">
          <svg
            class="notice-icon"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            aria-hidden="true"
            focusable="false"
          >
            <circle cx="10" cy="10" r="8.2" />
            <path d="M10 5.6v5.4M10 13.9h.01" stroke-linecap="round" />
          </svg>
          <span>{{ error() }}</span>
        </div>
      }

      <div class="checkout-cols">
        <div class="u-rise">
          <p class="section-label">
            Order manifest <span class="count">[{{ cart.count | number: '2.0' }} items]</span>
          </p>
          @for (item of cart.items(); track item.variantId) {
            <div class="manifest-row">
              @if (item.imageUrl) {
                <img
                  class="m-thumb"
                  [src]="item.imageUrl"
                  [alt]="item.productName"
                  loading="lazy"
                />
              } @else {
                <div class="m-thumb m-thumb-monogram" aria-hidden="true">
                  {{ item.productName.charAt(0) }}
                </div>
              }
              <div class="m-body">
                <p class="sku-line">{{ item.sku }}</p>
                <p class="m-name">{{ item.productName }}</p>
                <p class="muted small">
                  {{ item.size || '-' }} / {{ item.colour || '-' }} × {{ item.quantity }}
                </p>
              </div>
              <span class="m-price">₦{{ item.unitPrice * item.quantity | number: '1.0-2' }}</span>
            </div>
          }

          <div #details class="checkout-details">
            @if (!api.isLoggedIn) {
              <p class="section-label">Your details</p>
              <!-- No account needed to buy. Name and email only: the email
                   carries the receipt and the tracking link, and Paystack
                   cannot take a payment without one. Signing in is offered,
                   never required. -->
              <div class="auth-box checkout-auth">
                <label
                  >Full name
                  <input [(ngModel)]="name" name="name" required placeholder="e.g. Kojo Mensah" />
                </label>
                <label
                  >Email
                  <input
                    type="email"
                    [(ngModel)]="email"
                    name="email"
                    required
                    placeholder="you@example.com"
                  />
                  <small class="fine">Your receipt and order tracking link go here.</small>
                </label>
                @if (showSignIn()) {
                  <label
                    >Password
                    <input
                      type="password"
                      [(ngModel)]="password"
                      name="password"
                      required
                      minlength="8"
                      autocomplete="current-password"
                    />
                  </label>
                  <button class="cta" type="button" (click)="signIn()">Sign in</button>
                }
                <button class="link" type="button" (click)="toggleSignIn()">
                  {{
                    showSignIn()
                      ? 'Continue as a guest instead'
                      : 'Have an account? Sign in to use your saved details'
                  }}
                </button>
              </div>
              @if (signinError()) {
                <div class="notice notice-error u-rise" role="alert">
                  <svg
                    class="notice-icon"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.6"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <circle cx="10" cy="10" r="8.2" />
                    <path d="M10 5.6v5.4M10 13.9h.01" stroke-linecap="round" />
                  </svg>
                  <span>{{ signinError() }}</span>
                </div>
              }
            }

            <p class="section-label">Delivery address</p>
            <div class="auth-box checkout-auth">
              <label
                >State
                <select [(ngModel)]="shipState" name="shipState" required>
                  <option value="" disabled>Select a state</option>
                  @for (s of NIGERIAN_STATES; track s) {
                    <option [value]="s">{{ s }}</option>
                  }
                </select>
              </label>
              <label
                >City / LGA
                <input [(ngModel)]="shipCity" name="shipCity" required placeholder="e.g. Yaba" />
              </label>
              <label
                >Address
                <input
                  [(ngModel)]="shipLine"
                  name="shipLine"
                  required
                  placeholder="Street, house number"
                />
              </label>
              <label
                >Delivery phone
                <input
                  type="tel"
                  [(ngModel)]="shipPhone"
                  name="shipPhone"
                  required
                  placeholder="+234 800 000 0000"
                />
              </label>
              <label
                >Landmark <span class="muted">(optional, helps the rider)</span>
                <input [(ngModel)]="shipLandmark" name="shipLandmark" />
              </label>
              @if (deliveryError()) {
                <div class="notice notice-error u-rise" role="alert">
                  <svg
                    class="notice-icon"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.6"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <circle cx="10" cy="10" r="8.2" />
                    <path d="M10 5.6v5.4M10 13.9h.01" stroke-linecap="round" />
                  </svg>
                  <span>{{ deliveryError() }}</span>
                </div>
              }
            </div>

            @if (isDevAccount()) {
              <p class="section-label">Payment receipt</p>
              <div class="auth-box checkout-auth">
                <label
                  >Send the Paystack receipt to
                  <input
                    type="email"
                    [(ngModel)]="receiptEmail"
                    name="receiptEmail"
                    placeholder="you@example.com"
                  />
                </label>
                <p class="muted small">
                  This account is on the reserved <code>.test</code> domain, which Paystack's
                  validator rejects. Enter a real inbox to receive the receipt. Leave blank to use
                  the order address. Overrides are refused in production.
                </p>
              </div>
            }
          </div>
        </div>

        <aside class="matrix-panel u-rise-1" aria-label="Order summary">
          <p class="section-label flush-top">Order summary</p>
          <div class="matrix-row">
            <span>Subtotal</span><span>₦{{ cart.total | number: '1.0-2' }}</span>
          </div>
          <div class="matrix-row"><span>Payment policy</span><span>full &amp; upfront</span></div>
          <div class="matrix-row"><span>Delivery</span><span>quoted at dispatch</span></div>
          <div class="matrix-divider"></div>
          <div class="matrix-total">
            <span class="label">Total due</span>
            <span class="value">₦{{ cart.total | number: '1.0-0' }}</span>
          </div>
          <div class="settlement-box">
            Paystack (card/bank)- or pay offline by <strong>bank transfer / cash / POS</strong>,
            confirmed by our team.
          </div>
        </aside>
      </div>

      <div class="sticky-cta u-rise-2">
        <div class="scta-inner">
          <span class="scta-trust">Final payment · secured by Paystack</span>
          <button class="cta" type="button" (click)="proceed()" [disabled]="placing()">
            @if (placing()) {
              <span class="btn-loading"
                ><span class="spinner" aria-hidden="true"></span>Placing order…</span
              >
            } @else {
              {{ api.isLoggedIn ? 'Proceed to payment →' : 'Sign in to continue' }}
            }
          </button>
        </div>
      </div>
    }
  `,
})
export class CheckoutPage {
  readonly cart = inject(CartService);
  readonly api = inject(ApiService);
  private readonly alerts = inject(BrandAlertService);
  private readonly details = viewChild<ElementRef<HTMLElement>>('details');

  /** Guest checkout is the default; sign-in is revealed on request. */
  readonly showSignIn = signal(false);
  readonly placing = signal(false);
  readonly error = signal<string | null>(null);
  readonly signinError = signal<string | null>(null);
  readonly deliveryError = signal<string | null>(null);
  readonly orderId = signal<string | null>(null);
  readonly paystackUrl = signal<string | null>(null);
  readonly paidTotal = signal(0);
  /** Why the payment session failed. Separate from error(), which only renders
      in the pre-order branch and is therefore invisible once an order exists. */
  readonly paymentError = signal<string | null>(null);
  readonly startingPayment = signal(false);

  /** Logged-in account email, used to detect a seeded `.test` login. */
  readonly accountEmail = signal<string | null>(null);
  readonly isDevAccount = computed(
    () => this.accountEmail()?.toLowerCase().endsWith('.test') ?? false,
  );

  readonly NIGERIAN_STATES = NIGERIAN_STATES;

  name = '';
  phone = '';
  email = '';
  password = '';

  shipState = '';
  shipCity = '';
  shipLine = '';
  shipPhone = '';
  shipLandmark = '';
  receiptEmail = '';

  constructor() {
    this.loadAccount();
  }

  /** Reads the signed-in account so the receipt override only shows for
      seeded `.test` logins. A 401 here is expected when signed out. */
  private loadAccount(): void {
    if (!this.api.isLoggedIn) {
      this.accountEmail.set(null);
      return;
    }
    this.api.me().subscribe({
      next: (user) => this.accountEmail.set(user.email),
      error: () => this.accountEmail.set(null),
    });
  }

  /** Signing in is an alternative to guest checkout, never a gate before it. */
  toggleSignIn(): void {
    this.showSignIn.set(!this.showSignIn());
    this.signinError.set(null);
  }

  signIn(): void {
    this.signinError.set(null);
    this.api.login(this.email, this.password).subscribe({
      next: () => this.loadAccount(),
      error: () => this.signinError.set('Sign-in failed: check your email and password.'),
    });
  }

  proceed(): void {
    if (this.placing()) return;
    // A guest is not turned away, only asked for the two fields the order
    // genuinely needs: who to address it to, and where to send the receipt.
    if (!this.api.isLoggedIn) {
      const missingGuest = this.guestMissing();
      if (missingGuest) {
        this.deliveryError.set(missingGuest);
        this.details()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
    const missing = this.deliveryMissing();
    if (missing) {
      this.deliveryError.set(missing);
      this.details()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    this.deliveryError.set(null);
    this.placeOrder();
  }

  /** The two fields a guest order cannot be placed without. */
  private guestMissing(): string | null {
    if (!this.name.trim()) return 'Add your name so we know who the parcel is for.';
    const email = this.email.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return 'Add a valid email: your receipt and tracking link go there.';
    }
    return null;
  }

  /** GIGL cannot route a parcel without state, city, a street and a phone. */
  private deliveryMissing(): string | null {
    if (!this.shipState) return 'Choose a delivery state so we can route the parcel.';
    if (!this.shipCity.trim()) return 'Add your city or LGA.';
    if (!this.shipLine.trim()) return 'Add your street address and house number.';
    if (!this.shipPhone.trim()) return 'Add a phone the rider can reach you on.';
    return null;
  }

  private shippingAddress(): ShippingAddress {
    return {
      state: this.shipState,
      city: this.shipCity.trim(),
      line: this.shipLine.trim(),
      phone: this.shipPhone.trim(),
      ...(this.shipLandmark.trim() ? { landmark: this.shipLandmark.trim() } : {}),
    };
  }

  private placeOrder(): void {
    this.placing.set(true);
    this.error.set(null);
    const items = this.cart.items().map((i) => ({ variantId: i.variantId, quantity: i.quantity }));
    const guest = this.api.isLoggedIn
      ? undefined
      : { name: this.name.trim(), email: this.email.trim().toLowerCase() };
    this.api.createOrder(items, 'storefront', this.shippingAddress(), guest).subscribe({
      next: (order) => {
        this.orderId.set(order.id);
        // The only time the raw token exists. Kept so the confirmation page
        // still opens the order after the Paystack round-trip; the same link
        // is emailed, so losing this is inconvenient, not fatal.
        if (order.trackingToken) {
          try {
            localStorage.setItem(`seentair.order.${order.id}`, order.trackingToken);
          } catch {
            /* private mode: the emailed link remains the route in */
          }
        }
        this.paidTotal.set(order.totalAmount);
        this.cart.clear();
        void this.alerts.toast(`Order placed: ref ${order.id.slice(0, 8).toUpperCase()}`);
        this.startPayment();
      },
      error: (err) => {
        this.placing.set(false);
        this.error.set(err?.error?.message ?? 'Could not place the order.');
      },
    });
  }

  /**
   * Opens a Paystack session for the order just placed. Kept separate from
   * placeOrder so a failed session can be retried in place: the order already
   * exists, so the only thing missing is a payment link. Public: the retry
   * button in the template calls it.
   */
  startPayment(): void {
    const orderId = this.orderId();
    if (!orderId) return;
    this.startingPayment.set(true);
    this.paymentError.set(null);
    const receipt = this.receiptEmail.trim();
    // Guest orders authenticate to the payment endpoint with the token stored
    // at placement. Absent for account orders, where the session does the job.
    let token: string | undefined;
    try {
      token = localStorage.getItem(`seentair.order.${orderId}`) ?? undefined;
    } catch {
      /* private mode: an account session may still carry this through */
    }
    this.api.payWithPaystack(orderId, this.paidTotal(), receipt || undefined, token).subscribe({
      next: (res) => {
        this.paystackUrl.set(res.authorizationUrl);
        this.startingPayment.set(false);
        this.placing.set(false);
      },
      error: (err) => {
        this.startingPayment.set(false);
        this.placing.set(false);
        // Keep the server's reason: "Paystack is not configured" and a bad
        // amount need very different responses from the customer, and a generic
        // sentence throws that away.
        this.paymentError.set(err?.error?.message ?? 'The payment link could not be created.');
      },
    });
  }
}
