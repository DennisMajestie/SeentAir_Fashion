import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  SeButtonDirective,
  SeColumn,
  SeDatePipe,
  SeDrawerComponent,
  SeFieldComponent,
  SeInputDirective,
  SePageComponent,
  SeTableComponent,
  SeToastService,
} from '@seentair/ui';
import { AdminStockCount, ApiService } from '../api.service';
import { AccessService } from '../access.service';

interface InventoryRow {
  itemType: 'variant' | 'material';
  itemId: string;
  currentQuantity: number;
  label: string;
}

@Component({
  selector: 'app-inventory-counts',
  imports: [
    FormsModule,
    SeButtonDirective,
    SeDatePipe,
    SeDrawerComponent,
    SeFieldComponent,
    SeInputDirective,
    SePageComponent,
    SeTableComponent,
  ],
  template: `
    <se-page title="Warehouse counts">
      @if (canWrite()) {
        <button seButton variant="primary" sePageActions type="button" (click)="openCount()">
          Record count
        </button>
      }
      <se-table
        caption="Stock count history"
        [columns]="columns"
        [rows]="counts()"
        [loading]="loading()"
        [error]="error()"
        (retry)="load()"
        [pageSize]="25"
        emptyHeading="No stock counts recorded"
        emptyText="A submitted count is saved with the system balance and any ledger adjustment."
      >
        <ng-template seCell="countedAt" let-row>{{ row.createdAt | seDate: 'datetime' }}</ng-template>
        <ng-template seCell="difference" let-row>{{ difference(row) }}</ng-template>
      </se-table>
      @if (catalogError()) {
        <p role="status">{{ catalogError() }}</p>
      }

      <se-drawer title="Record stock count" [(open)]="editing">
        <form class="se-form" (ngSubmit)="submitCount()">
          <se-field label="Item" [error]="formError()">
            <select
              seInput
              name="item"
              [ngModel]="itemKey()"
              (ngModelChange)="itemKey.set($event)"
            >
              <option value="">Choose an inventory item</option>
              @for (item of items(); track item.itemType + ':' + item.itemId) {
                <option [value]="item.itemType + ':' + item.itemId">
                  {{ item.label }} · {{ item.currentQuantity }} on hand
                </option>
              }
            </select>
          </se-field>
          @if (selectedItem(); as item) {
            <p>System quantity: {{ item.currentQuantity }} units</p>
            <se-field label="Physical quantity counted">
              <input
                seInput
                type="number"
                min="0"
                step="1"
                name="countedQuantity"
                [(ngModel)]="countedQuantity"
              />
            </se-field>
            @if (countedQuantity !== null && countedQuantity < item.currentQuantity) {
              <se-field
                label="Approved stock-disposal request ID"
                hint="Required before a count can reduce stock"
              >
                <input seInput name="approvalRequestId" [(ngModel)]="approvalRequestId" />
              </se-field>
            }
          }
          @if (formError()) {
            <p role="alert">{{ formError() }}</p>
          }
        </form>
        <ng-container seDrawerFooter>
          <button seButton type="button" (click)="editing.set(false)">Cancel</button>
          <button
            seButton
            variant="primary"
            type="button"
            [loading]="saving()"
            (click)="submitCount()"
          >
            Save stock count
          </button>
        </ng-container>
      </se-drawer>
    </se-page>
  `,
})
export class InventoryCountsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly access = inject(AccessService);
  private readonly toast = inject(SeToastService);

  readonly canWrite = computed(() => this.access.can('inventory', 'full'));
  readonly counts = signal<AdminStockCount[]>([]);
  readonly summary = signal<Array<{
    itemType: string;
    itemId: string;
    currentQuantity: number;
  }>>([]);
  readonly catalogItems = signal<InventoryRow[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly formError = signal('');
  readonly editing = signal(false);
  readonly itemKey = signal('');
  readonly catalogError = signal('');
  countedQuantity: number | null = null;
  approvalRequestId = '';

  readonly items = computed<InventoryRow[]>(() => {
    const balances = new Map(
      this.summary().map((row) => [`${row.itemType}:${row.itemId}`, row.currentQuantity]),
    );
    const items = new Map<string, InventoryRow>();
    for (const item of this.catalogItems()) {
      const key = `${item.itemType}:${item.itemId}`;
      items.set(key, { ...item, currentQuantity: balances.get(key) ?? 0 });
    }
    for (const row of this.summary()) {
      if (row.itemType !== 'variant' && row.itemType !== 'material') continue;
      const key = `${row.itemType}:${row.itemId}`;
      if (!items.has(key)) {
        items.set(key, {
          itemType: row.itemType,
          itemId: row.itemId,
          currentQuantity: row.currentQuantity,
          label: row.itemId.slice(0, 8).toUpperCase(),
        });
      }
    }
    return [...items.values()];
  });
  readonly selectedItem = computed(
    () => this.items().find((item) => `${item.itemType}:${item.itemId}` === this.itemKey()) ?? null,
  );

  readonly columns: SeColumn<AdminStockCount>[] = [
    { key: 'id', header: 'Count', value: (row) => row.id.slice(0, 8).toUpperCase() },
    { key: 'countedAt', header: 'Recorded', sortable: true, value: (row) => row.createdAt },
    { key: 'items', header: 'Items counted', numeric: true, value: (row) => row.lines.length },
    { key: 'difference', header: 'Net adjustment', numeric: true, value: (row) => this.difference(row) },
  ];

  ngOnInit(): void {
    this.load();
    this.api.products().subscribe({
      next: (res) => {
        const catalog = this.catalogItems().filter((item) => item.itemType !== 'variant');
        for (const product of res.data) {
          const variants = product['variants'];
          if (!Array.isArray(variants)) continue;
          for (const variant of variants) {
            if (
              typeof variant === 'object' &&
              variant !== null &&
              'id' in variant &&
              typeof variant.id === 'string' &&
              'sku' in variant &&
              typeof variant.sku === 'string'
            ) {
              catalog.push({
                itemType: 'variant',
                itemId: variant.id,
                currentQuantity: 0,
                label: variant.sku,
              });
            }
          }
        }
        this.catalogItems.set(catalog);
      },
      error: () => this.catalogError.set('Product names could not be loaded; item IDs are shown.'),
    });
    if (this.access.can('raw_materials', 'view')) {
      this.api.materials().subscribe({
        next: (materials) => {
          const catalog = this.catalogItems().filter((item) => item.itemType !== 'material');
          for (const material of materials) {
            if (
              typeof material['id'] === 'string' &&
              typeof material['name'] === 'string'
            ) {
              catalog.push({
                itemType: 'material',
                itemId: material['id'],
                currentQuantity: 0,
                label: material['name'],
              });
            }
          }
          this.catalogItems.set(catalog);
        },
        error: () =>
          this.catalogError.set('Material names could not be loaded; item IDs are shown.'),
      });
    }
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.inventorySummary().subscribe({
      next: (res) => this.summary.set(res),
      error: () => this.error.set('Inventory could not be loaded for stock counts.'),
    });
    this.api.inventoryCounts().subscribe({
      next: (res) => {
        this.counts.set(res.data);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Stock count history could not be loaded.');
        this.loading.set(false);
      },
    });
  }

  difference(count: AdminStockCount): number {
    return count.lines.reduce((sum, line) => sum + line.adjustmentQuantity, 0);
  }

  openCount(): void {
    this.itemKey.set('');
    this.countedQuantity = null;
    this.approvalRequestId = '';
    this.formError.set('');
    this.editing.set(true);
  }

  submitCount(): void {
    const item = this.selectedItem();
    if (!item) {
      this.formError.set('Choose an inventory item.');
      return;
    }
    if (
      this.countedQuantity === null ||
      !Number.isInteger(Number(this.countedQuantity)) ||
      Number(this.countedQuantity) < 0
    ) {
      this.formError.set('Enter a non-negative whole number.');
      return;
    }
    if (Number(this.countedQuantity) < item.currentQuantity && !this.approvalRequestId.trim()) {
      this.formError.set('A stock-disposal approval ID is required to decrease stock.');
      return;
    }
    this.formError.set('');
    this.saving.set(true);
    this.api
      .recordInventoryCount([
        {
          itemType: item.itemType,
          itemId: item.itemId,
          countedQuantity: Number(this.countedQuantity),
          approvalRequestId: this.approvalRequestId.trim() || undefined,
        },
      ])
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.editing.set(false);
          this.toast.show('Stock count recorded');
          this.load();
        },
        error: (error) => {
          this.saving.set(false);
          this.formError.set(
            error?.error?.message ?? 'Stock count could not be recorded. Check approval and retry.',
          );
        },
      });
  }
}
