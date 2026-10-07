import { DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import {
  SeBadgeComponent,
  SeCardComponent,
  SeCellDirective,
  SeColumn,
  SeEmptyStateComponent,
  SeKvDirective,
  SeKvItemComponent,
  SeMetricCardComponent,
  SePageComponent,
  SeStatusComponent,
  SeTableComponent,
} from '@seentair/ui';
import { InventorySummaryRow, ProductVariantRef } from '../api.service';
import { PortalStore } from '../portal.store';

type RegisterRow = InventorySummaryRow & { meta: ProductVariantRef | null };

interface CategoryRow {
  name: string;
  units: number;
  pct: number;
}

/**
 * Screen P5, Inventory Valuation & Raw Material Reserves. The partner API
 * exposes the audited finished-goods aggregate plus the live event-sourced
 * per-item stock summary, labelled with product names from the public
 * catalogue. Valuations stay honest "unvalued" (no ₦ endpoint).
 */
@Component({
  selector: 'app-inventory-page',
  imports: [
    DecimalPipe,
    SeBadgeComponent,
    SeCardComponent,
    SeCellDirective,
    SeEmptyStateComponent,
    SeKvDirective,
    SeKvItemComponent,
    SeMetricCardComponent,
    SePageComponent,
    SeStatusComponent,
    SeTableComponent,
  ],
  template: `
    @if (store.dash(); as d) {
      <se-page
        title="Inventory Valuation & Raw Material Reserves"
        description="Audited warehouse and mill holdings for the Seentair garment factory, Aba: aggregate telemetry only, derived from event-sourced stock movements."
      >
        <se-badge sePageStatus tone="info">{{ store.periodLabel() }} position</se-badge>

        <div class="se-metric-grid">
          <se-metric-card
            label="Finished goods in stock"
            [value]="(d.inventoryVisibility.finishedGoodsUnits | number) + ' units'"
            hint="Garment units ready in warehouse"
          />
          <se-metric-card
            label="Finished goods value"
            value="Not yet valued"
            hint="Valuation follows the next audit cycle"
          />
          <se-metric-card
            label="Raw material holdings"
            [value]="(materialUnits() | number) + ' units'"
            hint="Live mill lots: cotton, poly & trims"
          />
          <se-metric-card
            label="Reserved & written off"
            value="–"
            hint="QC reason-coded; reported quarterly"
          />
        </div>

        <div class="se-detail">
          <div class="se-detail__main">
            <se-card title="Stock distribution by category" flush>
              <se-table
                caption="Finished-goods units grouped by product silhouette"
                [columns]="categoryColumns"
                [rows]="categoryRows()"
                [rowId]="byName"
                hideDensity
                emptyHeading="No variant-level stock yet"
                emptyText="The distribution fills as stock movements are posted to the ledger."
              />
            </se-card>
          </div>
          <aside class="se-detail__aside">
            <se-card title="Facility breakdown">
              <dl seKv>
                <div seKvItem label="Aba garment factory" numeric>
                  {{ d.inventoryVisibility.finishedGoodsUnits | number }} units
                </div>
              </dl>
              <p class="inv-note">
                Seentair operates a single factory; per-floor utilisation telemetry is not yet
                shared.
              </p>
            </se-card>
          </aside>
        </div>

        <se-card title="Product silhouette stock register" flush>
          <se-table
            caption="SKU aggregates, never individual person data"
            [columns]="registerColumns"
            [rows]="store.finishedVariantRows()"
            [rowId]="byItem"
            hideDensity
            emptyHeading="No silhouette register yet"
            emptyText="Line items appear here per SKU with audited unit counts once stock movements are recorded."
          >
            <ng-template seCell="silhouette" let-row>
              <strong>{{ silhouetteLabel(row) }}</strong>
              @if (skuLabel(row); as sku) {
                <span class="inv-sub">{{ sku }}</span>
              }
            </ng-template>
            <ng-template seCell="status" let-row>
              <se-status
                kind="stock"
                [value]="row.currentQuantity > 0 ? 'in_stock' : 'out_of_stock'"
              />
            </ng-template>
          </se-table>
        </se-card>

        <se-card title="Raw material mills & in-store reserves">
          <se-empty-state
            heading="Not yet published"
            text="Mill custody lots (cotton reserves, poly & blend lots, trims and packaging) are not yet exposed to partners."
          />
        </se-card>
      </se-page>
    }
  `,
  styles: [
    `
      .inv-note {
        margin: var(--se-space-4) 0 0;
        color: var(--se-color-text-muted);
        font: var(--se-type-caption);
      }
      .inv-sub {
        display: block;
        color: var(--se-color-text-muted);
        font: var(--se-type-caption);
      }
    `,
  ],
})
export class InventoryPage {
  readonly store = inject(PortalStore);

  readonly byName = (row: CategoryRow): string => row.name;
  readonly byItem = (row: RegisterRow): string => row.itemId;

  /** Total raw-material units across live mill lots (quantity, not ₦, no valuation endpoint). */
  readonly materialUnits = computed(() => {
    const rows = this.store.materialRows();
    return rows.reduce((sum, r) => sum + Math.max(0, r.currentQuantity), 0);
  });

  readonly categoryColumns: SeColumn<CategoryRow>[] = [
    { key: 'name', header: 'Product silhouette' },
    { key: 'units', header: 'Units held', numeric: true, format: (v) => this.num(v as number) },
    { key: 'pct', header: 'Share', numeric: true, format: (v) => `${(v as number).toFixed(0)}%` },
  ];

  readonly categoryRows = computed<CategoryRow[]>(() => this.store.categoryRows());

  readonly registerColumns: SeColumn<RegisterRow>[] = [
    { key: 'silhouette', header: 'Silhouette', value: (row) => this.silhouetteLabel(row) },
    { key: 'spec', header: 'Fabric / spec', value: (row) => this.specLabel(row) },
    {
      key: 'currentQuantity',
      header: 'Units held',
      numeric: true,
      format: (v) => this.num(v as number),
    },
    { key: 'status', header: 'Status' },
  ];

  silhouetteLabel(row: RegisterRow): string {
    return row.meta?.name ?? 'Unlabelled item';
  }

  skuLabel(row: RegisterRow): string {
    return row.meta?.sku ?? '';
  }

  specLabel(row: RegisterRow): string {
    const parts = [row.meta?.colour, row.meta?.size].filter((p): p is string => !!p);
    return parts.length > 0 ? parts.join(' · ') : '-';
  }

  private num(value: number): string {
    return new Intl.NumberFormat('en-NG').format(value);
  }
}
