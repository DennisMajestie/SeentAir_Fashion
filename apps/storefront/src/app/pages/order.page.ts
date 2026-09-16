import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService, Order } from '../api.service';

/** Order tracking — the Temu-grade "always know where it is" page (appendix 09). */
@Component({
  selector: 'app-order',
  imports: [CommonModule, FormsModule],
  template: `
    @if (order(); as o) {
      <h1>Order <code>{{ o.id.slice(0, 8) }}</code></h1>
      <p class="total">₦{{ o.totalAmount | number: '1.0-2' }} · {{ o.paymentStatus }}</p>

      <ol class="timeline">
        @for (step of steps; track step) {
          <li [class.done]="reached(step)" [class.current]="o.status === step">
            {{ step.replaceAll('_', ' ') }}
          </li>
        }
      </ol>

      <h2>History</h2>
      @for (event of events(); track $index) {
        <div class="event">
          <strong>{{ event.status.replaceAll('_', ' ') }}</strong>
          <span class="muted">{{ event.createdAt | date: 'medium' }}</span>
          @if (event.note) {
            <p class="muted small">{{ event.note }}</p>
          }
        </div>
      }

      @if (o.status === 'delivered') {
        <section class="review-box">
          <h2>How was it?</h2>
          @for (item of o.items; track item.variant.id) {
            <form class="review-form" (ngSubmit)="review(item.variant.id)">
              <span>{{ item.variant.sku }}</span>
              <select [(ngModel)]="ratings[item.variant.id]" [name]="'r' + item.variant.id">
                <option [ngValue]="5">★★★★★</option>
                <option [ngValue]="4">★★★★☆</option>
                <option [ngValue]="3">★★★☆☆</option>
                <option [ngValue]="2">★★☆☆☆</option>
                <option [ngValue]="1">★☆☆☆☆</option>
              </select>
              <input
                [(ngModel)]="comments[item.variant.id]"
                [name]="'c' + item.variant.id"
                placeholder="Say something (optional)"
              />
              <button class="cta small" type="submit">Submit review</button>
            </form>
          }
          @if (reviewMessage()) {
            <p class="success">{{ reviewMessage() }}</p>
          }
        </section>
      }
    } @else {
      <p class="muted">Loading…</p>
    }
  `,
})
export class OrderPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);

  readonly order = signal<Order | null>(null);
  readonly events = signal<Array<{ status: string; note: string | null; createdAt: string }>>([]);
  readonly reviewMessage = signal<string | null>(null);
  readonly steps = ['order_received', 'processing', 'shipped', 'delivered'];
  ratings: Record<string, number> = {};
  comments: Record<string, string> = {};

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.api.order(id).subscribe((o) => {
      this.order.set(o);
      for (const item of o.items) this.ratings[item.variant.id] ??= 5;
    });
    this.api.tracking(id).subscribe((t) => this.events.set(t.events));
  }

  reached(step: string): boolean {
    const current = this.order()?.status ?? '';
    return this.steps.indexOf(step) <= this.steps.indexOf(current);
  }

  review(variantId: string): void {
    const order = this.order();
    if (!order) return;
    this.api
      .submitReview(order.id, variantId, this.ratings[variantId] ?? 5, this.comments[variantId] ?? '')
      .subscribe({
        next: () => this.reviewMessage.set('Thanks! Your review is in — it appears once approved.'),
        error: (err) =>
          this.reviewMessage.set(err?.error?.message ?? 'Could not submit the review.'),
      });
  }
}
