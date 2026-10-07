import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  SeBannerComponent,
  SeButtonDirective,
  SeColumn,
  SeCurrencyService,
  SeFilter,
  SeFilterBarComponent,
  SeMetricCardComponent,
  SeMoneyPipe,
  SePageComponent,
  SeTableComponent,
  SeToastService,
} from '@seentair/ui';
import { ApiService } from '../api.service';
import { downloadCsv } from '../csv.util';
import { urlFilters } from '../url-filters';
import { LOAD_FAILED, errorText, movementLabel, signed, units } from './stock-format';

interface SummaryRow {
  itemType: string;
  itemId: string;
  currentQuantity: number;
  byMovementType: Record<string, number>;
}
interface LedgerCheck {
  total: number;
  valid: number;
  broken: number;
  headHash: string | null;
}

/**
 * Inventory: every finished item and raw material with its current stock.
 *
 * Stock is never edited. Each figure is derived from the movement ledger, so
 * this list only finds an item; its own page (inventory/:itemType/:itemId)
 * shows the history and is where a movement is recorded.
 */
@Component({
  selector: 'app-inventory-admin',
  imports: [
    SeBannerComponent,
    SeButtonDirective,
    SeFilterBarComponent,
    SeMetricCardComponent,
    SeMoneyPipe,
    SePageComponent,
    SeTableComponent,
  ],
  template: `
    <se-page title="Inventory">
      <button seButton sePageActions type="button" (click)="exportCsv()">Export CSV</button>
      <button seButton sePageActions type="button" [loading]="checking()" (click)="verifyLedger()">
        Check ledger
      </button>

      <div class="se-metric-grid">
        <se-metric-card label="Finished units" [value]="finishedUnits()" hint="In stock now" />
        <se-metric-card
          label="Finished stock value"
          [value]="finishedValue() | seMoney"
          hint="At current selling prices"
        />
        <se-metric-card label="Raw materials" [value]="materialCount()" hint="Tracked materials" />
        <se-metric-card label="In production" [value]="wipUnits()" hint="Units not yet completed" />
        <se-metric-card
          label="Returns awaiting"
          [value]="returnsAwaiting()"
          hint="Requested, not yet decided"
        />
      </div>

      @if (ledgerCheck(); as check) {
        <se-banner
          [tone]="check.broken === 0 ? 'success' : 'danger'"
          [title]="
            check.broken === 0
              ? 'The stock ledger is intact'
              : check.broken + ' of ' + check.total + ' ledger entries do not match their record'
          "
          dismissible
          (dismiss)="ledgerCheck.set(null)"
        >
          {{ check.valid }} of {{ check.total }} movements checked out.
          @if (check.headHash) {
            Latest entry fingerprint: {{ check.headHash.slice(0, 16) }}.
          }
        </se-banner>
      }

      <se-table
        caption="Inventory"
        [columns]="columns"
        [rows]="rows()"
        [rowId]="rowId"
        [loading]="loading()"
        [error]="error()"
        (retry)="load()"
        [pageSize]="25"
        activatable
        (rowActivate)="open($event)"
        [emptyHeading]="filtering() ? 'No items match these filters' : 'No stock recorded yet'"
        [emptyText]="
          filtering()
            ? 'Remove a filter, or clear the search to see every item.'
            : 'Items appear here once a purchase or a finished batch is recorded.'
        "
      >
        <se-filter-bar
          seTableToolbar
          searchLabel="Search inventory"
          searchPlaceholder="SKU or material"
          [(query)]="query"
          [filters]="filters"
          [(value)]="filterValue"
          [summary]="units(rows().length, 'item')"
        />
      </se-table>
    </se-page>
  `,
})
export class InventoryAdminPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly toast = inject(SeToastService);
  private readonly currency = inject(SeCurrencyService);
  readonly units = units;

  readonly summary = signal<SummaryRow[]>([]);
  /** True only until the first answer arrives; a refresh keeps the rows on screen. */
  readonly loading = signal(true);
  readonly error = signal('');
  readonly wipUnits = signal(0);
  readonly returnsAwaiting = signal(0);
  readonly ledgerCheck = signal<LedgerCheck | null>(null);
  readonly checking = signal(false);
  private readonly labels = signal<Map<string, string>>(new Map());
  private readonly prices = signal<Map<string, number>>(new Map());

  private readonly urlState = urlFilters(['type']);
  readonly query = this.urlState.query;
  readonly filterValue = this.urlState.value;
  readonly filters: SeFilter[] = [
    {
      key: 'type',
      label: 'Type',
      options: [
        { value: 'variant', label: 'Finished goods' },
        { value: 'material', label: 'Raw materials' },
      ],
    },
  ];
  readonly filtering = computed(() => !!this.query().trim() || !!this.filterValue()['type']);

  readonly rows = computed(() => {
    const type = this.filterValue()['type'];
    const q = this.query().trim().toLowerCase();
    return this.summary().filter(
      (s) => (!type || s.itemType === type) && (!q || this.labelFor(s).toLowerCase().includes(q)),
    );
  });
  readonly rowId = (s: SummaryRow): string => `${s.itemType}:${s.itemId}`;

  readonly columns: SeColumn<SummaryRow>[] = [
    { key: 'item', header: 'Item', sortable: true, value: (s) => this.labelFor(s) },
    {
      key: 'type',
      header: 'Type',
      sortable: true,
      value: (s) => (s.itemType === 'variant' ? 'Finished goods' : 'Raw material'),
    },
    {
      key: 'current',
      header: 'In stock',
      numeric: true,
      sortable: true,
      value: (s) => s.currentQuantity,
    },
    {
      key: 'movements',
      header: 'In and out by movement',
      value: (s) =>
        Object.entries(s.byMovementType)
          .map(([type, qty]) => `${movementLabel(type)} ${signed(qty)}`)
          .join(', '),
    },
    {
      key: 'value',
      header: 'Estimated value',
      numeric: true,
      sortable: true,
      value: (s) => this.valueOf(s) ?? -1,
      // Materials carry no stored unit price, so they have no value here.
      format: (v) => ((v as number) < 0 ? '' : this.currency.format(v as number)),
    },
  ];

  readonly finishedUnits = computed(() =>
    this.summary()
      .filter((s) => s.itemType === 'variant')
      .reduce((sum, s) => sum + s.currentQuantity, 0),
  );
  readonly finishedValue = computed(() =>
    this.summary().reduce((sum, s) => sum + (this.valueOf(s) ?? 0), 0),
  );
  readonly materialCount = computed(
    () => this.summary().filter((s) => s.itemType === 'material').length,
  );

  ngOnInit(): void {
    this.load();
    this.api.products().subscribe((res) => {
      const labels = new Map(this.labels());
      const prices = new Map<string, number>();
      for (const p of res.data as unknown as Array<{
        basePrice: number;
        variants: Array<{ id: string; sku: string; priceOverride: number | null }>;
      }>) {
        for (const v of p.variants ?? []) {
          labels.set(`variant:${v.id}`, v.sku);
          prices.set(v.id, Number(v.priceOverride ?? p.basePrice) || 0);
        }
      }
      this.labels.set(labels);
      this.prices.set(prices);
    });
    this.api.materials().subscribe((mats) => {
      const labels = new Map(this.labels());
      for (const m of mats as unknown as Array<{ id: string; name: string }>) {
        labels.set(`material:${m.id}`, m.name);
      }
      this.labels.set(labels);
    });
    this.api.batches().subscribe((res) => {
      const last = res.stages[res.stages.length - 1];
      this.wipUnits.set(
        res.data.filter((b) => b.stage !== last).reduce((sum, b) => sum + b.quantity, 0),
      );
    });
    this.api
      .returns()
      .subscribe((res) =>
        this.returnsAwaiting.set(res.data.filter((r) => r.status === 'requested').length),
      );
  }

  load(): void {
    this.api.inventorySummary().subscribe({
      next: (s) => {
        this.summary.set(s);
        this.loading.set(false);
        this.error.set('');
      },
      error: (err) => {
        this.loading.set(false);
        // A failed refresh must not wipe a list that is already on screen.
        if (this.summary().length === 0) this.error.set(errorText(err, LOAD_FAILED));
      },
    });
  }

  labelFor(s: SummaryRow): string {
    return this.labels().get(`${s.itemType}:${s.itemId}`) ?? s.itemId.slice(0, 8);
  }
  valueOf(s: SummaryRow): number | null {
    const price = s.itemType === 'variant' ? this.prices().get(s.itemId) : undefined;
    return price === undefined ? null : s.currentQuantity * price;
  }

  open(s: SummaryRow): void {
    void this.router.navigate(['/inventory', s.itemType, s.itemId]);
  }

  exportCsv(): void {
    const rows = this.rows().map((s) => ({
      Item: this.labelFor(s),
      Type: s.itemType === 'variant' ? 'finished' : 'material',
      CurrentUnits: s.currentQuantity,
      Value: this.valueOf(s) ?? '',
    }));
    const view = this.filterValue()['type'] || 'all';
    downloadCsv(`inventory-${view}-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  /** Re-checks every ledger entry against its recorded fingerprint. Reads only. */
  verifyLedger(): void {
    this.checking.set(true);
    this.api.inventoryLedgerVerify().subscribe({
      next: (res) => {
        this.ledgerCheck.set(res);
        this.checking.set(false);
      },
      error: () => {
        this.checking.set(false);
        this.toast.show('The ledger could not be checked', {
          tone: 'danger',
          action: { label: 'Try again', run: () => this.verifyLedger() },
        });
      },
    });
  }
}
