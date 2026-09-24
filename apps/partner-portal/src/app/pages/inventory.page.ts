import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { PortalStore } from '../portal.store';

/**
 * Screen P5 — Inventory Valuation & Raw Material Reserves. The partner API
 * exposes one audited aggregate (finished-goods units); every valuation and
 * per-category section renders the approved layout with honest empty states.
 */
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
          <span class="kpi-label">Raw material reserves</span>
          <span class="kpi-value">Not yet valued</span>
          <span class="kpi-sub">Cotton &amp; poly lots — mill custody</span>
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
          <!-- GAP: no per-category stock breakdown endpoint for partners — only the audited total. -->
          <div class="meter-row">
            <span>All finished garments</span>
            <div class="meter gold"><div class="meter-fill" style="width: 100%"></div></div>
            <span class="meter-val mono">{{ d.inventoryVisibility.finishedGoodsUnits | number }} units</span>
          </div>
          <p class="gap-note" style="margin-top: 0.7rem">
            Category-level distribution (heavyweight tees, hoodies &amp; fleece, cargo &amp;
            bottoms, overshirts &amp; outerwear, accessories) is not yet published to the partner
            terminal.
          </p>
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
              <tr>
                <!-- GAP: no per-SKU stock register endpoint for partners — table renders its approved
                     structure with an honest empty state. -->
                <td colspan="6" class="wrap empty-cell">
                  No silhouette-level register has been published to partners yet. Line items
                  appear here per SKU with audited unit counts once released.
                </td>
              </tr>
            </tbody>
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
}
