import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService, Order } from '../api.service';

const STEPS = [
  { key: 'order_received', name: 'Order received' },
  { key: 'processing', name: 'Processing & packaging' },
  { key: 'shipped', name: 'Shipped' },
  { key: 'delivered', name: 'Delivered' },
];
const RETURN_WINDOW_MS = 12 * 3_600_000;

/** Order tracking — Stitch "lifecycle" layout: percent-executed header,
    four step cards, checkpoint log, manifest, review + return actions. */
@Component({
  selector: 'app-order',
  imports: [CommonModule, FormsModule],
  template: `
    @if (order(); as o) {
      <p class="page-kicker">Order // {{ o.id.slice(0, 8) }}</p>
      <h1 class="page-title">Order tracking</h1>

      <div class="exec-header">
        <p class="section-label" style="margin:0; border:none">
          Progress <span class="count">// {{ percent() }}% complete</span>
        </p>
        <span class="exec-count">{{ stepIndex() + 1 | number: '2.0' }}/04</span>
      </div>
      <div class="step-cards">
        @for (step of steps; track step.key; let i = $index) {
          <div class="step-card" [class.done]="i < stepIndex()" [class.current]="i === stepIndex()">
            <p class="s-idx">STEP {{ i + 1 | number: '2.0' }}</p>
            <p class="s-name">{{ step.name }}</p>
            <p class="s-state">{{ i < stepIndex() ? '■ COMPLETE' : i === stepIndex() ? '▶ CURRENT' : '· PENDING' }}</p>
          </div>
        }
      </div>
      @if (o.status === 'returned') {
        <p class="rule-strip">This order was returned. The resolution is recorded in the history below.</p>
      }

      <div class="checkout-cols">
        <div>
          <p class="section-label">Status history</p>
          @for (event of events(); track $index) {
            <div class="audit-row">
              <p class="a-time">{{ event.createdAt | date: 'medium' }}</p>
              <p class="a-status">{{ event.status.replaceAll('_', ' ') }}</p>
              @if (event.note) { <p class="muted small">{{ event.note }}</p> }
            </div>
          }

          @if (o.status === 'delivered') {
            <p class="section-label">How was it?</p>
            @for (item of o.items; track item.variant.id) {
              <form class="review-form" (ngSubmit)="review(item.variant.id)">
                <span class="sku-line">{{ item.variant.sku }}</span>
                <select [(ngModel)]="ratings[item.variant.id]" [name]="'r' + item.variant.id">
                  <option [ngValue]="5">★★★★★</option>
                  <option [ngValue]="4">★★★★☆</option>
                  <option [ngValue]="3">★★★☆☆</option>
                  <option [ngValue]="2">★★☆☆☆</option>
                  <option [ngValue]="1">★☆☆☆☆</option>
                </select>
                <input [(ngModel)]="comments[item.variant.id]" [name]="'c' + item.variant.id" placeholder="Say something (optional)" />
                <button class="cta small" type="submit">Submit review</button>
              </form>
            }
            @if (reviewMessage()) { <p class="success">{{ reviewMessage() }}</p> }
          }

          @if (returnEligible()) {
            <p class="section-label">Request a return</p>
            <p class="rule-strip">
              Returns must be requested within 12 hours of delivery — this window closes
              {{ returnDeadline() | date: 'shortTime' }}. The physical return is due within 24 hours of the request.
            </p>
            @for (item of o.items; track item.variant.id) {
              <form class="review-form" (ngSubmit)="requestReturn(item.variant.id, item.quantity)">
                <span class="sku-line">{{ item.variant.sku }} × {{ item.quantity }}</span>
                <input
                  [(ngModel)]="returnReasons[item.variant.id]"
                  [name]="'ret' + item.variant.id"
                  placeholder="Reason (required)"
                  required
                />
                <button class="cta small ghost" type="submit">Request return</button>
              </form>
            }
            @if (returnMessage()) { <p class="success">{{ returnMessage() }}</p> }
            @if (returnError()) { <p class="error">{{ returnError() }}</p> }
          }
        </div>

        <aside>
          <p class="section-label">Manifest <span class="count">[{{ o.items.length | number: '2.0' }}]</span></p>
          @for (item of o.items; track item.variant.id) {
            <div class="manifest-row">
              <div class="m-body">
                <p class="sku-line">{{ item.variant.sku }}</p>
                <p class="muted small">× {{ item.quantity }}</p>
              </div>
              <span class="m-price">₦{{ item.unitPrice * item.quantity | number: '1.0-2' }}</span>
            </div>
          }
          <div class="matrix-total" style="border:1px solid var(--acid); padding:0.9rem; display:flex; justify-content:space-between; align-items:baseline">
            <span class="label mono" style="font-size:0.7rem; letter-spacing:0.2em; color:var(--ink-dim)">TOTAL PAID</span>
            <span style="font-family:'Anton',sans-serif; font-size:1.6rem; color:var(--acid)">₦{{ o.totalAmount | number: '1.0-0' }}</span>
          </div>
          <p class="muted small mono">PAYMENT // {{ o.paymentStatus.toUpperCase() }}</p>
        </aside>
      </div>
    } @else {
      <p class="muted">Loading…</p>
    }
  `,
})
export class OrderPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);

  readonly steps = STEPS;
  readonly order = signal<Order | null>(null);
  readonly deliveredAt = signal<string | null>(null);
  readonly events = signal<Array<{ status: string; note: string | null; createdAt: string }>>([]);
  readonly reviewMessage = signal<string | null>(null);
  readonly returnMessage = signal<string | null>(null);
  readonly returnError = signal<string | null>(null);
  ratings: Record<string, number> = {};
  comments: Record<string, string> = {};
  returnReasons: Record<string, string> = {};

  readonly stepIndex = computed(() => {
    const status = this.order()?.status ?? '';
    const i = STEPS.findIndex((s) => s.key === status);
    return i >= 0 ? i : status === 'returned' ? STEPS.length - 1 : 0;
  });
  readonly percent = computed(() => Math.round(((this.stepIndex() + 1) / STEPS.length) * 100));
  readonly returnDeadline = computed(() => {
    const d = this.deliveredAt();
    return d ? new Date(new Date(d).getTime() + RETURN_WINDOW_MS) : null;
  });
  readonly returnEligible = computed(() => {
    const o = this.order();
    const deadline = this.returnDeadline();
    return !!o && o.status === 'delivered' && !!deadline && deadline.getTime() > Date.now();
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.api.order(id).subscribe((o) => {
      this.order.set(o);
      for (const item of o.items) this.ratings[item.variant.id] ??= 5;
    });
    this.api.tracking(id).subscribe((t) => {
      this.events.set(t.events);
      this.deliveredAt.set(t.deliveredAt);
    });
  }

  review(variantId: string): void {
    const order = this.order();
    if (!order) return;
    this.api
      .submitReview(order.id, variantId, this.ratings[variantId] ?? 5, this.comments[variantId] ?? '')
      .subscribe({
        next: () => this.reviewMessage.set('Thanks! Your review is in — it appears once approved.'),
        error: (err) => this.reviewMessage.set(err?.error?.message ?? 'Could not submit the review.'),
      });
  }

  requestReturn(variantId: string, quantity: number): void {
    const order = this.order();
    const reason = this.returnReasons[variantId]?.trim();
    this.returnError.set(null);
    if (!order || !reason) {
      this.returnError.set('A reason is required for returns.');
      return;
    }
    this.api.requestReturn(order.id, variantId, quantity, reason).subscribe({
      next: () =>
        this.returnMessage.set(
          'Return requested — send the item back via a logistics company within 24 hours and keep the tracking number.',
        ),
      error: (err) => this.returnError.set(err?.error?.message ?? 'Return request failed.'),
    });
  }
}
