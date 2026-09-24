import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../api.service';

interface LedgerRow { id: string; type: string; amount: number; category: string | null; referenceId: string | null; entryDate: string; }

/** Accounting — Stitch layout: five naira stat tiles, chip-typed ledger,
    approval-gated manual entry panel. */
@Component({
  selector: 'app-accounting-admin',
  imports: [CommonModule, FormsModule],
  template: `
    <h1>Accounting & reports</h1>

    <div class="tiles">
      @for (t of reportTiles(); track t.name) {
        <div class="tile" [class.negative]="t.name === 'loss' && t.value > 0" [class.alert]="t.name === 'profit' && t.value > 0">
          <span class="label">{{ t.name }}</span>
          <strong>₦{{ t.value | number: '1.0-0' }}</strong>
        </div>
      }
    </div>

    <div class="cols">
      <section class="panel lead">
        <p class="section-label">All transactions
          <span class="count">
            <select class="table-filter" [(ngModel)]="typeFilter" name="tf" (ngModelChange)="loadLedger()">
              <option value="">all types</option>
              @for (t of types; track t) { <option [value]="t">{{ t }}</option> }
            </select>
          </span>
        </p>
        <table class="table">
          <thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Amount</th><th>Ref</th></tr></thead>
          <tbody>
            @for (e of ledgerRows(); track e.id) {
              <tr>
                <td class="mono small">{{ e.entryDate | date: 'MMM d, HH:mm' }}</td>
                <td><span class="chip" [class.acid]="e.type === 'sale' || e.type === 'investment'" [class.warn]="e.type !== 'sale' && e.type !== 'investment'">{{ e.type }}</span></td>
                <td class="small">{{ e.category }}</td>
                <td class="mono">₦{{ e.amount | number: '1.0-2' }}</td>
                <td class="mono small muted">{{ e.referenceId?.slice(0, 8) }}</td>
              </tr>
            }
          </tbody>
        </table>
      </section>

      <section class="panel">
        <p class="section-label">Record manual entry</p>
        <p class="muted small">Manual entries move funds — approval-gated. Sales and material purchases are booked automatically.</p>
        <form (ngSubmit)="record()">
          <label>Type
            <select [(ngModel)]="ne.type" name="etype" required>
              <option value="expense">expense</option>
              <option value="payroll">payroll</option>
              <option value="tax">tax</option>
              <option value="investment">investment</option>
            </select>
          </label>
          <label>Amount ₦ <input type="number" min="1" [(ngModel)]="ne.amount" name="eamt" required /></label>
          <label>Category <input [(ngModel)]="ne.category" name="ecat" required placeholder="september_payroll" /></label>
          <div class="form-actions">
            @if (!ne.approvalRequestId) {
              <button class="cta small ghost" type="button" (click)="requestApproval()">Request fund-movement approval</button>
            } @else {
              <span class="chip acid">req {{ ne.approvalRequestId.slice(0, 8) }}</span>
              <button class="cta small" type="submit">Submit entry</button>
            }
          </div>
        </form>
      </section>
    </div>
    @if (message()) { <p class="success">{{ message() }}</p> }
    @if (error()) { <p class="error">{{ error() }}</p> }
  `,
})
export class AccountingAdminPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly reportTiles = signal<Array<{ name: string; value: number }>>([]);
  readonly ledgerRows = signal<LedgerRow[]>([]);
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly types = ['sale', 'purchase', 'expense', 'payroll', 'tax', 'investment'];
  typeFilter = '';
  ne = { type: 'expense', amount: 0, category: '', approvalRequestId: '' };

  ngOnInit(): void {
    this.loadReports();
    this.loadLedger();
  }

  private loadReports(): void {
    const kinds: Array<[string, string]> = [
      ['income', 'total'], ['expenditure', 'total'], ['investment', 'total'], ['profit', 'profit'], ['loss', 'loss'],
    ];
    Promise.all(
      kinds.map(([name, key]) =>
        new Promise<{ name: string; value: number }>((resolve) =>
          this.api.report(name).subscribe({
            next: (r) => resolve({ name, value: Number(r[key] ?? 0) }),
            error: () => resolve({ name, value: 0 }),
          }),
        ),
      ),
    ).then((tiles) => this.reportTiles.set(tiles));
  }

  loadLedger(): void {
    this.api.ledger(this.typeFilter || undefined).subscribe((res) => this.ledgerRows.set(res.data as unknown as LedgerRow[]));
  }

  requestApproval(): void {
    if (!this.ne.amount || !this.ne.category) { this.error.set('Fill type, amount, and category first.'); return; }
    this.api.createApproval('fund_movement', { type: this.ne.type, amount: this.ne.amount, category: this.ne.category })
      .subscribe({
        next: (r) => { this.ne.approvalRequestId = r.id; this.message.set('Approval requested — Management decides in the queue.'); this.error.set(null); },
        error: (e) => this.error.set(e?.error?.message ?? 'Request failed.'),
      });
  }

  record(): void {
    this.api.recordLedgerEntry({
      type: this.ne.type, amount: Number(this.ne.amount), category: this.ne.category,
      approvalRequestId: this.ne.approvalRequestId,
    }).subscribe({
      next: () => {
        this.ne = { type: 'expense', amount: 0, category: '', approvalRequestId: '' };
        this.message.set('Entry recorded.'); this.error.set(null);
        this.loadReports(); this.loadLedger();
      },
      error: (e) => this.error.set(e?.error?.message ?? 'Not approved yet — check the Approvals queue.'),
    });
  }
}
