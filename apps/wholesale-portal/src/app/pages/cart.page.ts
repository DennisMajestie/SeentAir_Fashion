import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, Pricing } from '../api.service';
import { BrandAlertService } from '../brand-alert.service';
import { CartLine, CartService } from '../cart.service';
import { EmptyComponent, LedgerComponent, RowComponent, StripComponent } from '../ui/primitives';

interface CartGroup {
  productId: string;
  productName: string;
  units: number;
  unitPrice: number;
  amount: number;
  sku: string;
  colourways: Array<{ colour: string; breakdown: string; pcs: number }>;
}

/**
 * W5, Bulk cart & checkout: batch production items, consignee destination,
 * freight options, factory policy & SLA, production cost summary and
 * settlement method. Commit places the order through POST /orders (the
 * server re-prices at the buyer's tier and enforces MOQ).
 *
 * Built on the shared primitives, with one deliberate difference from the
 * Orders log: batch rows start **open**. A buyer is not scanning here, they are
 * verifying an allocation before committing money to it, so hiding the
 * breakdown behind a click would be the wrong default. The primitive supports
 * both behaviours because open state is controlled by the page, not the row.
 */
@Component({
  selector: 'app-cart',
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    StripComponent,
    RowComponent,
    LedgerComponent,
    EmptyComponent,
  ],
  template: `
    <a class="link backlink" routerLink="/catalogue">
      <span class="material-symbols-outlined" aria-hidden="true">arrow_back</span> Bulk cart &
      checkout
    </a>

    <!-- MOQ state as a tone on a flat strip, not a floating pill bar. -->
    <div class="status-strip" [class.ok]="moqMet()" [class.warn]="!moqMet()">
      <span class="dot" aria-hidden="true"></span>
      <span class="left">
        {{ cart.units() }} unit{{ cart.units() === 1 ? '' : 's' }} selected
        @if (moqKnown()) {
          @if (moqMet()) {
            · minimum of {{ moq() }} met
          } @else {
            · {{ moqShort() }} short of the {{ moq() }} minimum
          }
        } @else {
          · minimum being confirmed
        }
      </span>
      <span class="strip-badge">{{ cart.units() > 0 ? 'Draft batch' : 'Empty' }}</span>
    </div>

    @if (cart.units() === 0 && !orderResult()) {
      <se-empty
        icon="shopping_cart"
        title="Your draft batch is empty"
        sub="Add units from the catalogue, then come back to commit the batch."
        ctaLabel="Browse catalogue"
        ctaHref="/catalogue"
      />
    }

    @if (cart.units() > 0) {
      <se-strip
        label="1. Batch production items"
        [badge]="moqMet() ? 'Ready for cutting' : 'Below MOQ'"
      >
        @for (group of groups(); track group.productId) {
          <se-row
            [id]="group.productId"
            [open]="isOpen(group.productId)"
            (toggled)="onToggle(group.productId, $event)"
          >
            <ng-container rowIdent>
              <span class="drow-code">
                {{ group.productName }}
                <span class="chip">{{ group.units }} units</span>
              </span>
              <span class="drow-meta">SKU: {{ group.sku }}</span>
            </ng-container>

            <ng-container rowTail>
              <span class="drow-amount">₦{{ group.amount | number: '1.0-2' }}</span>
            </ng-container>

            <div rowPanel>
              <!-- Allocation is the thing being verified, so it is a table
                   with real column alignment, not a run-on string. -->
              <table class="alloc">
                <caption class="sr-only">
                  Size allocation for
                  {{
                    group.productName
                  }}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Colourway</th>
                    <th scope="col">Cut breakdown</th>
                    <th scope="col" class="right">Units</th>
                  </tr>
                </thead>
                <tbody>
                  @for (cw of group.colourways; track cw.colour) {
                    <tr>
                      <td>{{ cw.colour }}</td>
                      <td class="mono">{{ cw.breakdown }}</td>
                      <td class="right num">{{ cw.pcs }}</td>
                    </tr>
                  }
                </tbody>
                <tfoot>
                  <tr>
                    <td colspan="2">Allocated total</td>
                    <td class="right num">{{ group.units }}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <ng-container rowActions>
              <a class="cta small quiet" [routerLink]="['/catalogue', group.productId, 'matrix']">
                <span class="material-symbols-outlined" aria-hidden="true">grid_on</span> Edit
                matrix
              </a>
              <button class="cta small quiet" (click)="cart.removeProduct(group.productId)">
                Remove
              </button>
            </ng-container>
          </se-row>
        }
      </se-strip>

      <!-- GAP: no buyer address-book endpoint yet, destination is agreed with the
           Aba desk after commit instead of rendering a stored consignee address. -->
      <se-strip label="2. Delivery consignee destination" badge="Verified buyer">
        <strong>{{ buyerName() ?? 'Wholesale account' }}</strong>
        <p class="muted small" style="margin: 2px 0 0">
          Delivery destination and consignee contact are confirmed with the Aba desk once the batch
          is committed: GIGL dispatch or factory pickup.
        </p>
      </se-strip>

      <se-strip label="3. Freight waybill options" [badge]="cart.units() + ' units'">
        <!-- GAP: no delivery-fee quotation endpoint, freight is quoted on the waybill
             at dispatch, so no fee figures are shown against each option. -->
        <label class="radio-opt" [class.selected]="freight === 'gigl'">
          <input type="radio" name="freight" value="gigl" [(ngModel)]="freight" />
          <span class="r-body">
            <span class="r-title"
              ><span>GIGL freight dispatch</span>
              <span class="r-price muted">Quoted at dispatch</span></span
            >
            <span class="r-sub"
              >First-line carrier: doorstep commercial drop with tracked waybill.</span
            >
          </span>
        </label>
        <label class="radio-opt" [class.selected]="freight === 'pickup'">
          <input type="radio" name="freight" value="pickup" [(ngModel)]="freight" />
          <span class="r-body">
            <span class="r-title"
              ><span>Factory pickup (Aba workshop hub)</span>
              <span class="r-price">₦0 (Free)</span></span
            >
            <span class="r-sub">Collect directly from the Seentair production floor, Aba.</span>
          </span>
        </label>

        <div class="status-strip warn">
          <span class="dot" aria-hidden="true"></span>
          <span>
            <strong>Seentair factory policy &amp; SLA.</strong> Full payment is required before
            production batch slot allocation and material cutting. No part-payments, cash on
            delivery, or staggered releases.
          </span>
        </div>
      </se-strip>

      <se-strip label="4. Production cost summary">
        <se-ledger [rows]="costLedger()" />
      </se-strip>

      <se-strip label="5. Settlement method">
        <!-- GAP: Paystack is the confirmed processor, but the portal has no
             payment-initialisation endpoint yet, settlement today is bank
             transfer / POS confirmed by the desk, so commit places the order
             and the desk follows up with payment instructions. -->
        <label class="radio-opt" [class.selected]="settlement === 'transfer'">
          <input type="radio" name="settlement" value="transfer" [(ngModel)]="settlement" />
          <span class="r-body">
            <span class="r-title"><span>Direct corporate bank transfer / POS</span></span>
            <span class="r-sub"
              >Current live flow: the desk confirms your payment, then the batch enters
              production.</span
            >
          </span>
        </label>
        <label class="radio-opt" [class.selected]="settlement === 'paystack'">
          <input type="radio" name="settlement" value="paystack" [(ngModel)]="settlement" />
          <span class="r-body">
            <span class="r-title"
              ><span>Paystack direct merchant gateway</span>
              <span class="r-price muted">Coming online</span></span
            >
            <span class="r-sub"
              >Instant confirmation: cards, NIBSS transfer, USSD. Awaiting production keys; the desk
              will settle this order manually meanwhile.</span
            >
          </span>
        </label>
      </se-strip>

      <button
        class="cta"
        style="width:100%; margin-top: var(--space-md)"
        (click)="commit()"
        [disabled]="!moqMet() || placing()"
      >
        <span class="material-symbols-outlined" aria-hidden="true">lock</span>
        {{
          placing() ? 'Committing batch…' : 'Commit batch: ₦' + (cart.amount() | number: '1.0-2')
        }}
      </button>
      @if (!moqMet()) {
        <p class="error" style="text-align:center">
          @if (moqKnown()) {
            Minimum order is {{ moq() }} units: you have {{ cart.units() }}.
          } @else {
            Confirming the batch minimum before this order can be committed.
          }
        </p>
      }
      <p class="muted small" style="text-align:center; margin-top: var(--space-sm)">
        Full payment upfront confirms the production slot, the cutting floor is notified once the
        desk verifies settlement.
      </p>
    }

    @if (orderResult(); as result) {
      <se-strip label="Batch committed" badge="OK">
        <p class="apply-copy">
          Order <code>{{ result.id.slice(0, 8).toUpperCase() }}</code> placed -
          <strong>₦{{ result.totalAmount | number: '1.0-2' }}</strong
          >. Payment: bank transfer / POS, our team confirms it, then production starts.
        </p>
        <div class="actions">
          <a class="cta small" [routerLink]="['/orders', result.id, 'invoice']"
            >View pro-forma invoice</a
          >
          <a class="link" routerLink="/orders">Orders &amp; invoices</a>
        </div>
      </se-strip>
    }
    @if (error()) {
      <p class="error">{{ error() }}</p>
    }

    <div class="status-strip" style="margin-top: var(--space-xl)">
      <span class="dot" aria-hidden="true"></span>
      <span>Need a custom wholesale invoice?</span>
      <a class="link strip-trailing" href="tel:+23418887400">Call hub</a>
    </div>
  `,
})
export class CartPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly alerts = inject(BrandAlertService);
  readonly cart = inject(CartService);
  readonly buyerName = signal<string | null>(null);
  readonly pricing = signal<Pricing | null>(null);
  readonly placing = signal(false);
  readonly error = signal<string | null>(null);
  readonly orderResult = signal<{ id: string; totalAmount: number } | null>(null);
  freight: 'gigl' | 'pickup' = 'gigl';
  settlement: 'transfer' | 'paystack' = 'transfer';

  /**
   * Batch rows start open so the buyer can verify the allocation before
   * committing money. Toggling one leaves the rest alone: unlike the Orders
   * log, this is a review step, not a scan step.
   */
  private readonly closedGroups = signal<ReadonlySet<string>>(new Set());

  readonly groups = computed<CartGroup[]>(() => {
    const map = new Map<string, CartLine[]>();
    for (const line of this.cart.lines()) {
      map.set(line.productId, [...(map.get(line.productId) ?? []), line]);
    }
    return [...map.entries()].map(([productId, lines]) => {
      const byColour = new Map<string, CartLine[]>();
      for (const l of lines) {
        const c = l.colour || 'standard';
        byColour.set(c, [...(byColour.get(c) ?? []), l]);
      }
      return {
        productId,
        productName: lines[0].productName,
        sku: lines[0].sku,
        unitPrice: lines[0].unitPrice,
        units: lines.reduce((n, l) => n + l.quantity, 0),
        amount: Math.round(lines.reduce((n, l) => n + l.quantity * l.unitPrice, 0) * 100) / 100,
        colourways: [...byColour.entries()].map(([colour, cls]) => ({
          colour,
          breakdown: cls.map((l) => `${l.quantity}× ${l.size || 'OS'}`).join(' | '),
          pcs: cls.reduce((n, l) => n + l.quantity, 0),
        })),
      };
    });
  });

  /** The cost summary, built only from figures the API and cart actually hold. */
  readonly costLedger = computed<
    Array<{ label: string; value: string; note?: string; total?: boolean; numeric?: boolean }>
  >(() => {
    const tier = this.pricing()?.tier;
    return [
      { label: 'Garment allocation units', value: `${this.cart.units()} units`, numeric: false },
      { label: 'Merchandise subtotal', value: `₦${this.money(this.cart.amount())}` },
      // GAP: freight + statutory charges land on the final invoice; there is no
      // quotation endpoint to price them here, so they are named, not guessed.
      {
        label: 'Freight logistics waybill',
        value: 'On final invoice',
        numeric: false,
        note: 'quoted at dispatch',
      },
      ...(tier
        ? [
            {
              label: `${tier.name} wholesale rate`,
              value: `${tier.discountPercent}% off retail: applied`,
              numeric: false,
            },
          ]
        : []),
      { label: 'Total payable', value: `₦${this.money(this.cart.amount())}`, total: true },
    ];
  });

  constructor() {
    // Nothing to collapse until there is a batch; drop closed state for lines
    // that no longer exist so a re-added product shows its allocation again.
    effect(() => {
      const ids = new Set(this.groups().map((g) => g.productId));
      this.closedGroups.update((closed) => {
        const next = new Set([...closed].filter((id) => ids.has(id)));
        return next.size === closed.size ? closed : next;
      });
    });
  }

  ngOnInit(): void {
    this.api.me().subscribe({ next: (m) => this.buyerName.set(m.name), error: () => undefined });
    this.api.pricing().subscribe({ next: (p) => this.pricing.set(p), error: () => undefined });
  }

  isOpen(productId: string): boolean {
    return !this.closedGroups().has(productId);
  }

  onToggle(productId: string, open: boolean): void {
    this.closedGroups.update((closed) => {
      const next = new Set(closed);
      if (open) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  tier() {
    return this.pricing()?.tier ?? null;
  }

  /**
   * The real MOQ, from the API.
   *
   * No hardcoded fallback: 20 is the configured default, but the account's
   * actual minimum is what the server enforces at commit, so guessing one here
   * could either block a valid order or wave through an invalid one.
   */
  moq(): number {
    return this.pricing()?.moq ?? 0;
  }

  /** False while pricing is still loading or the call failed. */
  moqKnown(): boolean {
    return this.moq() > 0;
  }

  /**
   * With an unknown MOQ the client defers to the server rather than blocking or
   * waving through: POST /orders enforces the minimum regardless.
   */
  moqMet(): boolean {
    return !this.moqKnown() || this.cart.units() >= this.moq();
  }

  moqShort(): number {
    return Math.max(0, this.moq() - this.cart.units());
  }

  async commit(): Promise<void> {
    if (this.placing()) return;
    const units = this.cart.units();
    const ok = await this.alerts.confirm({
      title: 'Commit this batch order?',
      html: `${units} unit${units === 1 ? '' : 's'} at wholesale rate: full payment upfront, and the order is final once committed.`,
      confirm: 'Commit order',
      icon: 'warning',
    });
    if (!ok) return;
    this.placing.set(true);
    this.error.set(null);
    this.api.placeOrder(this.cart.toOrderItems()).subscribe({
      next: (order) => {
        this.placing.set(false);
        this.orderResult.set(order);
        this.cart.clear();
        void this.alerts.toast(`Batch committed: ref ${order.id.slice(0, 8).toUpperCase()}`);
      },
      error: (err) => {
        this.placing.set(false);
        this.error.set(err?.error?.message ?? 'Order failed.');
        void this.alerts.toast('Order failed: please retry.', { icon: 'error' });
      },
    });
  }

  private money(value: number): string {
    return Math.round(value * 100).toLocaleString('en-NG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
}
