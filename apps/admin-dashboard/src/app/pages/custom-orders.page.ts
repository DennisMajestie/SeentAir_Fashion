import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../api.service';

interface CustomRow {
  id: string; status: string; sizes: string; colours: string; quantity: number;
  location: string; fabricQuality: string; description: string; desiredDate: string;
  buyer: { name: string; email: string }; paidAt: string | null;
}

const NEXT: Record<string, string | null> = {
  submitted: 'under_review',
  paid: 'sample_in_production',
  sample_approved: 'in_production',
  in_production: 'fulfilled',
  fulfilled: 'delivered',
};

/** Custom orders management — Stitch layout: status-chip table, detail panel,
    manager-only quotation, the sample gate spelled out. */
@Component({
  selector: 'app-custom-admin',
  imports: [CommonModule, FormsModule],
  template: `
    <h1>Custom orders</h1>
    <p class="rule-strip">FULL PRODUCTION ONLY AFTER THE BUYER APPROVES THE SAMPLE — the API enforces it; the buyer decides in their portal.</p>

    @for (r of requests(); track r.id) {
      <section class="panel">
        <div class="panel row row-flat">
          <div>
            <p class="mono small acid-text">{{ r.id.slice(0, 8) }} // {{ r.buyer.name }} ({{ r.buyer.email }})</p>
            <p><strong>{{ r.quantity }} pcs</strong> · {{ r.sizes }} · {{ r.colours }} · {{ r.fabricQuality }} · due {{ r.desiredDate }} · {{ r.location }}</p>
            <p class="muted small">{{ r.description }}</p>
          </div>
          <span class="chip acid">{{ r.status.replaceAll('_', ' ') }}</span>
        </div>

        <div class="actions">
          @if (r.status === 'submitted' || r.status === 'under_review') {
            <input type="number" min="1" placeholder="Quote ₦ (Manager only)" [(ngModel)]="quoteAmounts[r.id]" [name]="'q' + r.id" class="num-input-w" />
            <button class="cta small" (click)="quote(r)">Issue quotation</button>
            @if (r.status === 'submitted') {
              <button class="cta small ghost" (click)="advance(r.id, 'under_review')">Mark under review</button>
            }
          }
          @if (r.status === 'quote_accepted') {
            <select [(ngModel)]="payMethods[r.id]" [name]="'pm' + r.id">
              <option value="bank_transfer">bank transfer</option>
              <option value="cash">cash</option>
              <option value="pos">POS</option>
            </select>
            <input type="number" min="1" placeholder="Full amount ₦" [(ngModel)]="payAmounts[r.id]" [name]="'pa' + r.id" class="num-input-n" />
            <button class="cta small" (click)="recordPayment(r)">Record full payment</button>
          }
          @if (next(r.status); as n) {
            @if (r.status !== 'submitted') {
              <button class="cta small" (click)="advance(r.id, n)">→ {{ n.replaceAll('_', ' ') }}</button>
            }
          }
          @if (r.status === 'sample_in_production') {
            <span class="chip warn">WAITING FOR BUYER SAMPLE DECISION</span>
          }
          <button class="link" type="button" (click)="inspect(r.id)">
            {{ detailId() === r.id ? 'hide details' : 'full request & quotation' }}
          </button>
        </div>

        @if (detailId() === r.id) {
          <div class="panel flat">
            @if (detail(); as d) {
              <p class="small"><strong>Full request</strong> — submitted {{ d['createdAt'] }},
                last updated {{ d['updatedAt'] }}. Status {{ d['status'] }}.</p>
              <p class="small muted">{{ d['description'] }}</p>
            }
            @if (quotation(); as q) {
              <p class="small">Quotation on file:
                <span class="naira">₦{{ num(q['amount']) | number: '1.0-2' }}</span>
                — issued {{ q['createdAt'] }}
                @if (q['note']) { · {{ q['note'] }} }
              </p>
            } @else {
              <p class="small muted">No quotation issued yet.</p>
            }
          </div>
        }
      </section>
    }
    @if (requests().length === 0) {
      <div class="empty-state">
        <span class="empty-state-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="m8.2 12.4 2.6 2.6 5-5.2" /></svg></span>
        <h2 class="empty-state-title">No custom requests yet</h2>
        <p class="empty-state-sub">New bespoke requests from customers will appear here.</p>
      </div>
    }
    @if (message()) { <p class="success">{{ message() }}</p> }
    @if (error()) { <p class="error">{{ error() }}</p> }
  `,
})
export class CustomAdminPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly requests = signal<CustomRow[]>([]);
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  /** Drill-down: the full request record plus the quotation on file. */
  readonly detailId = signal<string | null>(null);
  readonly detail = signal<Record<string, unknown> | null>(null);
  readonly quotation = signal<Record<string, unknown> | null>(null);
  quoteAmounts: Record<string, number> = {};
  payAmounts: Record<string, number> = {};
  payMethods: Record<string, string> = {};

  ngOnInit(): void { this.load(); }
  private load(): void {
    this.api.customOrders().subscribe((res) => {
      const rows = res.data as unknown as CustomRow[];
      this.requests.set(rows);
      for (const r of rows) this.payMethods[r.id] ??= 'bank_transfer';
    });
  }
  num(v: unknown): number { return Number(v ?? 0); }

  inspect(id: string): void {
    if (this.detailId() === id) { this.detailId.set(null); return; }
    this.detailId.set(id);
    this.detail.set(null);
    this.quotation.set(null);
    this.api.customOrder(id).subscribe({
      next: (d) => this.detail.set(d),
      error: (e) => this.fail(e, 'Could not load that request.'),
    });
    this.api.customQuotation(id).subscribe({
      next: (q) => this.quotation.set(q),
      error: () => this.quotation.set(null), // none issued yet
    });
  }

  private ok(m: string): void { this.message.set(m); this.error.set(null); this.load(); }
  private fail(e: { error?: { message?: string } }, fb: string): void { this.error.set(e?.error?.message ?? fb); this.message.set(null); }

  next(status: string): string | null { return NEXT[status] ?? null; }

  quote(r: CustomRow): void {
    const amount = this.quoteAmounts[r.id];
    if (!amount) { this.error.set('Enter the quotation amount.'); return; }
    this.api.issueQuotation(r.id, Number(amount)).subscribe({
      next: () => this.ok('Quotation issued — the buyer sees it in their portal.'),
      error: (e) => this.fail(e, 'Quotation requires Management/Owner authority.'),
    });
  }

  recordPayment(r: CustomRow): void {
    this.api.recordCustomPayment(r.id, this.payMethods[r.id], Number(this.payAmounts[r.id])).subscribe({
      next: () => this.ok('Payment recorded in full — sample production can start.'),
      error: (e) => this.fail(e, 'Payment failed — must equal the quotation exactly.'),
    });
  }

  advance(id: string, status: string): void {
    this.api.updateCustomStatus(id, status).subscribe({
      next: () => this.ok('Status updated.'),
      error: (e) => this.fail(e, 'Transition refused.'),
    });
  }
}
