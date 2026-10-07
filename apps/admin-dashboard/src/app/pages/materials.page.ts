import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  SeBannerComponent,
  SeButtonDirective,
  SeCellDirective,
  SeColumn,
  SeConfirmService,
  SeDrawerComponent,
  SeFieldComponent,
  SeFilter,
  SeFilterBarComponent,
  SeInputDirective,
  SeMetricCardComponent,
  SeMoneyPipe,
  SePageComponent,
  SeStatusComponent,
  SeTableComponent,
  SeToastService,
} from '@seentair/ui';
import { AccessService } from '../access.service';
import { ApiService } from '../api.service';
import { downloadCsv } from '../csv.util';
import { urlFilters } from '../url-filters';
import {
  LOAD_FAILED,
  MATERIAL_CATEGORIES,
  MaterialRow,
  categoryLabel,
  errorText,
  stockState,
  units,
} from './stock-format';

/**
 * Raw materials and their minimum stock levels. The list finds a material;
 * its own page (materials/:id) holds the purchase and usage history and is
 * where a purchase (approval-gated) or usage is recorded.
 */
@Component({
  selector: 'app-materials-admin',
  imports: [
    FormsModule,
    SeBannerComponent,
    SeButtonDirective,
    SeCellDirective,
    SeDrawerComponent,
    SeFieldComponent,
    SeFilterBarComponent,
    SeInputDirective,
    SeMetricCardComponent,
    SeMoneyPipe,
    SePageComponent,
    SeStatusComponent,
    SeTableComponent,
  ],
  template: `
    <se-page title="Materials">
      <button seButton sePageActions type="button" (click)="exportCsv()">Export CSV</button>
      @if (canWrite()) {
        <button seButton variant="primary" sePageActions type="button" (click)="openAdd()">
          Add material
        </button>
      }

      <div class="se-metric-grid">
        <se-metric-card label="Materials" [value]="materials().length" hint="Tracked materials" />
        <se-metric-card
          label="Below minimum"
          [value]="lowStock().length"
          hint="At or under the minimum stock level"
        />
        <se-metric-card
          label="Stock value"
          [value]="valuationTotal() | seMoney"
          hint="At the last unit cost paid"
        />
      </div>

      @if (lowStock().length > 0) {
        <se-banner
          tone="warning"
          [title]="
            lowStock().length === 1
              ? '1 material is below its minimum'
              : lowStock().length + ' materials are below their minimum'
          "
          [actionLabel]="canWrite() ? 'Request reorder approval' : ''"
          (action)="draftPo()"
        >
          {{ lowStockNames() }}
        </se-banner>
      }

      <se-table
        caption="Materials"
        [columns]="columns"
        [rows]="rows()"
        [loading]="loading()"
        [error]="error()"
        (retry)="load()"
        [pageSize]="25"
        activatable
        (rowActivate)="open($event)"
        [emptyHeading]="filtering() ? 'No materials match these filters' : 'No materials yet'"
        [emptyText]="
          filtering()
            ? 'Remove a filter, or clear the search to see every material.'
            : 'Add the first material to start recording purchases and usage.'
        "
      >
        <se-filter-bar
          seTableToolbar
          searchLabel="Search materials"
          [(query)]="query"
          [filters]="filters"
          [(value)]="filterValue"
          [summary]="units(rows().length, 'material')"
        />
        <ng-template seCell="status" let-row>
          <se-status kind="stock" [value]="state(row)" />
        </ng-template>
      </se-table>

      @if (canWrite()) {
        <se-drawer title="Add material" [(open)]="adding">
          <form class="se-form" (ngSubmit)="create()">
            <se-field label="Name" hint="For example: cotton fabric" [error]="nameError()">
              <input seInput name="name" [(ngModel)]="nm.name" />
            </se-field>
            <se-field label="Unit" hint="How it is counted, such as yards" [error]="unitError()">
              <input seInput name="unit" [(ngModel)]="nm.unit" />
            </se-field>
            <se-field label="Category" optional>
              <select seInput name="category" [(ngModel)]="nm.category">
                <option value="">No category</option>
                @for (c of categories; track c.value) {
                  <option [value]="c.value">{{ c.label }}</option>
                }
              </select>
            </se-field>
            <se-field label="Storage location" hint="For example: C3-R1" optional>
              <input seInput name="location" [(ngModel)]="nm.storageLocation" />
            </se-field>
            <se-field
              label="Minimum stock level"
              hint="The material is flagged when stock falls to this level"
              [error]="createError()"
            >
              <input seInput type="number" min="0" name="min" [(ngModel)]="nm.reorderThreshold" />
            </se-field>
          </form>
          <ng-container seDrawerFooter>
            <button seButton type="button" (click)="adding.set(false)">Cancel</button>
            <button
              seButton
              variant="primary"
              type="button"
              [loading]="saving()"
              (click)="create()"
            >
              Add material
            </button>
          </ng-container>
        </se-drawer>
      }
    </se-page>
  `,
})
export class MaterialsAdminPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly confirm = inject(SeConfirmService);
  private readonly toast = inject(SeToastService);
  private readonly access = inject(AccessService);
  readonly units = units;
  readonly categories = MATERIAL_CATEGORIES;
  readonly canWrite = computed(() => this.access.can('raw_materials', 'full'));

  readonly materials = signal<MaterialRow[]>([]);
  /** Server-authoritative reorder list (GET /materials/low-stock). */
  readonly lowStock = signal<MaterialRow[]>([]);
  readonly valuationTotal = signal(0);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly lowStockNames = computed(() =>
    this.lowStock()
      .map(
        (m) => `${m.name}: ${units(m.currentQuantity, m.unit)} left, minimum ${m.reorderThreshold}`,
      )
      .join('. '),
  );

  private readonly urlState = urlFilters(['stock', 'category']);
  readonly query = this.urlState.query;
  readonly filterValue = this.urlState.value;
  readonly filters: SeFilter[] = [
    {
      key: 'stock',
      label: 'Stock',
      options: [
        { value: 'low', label: 'Below minimum' },
        { value: 'ok', label: 'Above minimum' },
      ],
    },
    { key: 'category', label: 'Category', options: MATERIAL_CATEGORIES },
  ];
  readonly filtering = computed(
    () => !!this.query().trim() || Object.keys(this.filterValue()).length > 0,
  );
  readonly rows = computed(() => {
    const f = this.filterValue();
    const q = this.query().trim().toLowerCase();
    return this.materials().filter((m) => {
      if (f['stock'] === 'low' && !m.lowStock) return false;
      if (f['stock'] === 'ok' && m.lowStock) return false;
      if (f['category'] && m.category !== f['category']) return false;
      return !q || m.name.toLowerCase().includes(q);
    });
  });

  readonly columns: SeColumn<MaterialRow>[] = [
    { key: 'name', header: 'Material', sortable: true, value: (m) => m.name },
    {
      key: 'category',
      header: 'Category',
      sortable: true,
      value: (m) => categoryLabel(m.category),
    },
    {
      key: 'available',
      header: 'Available',
      numeric: true,
      sortable: true,
      value: (m) => m.currentQuantity,
    },
    { key: 'minimum', header: 'Minimum', numeric: true, value: (m) => m.reorderThreshold },
    { key: 'unit', header: 'Unit', value: (m) => m.unit },
    { key: 'status', header: 'Status', value: (m) => this.state(m) },
  ];

  readonly adding = signal(false);
  readonly saving = signal(false);
  readonly nameError = signal('');
  readonly unitError = signal('');
  readonly createError = signal('');
  nm = { name: '', unit: '', category: '', storageLocation: '', reorderThreshold: 0 };

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.materials().subscribe({
      next: (res) => {
        this.materials.set(res as unknown as MaterialRow[]);
        this.loading.set(false);
        this.error.set('');
      },
      error: (err) => {
        this.loading.set(false);
        if (this.materials().length === 0) this.error.set(errorText(err, LOAD_FAILED));
      },
    });
    this.api.lowStockMaterials().subscribe({
      next: (res) => this.lowStock.set(res as unknown as MaterialRow[]),
      error: () => undefined,
    });
    this.api.materialsValuation().subscribe({
      next: (res) =>
        this.valuationTotal.set(res.reduce((sum, v) => sum + (Number(v.currentValue) || 0), 0)),
      error: () => undefined,
    });
  }

  state(m: MaterialRow): string {
    return stockState(m.currentQuantity, m.lowStock);
  }

  open(m: MaterialRow): void {
    void this.router.navigate(['/materials', m.id]);
  }

  exportCsv(): void {
    const rows = this.rows().map((m) => ({
      Material: m.name,
      Unit: m.unit,
      Current: m.currentQuantity,
      ReorderThreshold: m.reorderThreshold,
      Status: m.lowStock ? 'Critical' : 'Healthy',
    }));
    const view = this.filterValue()['stock'] || 'all';
    downloadCsv(`materials-${view}-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  /** Raises one purchasing approval covering every material below its minimum. */
  async draftPo(): Promise<void> {
    const items = this.lowStock().map((m) => ({
      material: m.name,
      currentQuantity: m.currentQuantity,
      reorderThreshold: m.reorderThreshold,
    }));
    if (items.length === 0) return;
    const ok = await this.confirm.ask({
      title: `Request approval to reorder ${units(items.length, 'material')}?`,
      consequence:
        'One purchasing request covering every material below its minimum goes to the approvals queue. Nothing is bought and no stock changes until management approves it. The request is audited.',
      confirmLabel: 'Request approval',
    });
    if (!ok) return;
    this.api
      .createApproval('purchasing', { draft: 'reorder critical materials', items })
      .subscribe({
        next: () => this.toast.show('Reorder approval requested'),
        error: () =>
          this.toast.show('The reorder approval could not be requested', {
            tone: 'danger',
            action: { label: 'Try again', run: () => void this.draftPo() },
          }),
      });
  }

  openAdd(): void {
    this.nameError.set('');
    this.unitError.set('');
    this.createError.set('');
    this.adding.set(true);
  }

  create(): void {
    this.nameError.set(this.nm.name.trim() ? '' : 'Enter the material name.');
    this.unitError.set(this.nm.unit.trim() ? '' : 'Enter the unit it is counted in.');
    if (this.nameError() || this.unitError()) return;
    this.saving.set(true);
    this.api
      .createMaterial({
        name: this.nm.name,
        unit: this.nm.unit,
        reorderThreshold: Number(this.nm.reorderThreshold),
        category: this.nm.category || undefined,
        storageLocation: this.nm.storageLocation || undefined,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.adding.set(false);
          this.nm = { name: '', unit: '', category: '', storageLocation: '', reorderThreshold: 0 };
          this.toast.show('Material added');
          this.load();
        },
        error: (err) => {
          this.saving.set(false);
          this.createError.set(errorText(err, 'The material could not be added. Try again.'));
        },
      });
  }
}
