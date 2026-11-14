import { DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { InventorySummaryRow, ProductVariantRef } from '../api.service';
import { PortalStore } from '../portal.store';

type RegisterRow = InventorySummaryRow & { meta: ProductVariantRef | null };

@Component({
  selector: 'app-inventory-page',
  imports: [DecimalPipe],
  template: `
    @if (store.dash(); as d) {
      <div class="pg">
        <section class="card hero">
          <div class="eyebrow">Inventory Valuation & Reserves</div>
          <h1>Inventory</h1>
          <p class="muted">Audited warehouse and mill holdings for the Seentair garment factory, Aba · aggregate telemetry from event-sourced stock movements.</p>
          <span class="chip">{{ store.periodLabel() }} position</span>
        </section>

        <section class="metrics">
          <div class="metric card"><span>Finished goods</span><strong>{{ (d.inventoryVisibility.finishedGoodsUnits | number) }} units</strong><small>Ready in warehouse</small></div>
          <div class="metric card"><span>Finished goods value</span><strong>Not valued</strong><small>Next audit cycle</small></div>
          <div class="metric card"><span>Raw material holdings</span><strong>{{ (materialUnits() | number) }} units</strong><small>Live mill lots</small></div>
          <div class="metric card"><span>Reserved & written off</span><strong>-</strong><small>QC reason-coded, quarterly</small></div>
        </section>

        <section class="card">
          <div class="sec-head"><h2>Stock distribution</h2><span class="muted small">By product silhouette</span></div>
          @if (categoryRows().length) {
            <div class="list">
              @for (row of categoryRows(); track row.name) {
                <div class="distrow">
                  <div class="dtop"><span>{{ row.name }}</span><strong class="mono">{{ row.units | number }} · {{ row.pct | number:'1.0-0' }}%</strong></div>
                  <div class="track"><div class="fill" [style.width.%]="row.pct"></div></div>
                </div>
              }
            </div>
          } @else {
            <p class="muted small">Distribution fills as stock movements are posted to the ledger.</p>
          }
        </section>

        <section class="card">
          <div class="sec-head"><h2>Product silhouette register</h2><span class="muted small">SKU aggregates</span></div>
          @if (store.finishedVariantRows().length) {
            <div class="list">
              @for (row of store.finishedVariantRows(); track row.itemId) {
                <div class="row">
                  <div>
                    <div class="rtitle">{{ silhouetteLabel(row) }}</div>
                    <div class="muted small">{{ skuLabel(row) }} @if (specLabel(row) !== '-') { · {{ specLabel(row) }} }</div>
                  </div>
                  <div class="right">
                    <strong class="mono">{{ row.currentQuantity | number }}</strong>
                    <div class="status" [class.ok]="row.currentQuantity>0">{{ row.currentQuantity>0 ? 'In stock' : 'Out' }}</div>
                  </div>
                </div>
              }
            </div>
          } @else {
            <p class="muted small">Line items appear per SKU with audited unit counts once stock movements are recorded.</p>
          }
        </section>

        <section class="card">
          <div class="sec-head"><h2>Facility & raw materials</h2></div>
          <div class="kv">
            <div><span>Aba garment factory</span><strong class="mono">{{ d.inventoryVisibility.finishedGoodsUnits | number }} units</strong></div>
            <div><span>Per-floor utilisation</span><strong>Not yet shared</strong></div>
            <div><span>Mill custody lots (cotton, poly, trims, packaging)</span><strong>Not yet published</strong></div>
          </div>
          <p class="muted small note">Seentair operates a single factory. Aggregate telemetry only, never individual person data.</p>
        </section>
      </div>
    }
  `,
  styles: [`
    :host{display:block;font-family:'Urbanist',sans-serif;}
    .pg{display:flex;flex-direction:column;gap:12px;} .card{background:#fffdf9;border:1px solid #e8e1d3;border-radius:12px;padding:14px;box-shadow:0 8px 24px -4px rgba(27,25,22,.05);}
    .eyebrow{font:700 10px/1 'JetBrains Mono',monospace;letter-spacing:.12em;text-transform:uppercase;color:#c88a12;margin-bottom:4px;}
    h1{margin:0;font:700 20px/1.2 Urbanist,sans-serif;} h2{margin:0;font:700 14px/1.2 Urbanist,sans-serif;} p{margin:6px 0 0;}
    .chip{display:inline-block;margin-top:8px;font:600 11px/1 Urbanist,sans-serif;padding:5px 9px;border-radius:999px;background:#f1ede5;border:1px solid #e8e1d3;color:#1b1916;}
    .metrics{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
    .metric{display:flex;flex-direction:column;gap:4px;padding:12px;} .metric span{color:#7b756a;font-size:11px;} .metric strong{font:700 16px/1.1 'JetBrains Mono',monospace;color:#1b1916;}
    .sec-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px;}
    .list,.kv{display:flex;flex-direction:column;gap:10px;}
    .row,.kv>div{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid rgba(232,225,211,.6);font-size:13px;} .row:last-child,.kv>div:last-child{border-bottom:0;padding-bottom:0;}
    .rtitle{font:600 13px/1.3 Urbanist,sans-serif;} .right{text-align:right;}
    .dtop{display:flex;justify-content:space-between;font-size:13px;gap:8px;} .track{height:8px;background:#efeae0;border-radius:999px;overflow:hidden;margin-top:6px;} .fill{height:100%;background:#c88a12;border-radius:999px;}
    .status{font:600 11px/1 Urbanist,sans-serif;color:#7b756a;margin-top:2px;} .status.ok{color:#23804d;}
    .kv span,.muted{color:#7b756a;} .small{font-size:11px;} .mono{font-family:'JetBrains Mono',monospace;} .note{margin-top:10px;}
    @media (max-width:360px){.metrics{grid-template-columns:1fr;}}
  `],
})
export class InventoryPage {
  readonly store = inject(PortalStore);
  readonly materialUnits = computed(() => (this.store.materialRows()).reduce((sum, r) => sum + Math.max(0, r.currentQuantity), 0));
  readonly categoryRows = computed(() => this.store.categoryRows());
  silhouetteLabel(row: RegisterRow): string { return row.meta?.name ?? 'Unlabelled item'; }
  skuLabel(row: RegisterRow): string { return row.meta?.sku ?? ''; }
  specLabel(row: RegisterRow): string {
    const parts = [row.meta?.colour, row.meta?.size].filter((p): p is string => !!p);
    return parts.length ? parts.join(' · ') : '-';
  }
}
