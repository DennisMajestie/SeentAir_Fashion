import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiService, Invoice } from '../api.service';

@Component({
  selector: 'app-invoices',
  imports: [CommonModule],
  template: `
    <h1>Orders & invoices</h1>

    @if (notifications().length > 0) {
      <section class="panel">
        <h2>Notifications</h2>
        @for (n of notifications(); track n.id) {
          <p class="small"><span class="status">{{ n.type.replaceAll('_', ' ') }}</span> — {{ n.message }} <span class="muted">({{ n.sentAt | date: 'short' }})</span></p>
        }
      </section>
    }

    @if (invoices().length === 0) {
      <p class="muted">No wholesale orders yet.</p>
    }
    @for (invoice of invoices(); track invoice.orderId) {
      <section class="panel">
        <header class="invoice-head">
          <span><code>{{ invoice.orderId.slice(0, 8) }}</code> · {{ invoice.createdAt | date: 'mediumDate' }}</span>
          <span class="status">{{ invoice.status.replaceAll('_', ' ') }} · {{ invoice.paymentStatus }}</span>
          <strong>₦{{ invoice.totalAmount | number: '1.0-2' }}</strong>
        </header>
        <table class="table compact">
          <tbody>
            @for (item of invoice.items; track item.sku) {
              <tr>
                <td><code>{{ item.sku }}</code></td>
                <td>{{ item.quantity }} × ₦{{ item.unitPrice | number: '1.0-2' }}</td>
                <td>₦{{ item.lineTotal | number: '1.0-2' }}</td>
              </tr>
            }
          </tbody>
        </table>
        @for (payment of invoice.payments; track payment.id) {
          <p class="muted small">Paid ₦{{ payment.amount | number: '1.0-2' }} via {{ payment.method }} on {{ payment.date | date: 'medium' }}</p>
        }
        <div class="actions">
          <button class="cta small" (click)="reorder(invoice.orderId)">Reorder</button>
          <button class="link" (click)="toggleTracking(invoice.orderId)">
            {{ trackingFor() === invoice.orderId ? 'Hide tracking' : 'Track order' }}
          </button>
        </div>
        @if (trackingFor() === invoice.orderId) {
          @for (event of events(); track $index) {
            <p class="small"><strong>{{ event.status.replaceAll('_', ' ') }}</strong> — {{ event.createdAt | date: 'medium' }}</p>
          }
        }
      </section>
    }
    @if (message()) { <p class="success">{{ message() }}</p> }
  `,
})
export class InvoicesPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly invoices = signal<Invoice[]>([]);
  readonly notifications = signal<Array<{ id: string; type: string; message: string; sentAt: string }>>([]);
  readonly message = signal<string | null>(null);
  readonly trackingFor = signal<string | null>(null);
  readonly events = signal<Array<{ status: string; note: string | null; createdAt: string }>>([]);

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.api.invoices().subscribe((res) => this.invoices.set(res.data));
    this.api.notifications().subscribe((res) => this.notifications.set(res.data));
  }

  reorder(orderId: string): void {
    this.api.reorder(orderId).subscribe({
      next: (order) => {
        this.message.set(`Reorder placed: ${order.id.slice(0, 8)} — repriced at your current tier.`);
        this.load();
      },
      error: (err) => this.message.set(err?.error?.message ?? 'Reorder failed.'),
    });
  }

  toggleTracking(orderId: string): void {
    if (this.trackingFor() === orderId) {
      this.trackingFor.set(null);
      return;
    }
    this.trackingFor.set(orderId);
    this.api.tracking(orderId).subscribe((t) => this.events.set(t.events));
  }
}
