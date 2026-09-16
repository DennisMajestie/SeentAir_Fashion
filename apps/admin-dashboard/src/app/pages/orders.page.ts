import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminOrder, ApiService } from '../api.service';

const NEXT_STATUS: Record<string, string> = {
  order_received: 'processing',
  processing: 'shipped',
  shipped: 'delivered',
};

@Component({
  selector: 'app-orders',
  imports: [CommonModule, FormsModule],
  template: `
    <h1>Orders — all channels</h1>
    <label class="inline">
      Channel:
      <select [(ngModel)]="channel" (ngModelChange)="load()">
        <option value="">All</option>
        <option value="retail">Retail</option>
        <option value="wholesale">Wholesale</option>
        <option value="in_store">In-store</option>
      </select>
    </label>
    <table class="table">
      <thead>
        <tr><th>Ref</th><th>Channel</th><th>Customer</th><th>Status</th><th>Payment</th><th>Total</th><th></th></tr>
      </thead>
      <tbody>
        @for (order of orders(); track order.id) {
          <tr>
            <td><code>{{ order.id.slice(0, 8) }}</code></td>
            <td>{{ order.channel }}</td>
            <td>{{ order.customer?.name ?? 'walk-in' }}</td>
            <td class="status">{{ order.status.replaceAll('_', ' ') }}</td>
            <td>{{ order.paymentStatus }}</td>
            <td>₦{{ order.totalAmount | number: '1.0-2' }}</td>
            <td>
              <div class="actions" style="margin:0">
                @if (next(order); as n) {
                  <button class="cta small" (click)="advance(order.id, n)">→ {{ n }}</button>
                }
                @if (order.customer) {
                  <button class="cta small ghost" (click)="notify(order)">Notify</button>
                }
              </div>
            </td>
          </tr>
        }
      </tbody>
    </table>
    @if (error()) { <p class="error">{{ error() }}</p> }
  `,
})
export class OrdersPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly orders = signal<AdminOrder[]>([]);
  readonly error = signal<string | null>(null);
  channel = '';

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.orders(this.channel || undefined).subscribe((res) => this.orders.set(res.data));
  }

  next(order: AdminOrder): string | null {
    if (order.paymentStatus !== 'paid') return null;
    return NEXT_STATUS[order.status] ?? null;
  }

  advance(id: string, status: string): void {
    this.error.set(null);
    this.api.advanceOrder(id, status).subscribe({
      next: () => this.load(),
      error: (err) => this.error.set(err?.error?.message ?? 'Status change failed.'),
    });
  }

  /** Manual in-platform message to the customer about this order. */
  notify(order: AdminOrder & { customer: { id?: string; name: string } | null }): void {
    const message = window.prompt(`Message to ${order.customer?.name} about ${order.id.slice(0, 8)}:`);
    if (!message) return;
    const customerId = (order.customer as { id?: string } | null)?.id;
    if (!customerId) return;
    this.api.sendNotification({
      recipientId: customerId,
      channel: 'in_platform',
      type: 'order_update',
      message,
      relatedOrderId: order.id,
    }).subscribe({
      next: () => this.error.set(null),
      error: (err) => this.error.set(err?.error?.message ?? 'Notify failed.'),
    });
  }
}
