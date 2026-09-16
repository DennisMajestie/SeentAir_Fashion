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
        <div class="panel row" style="border:none; padding:0; margin:0">
          <div>
            <p class="mono small" style="color:var(--acid)">{{ r.id.slice(0, 8) }} // {{ r.buyer.name }} ({{ r.buyer.email }})</p>
            <p><strong>{{ r.quantity }} pcs</strong> · {{ r.sizes }} · {{ r.colours }} · {{ r.fabricQuality }} · due {{ r.desiredDate }} · {{ r.location }}</p>
            <p class="muted small">{{ r.description }}</p>
          </div>
          <span class="chip acid">{{ r.status.replaceAll('_', ' ') }}</span>
        </div>

        <div class="actions">
          @if (r.status === 'submitted' || r.status === 'under_review') {
            <input type="number" min="1" placeholder="Quote ₦ (Manager only)" [(ngModel)]="quoteAmounts[r.id]" [name]="'q' + r.id" style="max-width:11rem" />
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
            <input type="number" min="1" placeholder="Full amount ₦" [(ngModel)]="payAmounts[r.id]" [name]="'pa' + r.id" style="max-width:10rem" />
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
        </div>
      </section>
    }
    @if (requests().length === 0) { <p class="muted">No custom design requests yet.</p> }
    @if (message()) { <p class="success">{{ message() }}</p> }
    @if (error()) { <p class="error">{{ error() }}</p> }
  `,
})
export class CustomAdminPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly requests = signal<CustomRow[]>([]);
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);
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
