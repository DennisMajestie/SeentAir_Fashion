import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  SeBadgeComponent,
  SeButtonDirective,
  SeCellDirective,
  SeColumn,
  SeConfirmService,
  SeCurrencyService,
  SeDrawerComponent,
  SeFieldComponent,
  SeFilterBarComponent,
  SeInputDirective,
  SeKvDirective,
  SeKvItemComponent,
  SeMetricCardComponent,
  SePageComponent,
  SeStatusComponent,
  SeTab,
  SeTabPanelDirective,
  SeTableComponent,
  SeTabsComponent,
  SeToastService,
} from '@seentair/ui';
import { AccessService } from '../access.service';
import { ApiService } from '../api.service';
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

interface SummaryRow {
  itemType: string;
  itemId: string;
  byMovementType: Record<string, number>;
}
interface SupplierRow {
  id: string;
  name: string;
  category: string | null;
  location: string | null;
  certified: boolean;
  slaScore: number | null;
  quotaUnits: number | null;
  complianceNotes: string | null;
}
const NEW_SUPPLIER = {
  name: '',
  category: '',
  location: '',
  slaScore: null as number | null,
  quotaUnits: null as number | null,
  certified: false,
  complianceNotes: '',
};

/**
 * Procurement: the supplier directory, and what has been bought of each
 * material. A supplier opens in a drawer to view, edit or delete. A material
 * opens its own page (materials/:id), where its purchase history lives and
 * where an approval-gated purchase is recorded.
 */
@Component({
  selector: 'app-vendors-admin',
  imports: [
    FormsModule,
    SeBadgeComponent,
    SeButtonDirective,
    SeCellDirective,
    SeDrawerComponent,
    SeFieldComponent,
    SeFilterBarComponent,
    SeInputDirective,
    SeKvDirective,
    SeKvItemComponent,
    SeMetricCardComponent,
    SePageComponent,
    SeStatusComponent,
    SeTabPanelDirective,
    SeTableComponent,
    SeTabsComponent,
  ],
  template: `
    <se-page title="Procurement">
      @if (canWrite()) {
        <button seButton variant="primary" sePageActions type="button" (click)="openAdd()">
          Add supplier
        </button>
      }
      <se-tabs #t sePageTabs label="Procurement sections" [tabs]="tabs()" [(active)]="tab" />

      <div class="se-metric-grid">
        <se-metric-card label="Suppliers" [value]="suppliers().length" />
        <se-metric-card label="Certified suppliers" [value]="certifiedCount()" />
        <se-metric-card
          label="Units purchased"
          [value]="purchasedTotal()"
          hint="All materials, all time"
        />
        <se-metric-card label="Materials below minimum" [value]="criticalCount()" />
      </div>

      <div seTabPanel="suppliers" [for]="t">
        <se-table
          caption="Suppliers"
          [columns]="supplierColumns"
          [rows]="supplierRows()"
          [loading]="loading()"
          [error]="error()"
          (retry)="load()"
          activatable
          (rowActivate)="openSupplier($event)"
          [emptyHeading]="query().trim() ? 'No suppliers match this search' : 'No suppliers yet'"
          [emptyText]="
            query().trim() ? 'Clear the search to see every supplier.' : 'Add the first supplier.'
          "
        >
          <se-filter-bar
            seTableToolbar
            searchLabel="Search suppliers"
            searchPlaceholder="Name or location"
            [(query)]="query"
            [summary]="units(supplierRows().length, 'supplier')"
          />
          <ng-template seCell="certified" let-row>
            <se-badge [tone]="row.certified ? 'success' : 'neutral'">{{
              row.certified ? 'Certified' : 'Not certified'
            }}</se-badge>
          </ng-template>
        </se-table>
      </div>

      <div seTabPanel="purchases" [for]="t">
        <se-table
          caption="Purchases by material"
          [columns]="materialColumns"
          [rows]="materialRows()"
          [loading]="loading()"
          [error]="materialsError()"
          (retry)="load()"
          activatable
          (rowActivate)="openMaterial($event)"
          emptyHeading="No materials yet"
          emptyText="Purchases appear here once a material has been added and bought."
        >
          <ng-template seCell="status" let-row>
            <se-status kind="stock" [value]="state(row)" />
          </ng-template>
        </se-table>
      </div>

      <se-drawer [title]="editing()?.name ?? 'Add supplier'" [(open)]="drawerOpen">
        <form class="se-form" (ngSubmit)="save()">
          @if (editing(); as s) {
            <dl seKv>
              <div seKvItem label="Category">{{ categoryLabel(s.category) }}</div>
              <div seKvItem label="Location">{{ s.location ?? 'Not set' }}</div>
            </dl>
          } @else {
            <se-field label="Name" [error]="nameError()">
              <input seInput name="name" [(ngModel)]="form.name" />
            </se-field>
            <se-field label="Category" optional>
              <select seInput name="category" [(ngModel)]="form.category">
                <option value="">No category</option>
                @for (c of categories; track c.value) {
                  <option [value]="c.value">{{ c.label }}</option>
                }
              </select>
            </se-field>
            <se-field label="Location" optional>
              <input seInput name="location" [(ngModel)]="form.location" />
            </se-field>
          }
          @if (canWrite()) {
            <div class="se-form__row">
              <se-field label="Delivery score" hint="0 to 100" optional>
                <input
                  seInput
                  type="number"
                  min="0"
                  max="100"
                  name="sla"
                  [(ngModel)]="form.slaScore"
                />
              </se-field>
              <se-field label="Contracted units" optional>
                <input seInput type="number" min="0" name="quota" [(ngModel)]="form.quotaUnits" />
              </se-field>
            </div>
            <label class="se-choice">
              <input type="checkbox" name="certified" [(ngModel)]="form.certified" />
              <span>Certified supplier</span>
            </label>
            <se-field label="Compliance notes" optional [error]="saveError()">
              <textarea seInput rows="3" name="notes" [(ngModel)]="form.complianceNotes"></textarea>
            </se-field>
          } @else if (editing(); as s) {
            <dl seKv>
              <div seKvItem label="Delivery score" numeric>{{ s.slaScore ?? 'Not set' }}</div>
              <div seKvItem label="Contracted units" numeric>{{ s.quotaUnits ?? 'Not set' }}</div>
              <div seKvItem label="Compliance notes">{{ s.complianceNotes || 'None' }}</div>
            </dl>
          }
        </form>
        @if (canWrite()) {
          <ng-container seDrawerFooter>
            @if (editing(); as s) {
              <button seButton variant="danger" type="button" (click)="deleteSupplier(s)">
                Delete supplier
              </button>
            }
            <button seButton type="button" (click)="drawerOpen.set(false)">Cancel</button>
            <button seButton variant="primary" type="button" [loading]="saving()" (click)="save()">
              {{ editing() ? 'Save supplier' : 'Add supplier' }}
            </button>
          </ng-container>
        }
      </se-drawer>
    </se-page>
  `,
})
export class VendorsAdminPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly confirm = inject(SeConfirmService);
  private readonly toast = inject(SeToastService);
  private readonly currency = inject(SeCurrencyService);
  private readonly access = inject(AccessService);
  readonly units = units;
  readonly categoryLabel = categoryLabel;
  readonly categories = MATERIAL_CATEGORIES;
  readonly canWrite = computed(() => this.access.can('raw_materials', 'full'));

  readonly suppliers = signal<SupplierRow[]>([]);
  readonly materials = signal<MaterialRow[]>([]);
  readonly summary = signal<SummaryRow[]>([]);
  readonly valuations = signal<Array<{ id: string; lastUnitCost: number | null }>>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly materialsError = signal('');

  readonly tab = signal('suppliers');
  readonly tabs = computed<SeTab[]>(() => [
    { id: 'suppliers', label: 'Suppliers', count: this.suppliers().length },
    { id: 'purchases', label: 'Purchases', count: this.materials().length },
  ]);
  readonly query = urlFilters([]).query;
  readonly supplierRows = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.suppliers().filter(
      (s) => !q || s.name.toLowerCase().includes(q) || (s.location ?? '').toLowerCase().includes(q),
    );
  });
  /** The search narrows both lists, as it always has. */
  readonly materialRows = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.materials().filter((m) => !q || m.name.toLowerCase().includes(q));
  });

  readonly supplierColumns: SeColumn<SupplierRow>[] = [
    { key: 'name', header: 'Supplier', sortable: true, value: (s) => s.name },
    { key: 'category', header: 'Category', value: (s) => categoryLabel(s.category) },
    { key: 'location', header: 'Location', value: (s) => s.location ?? '' },
    { key: 'certified', header: 'Certification', value: (s) => (s.certified ? 1 : 0) },
    {
      key: 'sla',
      header: 'Delivery score',
      numeric: true,
      sortable: true,
      value: (s) => s.slaScore ?? '',
    },
    { key: 'quota', header: 'Contracted units', numeric: true, value: (s) => s.quotaUnits ?? '' },
  ];
  readonly materialColumns: SeColumn<MaterialRow>[] = [
    { key: 'name', header: 'Material', sortable: true, value: (m) => m.name },
    {
      key: 'in',
      header: 'Purchased',
      numeric: true,
      sortable: true,
      value: (m) => this.purchasedOf(m.id),
    },
    { key: 'used', header: 'Used', numeric: true, value: (m) => this.usedOf(m.id) },
    { key: 'hand', header: 'On hand', numeric: true, value: (m) => m.currentQuantity },
    {
      key: 'cost',
      header: 'Last unit cost',
      numeric: true,
      value: (m) => this.valuations().find((v) => v.id === m.id)?.lastUnitCost ?? '',
      format: (v) => (v === '' ? '' : this.currency.format(v as number)),
    },
    { key: 'status', header: 'Status', value: (m) => this.state(m) },
  ];

  readonly purchasedTotal = computed(() =>
    this.summary()
      .filter((s) => s.itemType === 'material')
      .reduce((sum, s) => sum + (s.byMovementType['purchase'] ?? 0), 0),
  );
  readonly criticalCount = computed(() => this.materials().filter((m) => m.lowStock).length);
  readonly certifiedCount = computed(() => this.suppliers().filter((s) => s.certified).length);

  readonly drawerOpen = signal(false);
  /** The supplier open in the drawer; null while adding a new one. */
  readonly editing = signal<SupplierRow | null>(null);
  readonly saving = signal(false);
  readonly nameError = signal('');
  readonly saveError = signal('');
  form = { ...NEW_SUPPLIER };

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.suppliers().subscribe({
      next: (res) => {
        this.suppliers.set(res as unknown as SupplierRow[]);
        this.loading.set(false);
        this.error.set('');
      },
      error: (err) => {
        this.loading.set(false);
        if (this.suppliers().length === 0) this.error.set(errorText(err, LOAD_FAILED));
      },
    });
    this.api.materials().subscribe({
      next: (res) => {
        this.materials.set(res as unknown as MaterialRow[]);
        this.materialsError.set('');
      },
      error: (err) => {
        if (this.materials().length === 0) this.materialsError.set(errorText(err, LOAD_FAILED));
      },
    });
    this.api.inventorySummary().subscribe({
      next: (s) => this.summary.set(s),
      error: () => undefined,
    });
    this.api.materialsValuation().subscribe({
      next: (res) => this.valuations.set(res),
      error: () => undefined,
    });
  }

  private materialSummary(id: string): SummaryRow | undefined {
    return this.summary().find((s) => s.itemType === 'material' && s.itemId === id);
  }
  purchasedOf(id: string): number {
    return this.materialSummary(id)?.byMovementType['purchase'] ?? 0;
  }
  usedOf(id: string): number {
    return Object.entries(this.materialSummary(id)?.byMovementType ?? {})
      .filter(([type, qty]) => qty < 0 && type !== 'adjustment')
      .reduce((sum, [, qty]) => sum - qty, 0);
  }
  state(m: MaterialRow): string {
    return stockState(m.currentQuantity, m.lowStock);
  }

  openMaterial(m: MaterialRow): void {
    void this.router.navigate(['/materials', m.id]);
  }

  openAdd(): void {
    this.show(null, { ...NEW_SUPPLIER });
  }
  openSupplier(s: SupplierRow): void {
    this.show(s, { ...NEW_SUPPLIER, ...s, complianceNotes: s.complianceNotes ?? '' } as never);
  }
  private show(s: SupplierRow | null, form: typeof NEW_SUPPLIER): void {
    this.editing.set(s);
    this.form = form;
    this.nameError.set('');
    this.saveError.set('');
    this.drawerOpen.set(true);
  }

  save(): void {
    const s = this.editing();
    const f = this.form;
    if (!s && !f.name.trim()) {
      this.nameError.set('Enter the supplier name.');
      return;
    }
    this.nameError.set('');
    const terms = {
      slaScore: f.slaScore ?? undefined,
      quotaUnits: f.quotaUnits ?? undefined,
      certified: !!f.certified,
      complianceNotes: f.complianceNotes || undefined,
    };
    const request = s
      ? this.api.updateSupplier(s.id, terms)
      : this.api.createSupplier({
          name: f.name,
          category: f.category || undefined,
          location: f.location || undefined,
          ...terms,
        });
    this.saving.set(true);
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.drawerOpen.set(false);
        this.toast.show(s ? 'Supplier saved' : 'Supplier added');
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.saveError.set(errorText(err, 'The supplier could not be saved. Try again.'));
      },
    });
  }

  async deleteSupplier(s: SupplierRow): Promise<void> {
    const ok = await this.confirm.ask({
      title: `Delete supplier ${s.name}?`,
      consequence:
        'The supplier is removed from the list. Past purchases keep their records. This cannot be undone.',
      confirmLabel: 'Delete supplier',
      danger: true,
    });
    if (!ok) return;
    this.api.deleteSupplier(s.id).subscribe({
      next: () => {
        this.drawerOpen.set(false);
        this.toast.show('Supplier deleted');
        this.load();
      },
      error: () =>
        this.toast.show(`${s.name} could not be deleted`, {
          tone: 'danger',
          action: { label: 'Try again', run: () => void this.deleteSupplier(s) },
        }),
    });
  }
}
