import { DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { InventorySummaryRow, ProductVariantRef } from '../api.service';
import { PortalStore } from '../portal.store';

type RegisterRow = InventorySummaryRow & { meta: ProductVariantRef | null };

const SEGMENT_CLASSES = ['bg-accent', 'bg-warning', 'bg-light-secondary'];

/** Screen P6: audited aggregate inventory telemetry — no valuations until audit. */
@Component({
  selector: 'app-inventory-page',
  imports: [DecimalPipe],
  template: `
    @if (store.dash(); as d) {
      <div class="stitch">
        <div class="flex flex-col gap-4 md:grid md:grid-cols-2 md:items-start">
          <!-- Stock on Hand Island Card -->
          <section class="hero bg-light-surface rounded-xl p-5 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.06)] flex flex-col gap-3.5 relative overflow-hidden md:col-span-2">
            <div class="flex items-start justify-between">
              <div>
                <span class="text-[11px] font-mono uppercase tracking-wider text-light-secondary font-semibold block">Finished goods on hand</span>
                <div class="text-[26px] font-bold font-mono text-light-primary tracking-tight mt-0.5">{{ d.inventoryVisibility.finishedGoodsUnits | number }} units</div>
                <span class="text-[12px] text-light-secondary mt-0.5 block">Aggregate telemetry from event-sourced stock movements</span>
              </div>
              <div class="w-10 h-10 rounded-xl bg-accent/20 text-warning flex items-center justify-center flex-shrink-0">
                <span class="material-symbols-outlined text-[22px]">warehouse</span>
              </div>
            </div>

            <div class="metrics grid grid-cols-2 gap-2 pt-1 border-t border-border text-[12px] md:grid-cols-4">
              <div class="p-2.5 rounded-lg bg-canvas border border-border/80">
                <span class="text-[10px] text-light-secondary font-mono block">Finished goods value</span>
                <strong class="font-mono text-light-primary text-[13px] block mt-0.5">Not yet valued</strong>
                <span class="text-[9px] text-light-secondary font-semibold">Published after audit</span>
              </div>
              <div class="p-2.5 rounded-lg bg-canvas border border-border/80">
                <span class="text-[10px] text-light-secondary font-mono block">Raw material holdings</span>
                <strong class="font-mono text-light-primary text-[13px] block mt-0.5">{{ materialUnits() | number }} units</strong>
                <span class="text-[9px] text-light-secondary font-semibold">Live mill lots</span>
              </div>
              <div class="p-2.5 rounded-lg bg-canvas border border-border/80">
                <span class="text-[10px] text-light-secondary font-mono block">Reserved &amp; written off</span>
                <strong class="font-mono text-light-primary text-[13px] block mt-0.5">-</strong>
                <span class="text-[9px] text-light-secondary font-semibold">QC reason-coded, quarterly</span>
              </div>
              <div class="p-2.5 rounded-lg bg-canvas border border-border/80">
                <span class="text-[10px] text-light-secondary font-mono block">Position period</span>
                <strong class="font-mono text-light-primary text-[13px] block mt-0.5">{{ store.periodLabel() }}</strong>
                <span class="text-[9px] text-light-secondary font-semibold">Single Aba factory</span>
              </div>
            </div>
          </section>

          <!-- Stock distribution -->
          <section class="bg-light-surface rounded-xl p-4 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.05)] flex flex-col gap-3">
            <div class="flex items-center justify-between border-b border-border pb-2.5">
              <div>
                <h2 class="text-[14px] font-bold text-light-primary">Stock distribution</h2>
                <span class="text-[11px] text-light-secondary">By product silhouette</span>
              </div>
              <span class="text-[11px] font-mono text-light-secondary font-semibold">{{ categoryRows().length }} SILHOUETTES</span>
            </div>

            @if (categoryRows().length) {
              <div class="flex items-center gap-1.5 h-3 rounded-full bg-canvas-tint overflow-hidden">
                @for (row of categoryRows(); track row.name; let i = $index) {
                  <div class="h-full" [class]="SEGMENTS[i % SEGMENTS.length]" [style.width.%]="row.pct" [title]="row.name + ': ' + (row.units | number) + ' units'"></div>
                }
              </div>
              <div class="flex flex-col gap-2.5 text-[12px]">
                @for (row of categoryRows(); track row.name; let i = $index) {
                  <div class="p-3 rounded-lg bg-canvas border border-border flex items-center justify-between">
                    <div class="flex items-center gap-3">
                      <div class="w-2.5 h-2.5 rounded-sm flex-shrink-0" [class]="SEGMENTS[i % SEGMENTS.length]"></div>
                      <strong class="font-bold text-light-primary">{{ row.name }}</strong>
                    </div>
                    <div class="text-right">
                      <span class="font-mono font-bold text-light-primary block text-[13px]">{{ row.units | number }} units</span>
                      <span class="text-[10px] font-mono text-light-secondary">{{ row.pct | number: '1.0-0' }}% of stock</span>
                    </div>
                  </div>
                }
              </div>
            } @else {
              <p class="text-[12px] text-light-secondary">Distribution fills as stock movements are posted to the ledger.</p>
            }
          </section>

          <!-- Product silhouette register -->
          <section class="bg-light-surface rounded-xl p-4 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.05)] flex flex-col gap-3">
            <div class="flex items-center justify-between border-b border-border pb-2.5">
              <div>
                <h2 class="text-[14px] font-bold text-light-primary">Product silhouette register</h2>
                <span class="text-[11px] text-light-secondary">SKU aggregates</span>
              </div>
            </div>

            @if (store.finishedVariantRows().length) {
              <div class="register flex flex-col gap-2.5 text-[12px]">
                @for (row of store.finishedVariantRows(); track row.itemId) {
                  <div class="p-3 rounded-lg bg-canvas border border-border flex items-center justify-between">
                    <div>
                      <strong class="font-bold text-light-primary block">{{ silhouetteLabel(row) }}</strong>
                      <span class="text-[11px] text-light-secondary">{{ skuLabel(row) }} @if (specLabel(row) !== '-') { · {{ specLabel(row) }} }</span>
                    </div>
                    <div class="text-right">
                      <span class="font-mono font-bold text-light-primary block text-[13px]">{{ row.currentQuantity | number }}</span>
                      <span class="text-[10px] font-semibold" [class.text-success]="row.currentQuantity > 0" [class.text-light-secondary]="row.currentQuantity <= 0">{{ row.currentQuantity > 0 ? 'In stock' : 'Out' }}</span>
                    </div>
                  </div>
                }
              </div>
            } @else {
              <p class="text-[12px] text-light-secondary">Line items appear per SKU with audited unit counts once stock movements are recorded.</p>
            }
          </section>

          <!-- Facility & raw materials -->
          <section class="bg-light-surface rounded-xl p-4 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.05)] flex flex-col gap-1 text-[12px]">
            <h3 class="text-[13px] font-bold text-light-primary border-b border-border pb-2 flex items-center justify-between">
              <span>Facility &amp; raw materials</span>
              <span class="text-[11px] font-mono text-accent">ABA MILL</span>
            </h3>
            @if (store.materialRows().length) {
              @for (row of store.materialRows(); track row.itemId) {
                <div class="flex justify-between py-1.5 border-b border-border/60 gap-3">
                  <span class="text-light-secondary">{{ silhouetteLabel(row) }}:</span>
                  <strong class="text-light-primary font-mono text-right">{{ row.currentQuantity | number }} units</strong>
                </div>
              }
            } @else {
              <div class="flex justify-between py-1.5 border-b border-border/60 gap-3">
                <span class="text-light-secondary">Mill custody lots (cotton, poly, trims, packaging):</span>
                <strong class="text-light-primary">Not yet published</strong>
              </div>
            }
            <div class="flex justify-between py-1.5 gap-3">
              <span class="text-light-secondary">Per-floor utilisation:</span>
              <strong class="text-light-primary">Not yet shared</strong>
            </div>
            <p class="text-[11px] text-light-secondary leading-normal pt-2">Seentair operates a single factory. Aggregate telemetry only, never individual person data.</p>
          </section>
        </div>
      </div>
    }
  `,
})
export class InventoryPage {
  readonly store = inject(PortalStore);
  readonly SEGMENTS = SEGMENT_CLASSES;
  readonly materialUnits = computed(() =>
    this.store.materialRows().reduce((sum, r) => sum + Math.max(0, r.currentQuantity), 0),
  );
  readonly categoryRows = computed(() => this.store.categoryRows());
  silhouetteLabel(row: RegisterRow): string {
    return row.meta?.name ?? 'Unlabelled item';
  }
  skuLabel(row: RegisterRow): string {
    return row.meta?.sku ?? '';
  }
  specLabel(row: RegisterRow): string {
    const parts = [row.meta?.colour, row.meta?.size].filter((p): p is string => !!p);
    return parts.length ? parts.join(' · ') : '-';
  }
}
