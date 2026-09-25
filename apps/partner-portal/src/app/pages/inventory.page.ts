import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { InventorySummaryRow, ProductVariantRef } from '../api.service';
import { PortalStore } from '../portal.store';

/**
 * Screen P5 — Inventory Valuation & Raw Material Reserves. The partner API
 * exposes the audited finished-goods aggregate plus the live event-sourced
 * per-item stock summary (INVENTORY VIEW) — labelled with product names from
 * the public catalogue. Valuations stay honest "unvalued" (no ₦ endpoint).
 */
type RegisterRow = InventorySummaryRow & { meta: ProductVariantRef | null };
@Component({
  selector: 'app-inventory-page',
  imports: [CommonModule],
  template: `
    @if (store.dash(); as d) {
      <div class="page-head">
        <div class="page-head-main">
          <p class="page-kicker">Ledger Asset Register // Warehouse &amp; Mill Holdings</p>
          <h1 class="page-title">Inventory Valuation &amp; Raw Material Reserves</h1>
          <p class="page-sub">
            Audited warehouse and mill holdings for the Seentair garment factory, Aba —
            aggregate telemetry only, derived from event-sourced stock movements.
          </p>
        </div>
        <div class="page-head-side">
          <span class="chip gold">{{ store.periodLabel() }} position</span>
          <span class="chip">Verified physical count</span>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi accent">
          <span class="kpi-label">Finished goods in stock</span>
          <span class="kpi-value">{{ d.inventoryVisibility.finishedGoodsUnits | number }}</span>
          <span class="kpi-sub">Garment units ready in warehouse</span>
        </div>
        <!-- GAP: no stock-valuation endpoint — ₦ values of finished goods & raw lots are not published. -->
        <div class="kpi">
          <span class="kpi-label">Finished goods value</span>
          <span class="kpi-value">Not yet valued</span>
          <span class="kpi-sub">Valuation follows the next audit cycle</span>
        </div>
        <div class="kpi">
          <span class="kpi-label">Raw material holdings</span>
          <span class="kpi-value">{{ materialUnits() | number }} units</span>
          <span class="kpi-sub">Live mill lots — cotton, poly &amp; trims</span>
        </div>
        <div class="kpi">
          <span class="kpi-label">Reserved &amp; written off</span>
          <span class="kpi-value">—</span>
          <span class="kpi-sub">QC-reason-coded; reported quarterly</span>
        </div>
      </div>

      <div class="split">
        <section class="panel">
          <div class="panel-head">
            <h2>Inventory stock distribution by category</h2>
            <span class="panel-note">Total finished units: {{ d.inventoryVisibility.finishedGoodsUnits | number }}</span>
          </div>
          <div class="meter-row" style="padding-bottom: 0.55rem">
            <span><strong>All finished garments</strong></span>
            <div class="meter gold"><div class="meter-fill" style="width: 100%"></div></div>
            <span class="meter-val mono">{{ d.inventoryVisibility.finishedGoodsUnits | number }} units</span>
          </div>
          @for (row of store.categoryRows(); track row.name) {
            <div class="meter-row">
              <span class="wrap">{{ row.name }}</span>
              <div class="meter"><div class="meter-fill" [style.width.%]="row.pct"></div></div>
              <span class="meter-val mono">{{ row.units | number }} units · {{ row.pct | number: '1.0-0' }}%</span>
            </div>
          } @empty {
            <p class="gap-note" style="margin-top: 0.7rem">
              No variant-level stock has been recorded to the ledger yet — the distribution fills
              as stock movements are posted.
            </p>
          }
        </section>

        <section class="panel">
          <div class="panel-head">
            <h2>Facility breakdown</h2>
            <span class="panel-note">Single site</span>
          </div>
          <div class="rail-rows">
            <div class="rail-row">
              <span>Aba garment factory</span>
              <strong>{{ d.inventoryVisibility.finishedGoodsUnits | number }} units</strong>
            </div>
          </div>
          <!-- GAP: no per-facility utilisation/valuation endpoint; Seentair operates one factory. -->
          <p class="gap-note" style="margin-top: 0.7rem">
            Seentair operates a single factory; per-floor utilisation telemetry is not yet shared.
          </p>
        </section>
      </div>

      <section class="panel">
        <div class="panel-head">
          <h2>Product silhouette stock register</h2>
          <span class="panel-note">SKU aggregates — never customer data</span>
        </div>
        <div class="table-scroll">
          <table class="table">
            <thead>
              <tr><th class="wrap">Silhouette</th><th>Fabric / spec</th><th class="num-col">Units held</th><th class="num-col">Unit value</th><th class="num-col">Total stock value</th><th>Status</th></tr>
            </thead>
            <tbody>
              @for (row of store.finishedVariantRows(); track row.itemId) {
                <tr>
                  <td class="wrap">
                    <strong>{{ silhouetteLabel(row) }}</strong>
                    @if (skuLabel(row)) { <span class="sub mono">{{ skuLabel(row) }}</span> }
                  </td>
                  <td class="wrap">{{ specLabel(row) }}</td>
                  <td class="num-col mono">{{ row.currentQuantity | number }}</td>
                  <td class="num-col"><span class="muted">Unvalued</span></td>
                  <td class="num-col"><span class="muted">Unvalued</span></td>
                  <td><span class="chip" [class.ok]="row.currentQuantity > 0">{{ statusLabel(row.currentQuantity) }}</span></td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="6" class="wrap empty-cell">
                    No silhouette-level register is available yet. Line items appear here per SKU
                    with audited unit counts once stock movements are recorded.
                  </td>
                </tr>
              }
            </tbody>
            @if (store.finishedVariantRows().length > 0) {
              <tfoot>
                <tr>
                  <td colspan="2">Total finished units on register</td>
                  <td class="num-col mono">{{ d.inventoryVisibility.finishedGoodsUnits | number }}</td>
                  <td colspan="3"></td>
                </tr>
              </tfoot>
            }
          </table>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>Raw material mills &amp; in-store reserves</h2>
          <span class="panel-note">Mill custody lots</span>
        </div>
        <!-- GAP: no raw-material lot endpoint (mill reserves, GSM lots, dye buffers). -->
        <div class="floor-grid">
          <div class="floor-cell"><span>Cotton reserves</span><strong>—</strong><em>Not yet published</em></div>
          <div class="floor-cell"><span>Poly &amp; blend lots</span><strong>—</strong><em>Not yet published</em></div>
          <div class="floor-cell"><span>Trims &amp; branding stock</span><strong>—</strong><em>Not yet published</em></div>
          <div class="floor-cell"><span>Packaging reserves</span><strong>—</strong><em>Not yet published</em></div>
        </div>
      </section>

      <div class="notice">
        Operational stock mandate: inventory is event-sourced — every unit count derives from
        immutable stock-movement records, never direct edits. Partner visibility is strictly
        aggregate-level and excludes all customer-facing data.
      </div>
    }
  `,
  styles: [
    `
      .rail-rows { display: flex; flex-direction: column; }
      .rail-row { display: flex; justify-content: space-between; gap: 0.8rem; padding: 0.45rem 0;
        border-bottom: 1px solid var(--hairline); font-size: var(--type-body-sm);
        span { color: var(--ink-dim); }
        strong { font-variant-numeric: tabular-nums; }
        &:last-child { border-bottom: 0; } }
      .empty-cell { color: var(--ink-dim); padding: 1rem 0.8rem; }
      .sub { display: block; font-size: var(--type-label-sm); color: var(--ink-dim); margin-top: 0.1rem; }
      .floor-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1px;
        background: var(--hairline); border: 1px solid var(--hairline); }
      .floor-cell { background: var(--panel-2); padding: 0.65rem 0.75rem; display: flex; flex-direction: column; gap: 0.05rem;
        span { font-size: var(--type-label-sm); text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-dim); }
        strong { font-size: 1.15rem; }
        em { font-style: normal; font-size: var(--type-label-sm); color: var(--ink-dim); } }
    `,
  ],
})
export class InventoryPage {
  readonly store = inject(PortalStore);

  /** Total raw-material units across live mill lots (quantity, not ₦ — no valuation endpoint). */
  readonly materialUnits = computed(() => {
    const rows = this.store.materialRows();
    return rows.reduce((sum, r) => sum + Math.max(0, r.currentQuantity), 0);
  });

  silhouetteLabel(row: RegisterRow): string {
    return row.meta?.name ?? 'Unlabelled item';
  }

  skuLabel(row: RegisterRow): string {
    return row.meta?.sku ?? '';
  }

  specLabel(row: RegisterRow): string {
    const parts = [row.meta?.colour, row.meta?.size].filter((p): p is string => !!p);
    return parts.length > 0 ? parts.join(' · ') : '—';
  }

  statusLabel(quantity: number): string {
    return quantity > 0 ? 'In stock' : 'Audit flag';
  }
}
