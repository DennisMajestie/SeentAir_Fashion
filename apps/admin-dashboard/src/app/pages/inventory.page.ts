import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../api.service';

interface ItemOpt { id: string; label: string; type: 'variant' | 'material'; }
interface MovementRow { id: string; movementType: string; quantityDelta: number; timestamp: string; referenceId: string | null; }

/** Inventory ledger — the movement history the client demanded, per item,
    plus approval-gated manual adjustments. Stock is NEVER edited directly. */
@Component({
  selector: 'app-inventory-admin',
  imports: [CommonModule, FormsModule],
  template: `
    <h1>Inventory ledger</h1>
    <p class="rule-strip">STOCK IS A LEDGER, NOT A NUMBER // every unit in or out is a logged movement; removals require approval.</p>

    <div class="cols">
      <section class="panel" style="grid-column: span 2; min-width: 0">
        <p class="section-label" style="margin-top:0">Movement history
          <span class="count">
            <select [(ngModel)]="selectedKey" name="item" (ngModelChange)="loadMovements()" style="background:var(--obsidian); color:var(--ink); border:1px solid var(--hairline-2); padding:0.25rem; max-width:20rem">
              <option value="">— pick a variant or material —</option>
              @for (i of items(); track i.type + i.id) { <option [value]="i.type + ':' + i.id">{{ i.label }}</option> }
            </select>
          </span>
        </p>
        @if (currentQty() !== null) {
          <p>Current quantity (derived): <span class="naira" style="font-size:1.5rem">{{ currentQty() }}</span></p>
        }
        <table class="table">
          <thead><tr><th>When</th><th>Type</th><th>Δ</th><th>Reference</th></tr></thead>
          <tbody>
            @for (m of movementRows(); track m.id) {
              <tr>
                <td class="mono small">{{ m.timestamp | date: 'MMM d, HH:mm' }}</td>
                <td><span class="chip" [class.acid]="m.quantityDelta > 0" [class.warn]="m.quantityDelta < 0">{{ m.movementType }}</span></td>
                <td class="mono" [style.color]="m.quantityDelta > 0 ? 'var(--ok)' : 'var(--danger)'">{{ m.quantityDelta > 0 ? '+' : '' }}{{ m.quantityDelta }}</td>
                <td class="mono small muted">{{ m.referenceId?.slice(0, 12) }}</td>
              </tr>
            }
          </tbody>
        </table>
      </section>

      <section class="panel">
        <p class="section-label" style="margin-top:0">Manual adjustment</p>
        <p class="muted small">Positive = correction in. Negative = removal/disposal — approval required, per the no-unauthorized-removal rule.</p>
        <form (ngSubmit)="adjust()">
          <label>Delta (±) <input type="number" [(ngModel)]="adj.delta" name="adelta" required /></label>
          <label>Reference note <input [(ngModel)]="adj.reference" name="aref" placeholder="stocktake correction…" /></label>
          <div class="actions">
            @if (adj.delta < 0 && !adj.approvalRequestId) {
              <button class="cta small ghost" type="button" (click)="requestDisposalApproval()">Request removal approval</button>
            } @else {
              @if (adj.approvalRequestId) { <span class="chip acid">req {{ adj.approvalRequestId.slice(0, 8) }}</span> }
              <button class="cta small" type="submit" [disabled]="!selectedKey">Record movement</button>
            }
          </div>
        </form>
      </section>
    </div>

    <p class="section-label">All stock at a glance</p>
    <table class="table">
      <thead><tr><th>Item</th><th>Type</th><th>Current</th><th>In / out by movement</th></tr></thead>
      <tbody>
        @for (s of summary(); track s.itemType + s.itemId) {
          <tr>
            <td class="mono small">{{ labelFor(s.itemType, s.itemId) }}</td>
            <td><span class="chip">{{ s.itemType }}</span></td>
            <td class="mono">{{ s.currentQuantity }}</td>
            <td class="small muted mono">
              @for (kv of entries(s.byMovementType); track kv[0]) { {{ kv[0] }}: {{ kv[1] }}&nbsp; }
            </td>
          </tr>
        }
      </tbody>
    </table>
    @if (message()) { <p class="success">{{ message() }}</p> }
    @if (error()) { <p class="error">{{ error() }}</p> }
  `,
})
export class InventoryAdminPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly items = signal<ItemOpt[]>([]);
  readonly movementRows = signal<MovementRow[]>([]);
  readonly currentQty = signal<number | null>(null);
  readonly summary = signal<Array<{ itemType: string; itemId: string; currentQuantity: number; byMovementType: Record<string, number> }>>([]);
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  selectedKey = '';
  adj = { delta: 0, reference: '', approvalRequestId: '' };
  private labels = new Map<string, string>();

  ngOnInit(): void {
    this.api.products().subscribe((res) => {
      const opts: ItemOpt[] = [];
      for (const p of res.data as unknown as Array<{ name: string; variants: Array<{ id: string; sku: string }> }>) {
        for (const v of p.variants) {
          opts.push({ id: v.id, type: 'variant', label: `${v.sku} — ${p.name}` });
          this.labels.set(`variant:${v.id}`, v.sku);
        }
      }
      this.api.materials().subscribe((mats) => {
        for (const m of mats as unknown as Array<{ id: string; name: string }>) {
          opts.push({ id: m.id, type: 'material', label: `${m.name} (material)` });
          this.labels.set(`material:${m.id}`, m.name);
        }
        this.items.set(opts);
      });
    });
    this.api.inventorySummary().subscribe((s) => this.summary.set(s));
  }

  labelFor(type: string, id: string): string {
    return this.labels.get(`${type}:${id}`) ?? id.slice(0, 8);
  }
  entries(record: Record<string, number>): Array<[string, number]> { return Object.entries(record); }

  loadMovements(): void {
    if (!this.selectedKey) return;
    const [type, id] = this.selectedKey.split(':') as ['variant' | 'material', string];
    this.api.movements(id, type).subscribe((res) => {
      this.movementRows.set(res.data as unknown as MovementRow[]);
      this.currentQty.set(res.currentQuantity);
    });
  }

  requestDisposalApproval(): void {
    const [type, id] = this.selectedKey.split(':');
    this.api.createApproval('stock_disposal', { item: this.labelFor(type, id), delta: this.adj.delta, note: this.adj.reference })
      .subscribe({
        next: (r) => { this.adj.approvalRequestId = r.id; this.message.set('Removal approval requested — Management decides in the queue.'); this.error.set(null); },
        error: (e) => this.error.set(e?.error?.message ?? 'Request failed.'),
      });
  }

  adjust(): void {
    const [type, id] = this.selectedKey.split(':') as ['variant' | 'material', string];
    this.api.recordMovement(id, type, {
      movementType: 'adjustment', quantityDelta: Number(this.adj.delta),
      referenceId: this.adj.reference || undefined,
      approvalRequestId: this.adj.approvalRequestId || undefined,
    }).subscribe({
      next: () => {
        this.adj = { delta: 0, reference: '', approvalRequestId: '' };
        this.message.set('Movement recorded.'); this.error.set(null);
        this.loadMovements();
        this.api.inventorySummary().subscribe((s) => this.summary.set(s));
      },
      error: (e) => this.error.set(e?.error?.message ?? 'Refused — removals need an approved request.'),
    });
  }
}
