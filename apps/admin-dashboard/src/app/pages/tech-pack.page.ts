import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  SeBadgeComponent,
  SeCellDirective,
  SeColumn,
  SeFilter,
  SeFilterBarComponent,
  SePageComponent,
  SeStatusComponent,
  SeTableComponent,
} from '@seentair/ui';
import { forkJoin } from 'rxjs';
import { ApiService } from '../api.service';
import { urlFilters } from '../url-filters';
import {
  PACK_STATES,
  PACK_STATE_OPTIONS,
  ProductRow,
  TechPack,
  countOf,
  packState,
  packVariantId,
  revisionNumber,
  variantLabel,
} from './tech-pack-format';

/** One variant and the state of its tech pack. */
export interface TechPackListRow {
  /** The variant's id: a pack is kept per variant, and a variant may not have one yet. */
  id: string;
  sku: string;
  product: string;
  productId: string;
  variant: string;
  state: string;
  revision: number;
}

/**
 * Tech packs, one per variant: the specification the shop floor cuts and sews
 * from.
 *
 * The list finds a variant and shows whether its pack is missing, a draft or
 * approved; the variant's own page (tech-pack/:id) is where the pack is
 * created, edited and approved.
 */
@Component({
  selector: 'app-tech-pack',
  imports: [
    SeBadgeComponent,
    SeCellDirective,
    SeFilterBarComponent,
    SePageComponent,
    SeStatusComponent,
    SeTableComponent,
  ],
  template: `
    <se-page title="Tech packs">
      <se-table
        caption="Tech packs"
        [columns]="columns"
        [rows]="rows()"
        [loading]="loading()"
        [error]="error()"
        (retry)="load()"
        [pageSize]="25"
        activatable
        (rowActivate)="open($event)"
        [emptyHeading]="filtering() ? 'No variants match these filters' : 'No variants yet'"
        [emptyText]="
          filtering()
            ? 'Remove a filter, or clear them all to see every variant.'
            : 'A tech pack belongs to a product variant. Add products in the catalogue first.'
        "
        [emptyActionLabel]="filtering() ? 'Clear all filters' : ''"
        (emptyAction)="clearFilters()"
      >
        <se-filter-bar
          seTableToolbar
          searchLabel="Search tech packs"
          searchPlaceholder="SKU or product"
          [(query)]="query"
          [filters]="filters()"
          [(value)]="filterValue"
          [summary]="summary()"
        />
        <ng-template seCell="state" let-row>
          @if (row.state === 'approved') {
            <se-status kind="approval" value="approved" />
          } @else {
            <se-badge [tone]="row.state === 'draft' ? 'info' : 'neutral'">{{
              stateLabel(row.state)
            }}</se-badge>
          }
        </ng-template>
      </se-table>
    </se-page>
  `,
})
export class TechPackPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  private readonly products = signal<ProductRow[]>([]);
  private readonly packs = signal<TechPack[]>([]);
  /** True only until the first answer arrives; a refresh keeps the rows on screen. */
  readonly loading = signal(true);
  readonly error = signal('');

  // ---- filters: held here, mirrored in the URL so a filtered list can be shared ----
  private readonly urlState = urlFilters(['product', 'status']);
  readonly query = this.urlState.query;
  readonly filterValue = this.urlState.value;
  readonly filters = computed<SeFilter[]>(() => [
    {
      key: 'product',
      label: 'Product',
      options: this.products().map((p) => ({ value: p.id, label: p.name })),
    },
    { key: 'status', label: 'Status', options: PACK_STATE_OPTIONS },
  ]);
  readonly filtering = computed(
    () => !!this.query().trim() || Object.keys(this.filterValue()).length > 0,
  );

  /** Every variant in the catalogue, with the pack that belongs to it when there is one. */
  private readonly all = computed<TechPackListRow[]>(() => {
    const byVariant = new Map(this.packs().map((pack) => [packVariantId(pack), pack]));
    return this.products().flatMap((p) =>
      (p.variants ?? []).map((v) => {
        const pack = byVariant.get(v.id);
        return {
          id: v.id,
          sku: v.sku,
          product: p.name,
          productId: p.id,
          variant: variantLabel(v) || '–',
          state: packState(pack),
          revision: revisionNumber(pack),
        };
      }),
    );
  });

  /** What the table shows: every variant, narrowed by the search and filters. */
  readonly rows = computed(() => {
    const filter = this.filterValue();
    const q = this.query().trim().toLowerCase();
    return this.all().filter((r) => {
      if (filter['product'] && r.productId !== filter['product']) return false;
      if (filter['status'] && r.state !== filter['status']) return false;
      if (!q) return true;
      return r.sku.toLowerCase().includes(q) || r.product.toLowerCase().includes(q);
    });
  });
  readonly summary = computed(() => countOf(this.rows().length, 'variant'));

  readonly columns: SeColumn<TechPackListRow>[] = [
    { key: 'sku', header: 'SKU', sortable: true },
    { key: 'product', header: 'Product', sortable: true },
    { key: 'variant', header: 'Size and colour' },
    { key: 'state', header: 'Status', sortable: true },
    {
      key: 'revision',
      header: 'Revision',
      numeric: true,
      sortable: true,
      format: (v) => ((v as number) > 0 ? String(v) : '–'),
    },
  ];

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    forkJoin([this.api.products(), this.api.techPacks()]).subscribe({
      next: ([products, packs]) => {
        this.products.set(products.data as unknown as ProductRow[]);
        this.packs.set(packs ?? []);
        this.loading.set(false);
        this.error.set('');
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(
          err?.error?.message ?? 'The server did not respond. Nothing has been changed.',
        );
      },
    });
  }

  stateLabel(state: string): string {
    return PACK_STATES[state] ?? state;
  }

  open(row: TechPackListRow): void {
    void this.router.navigate(['/tech-pack', row.id]);
  }

  clearFilters(): void {
    this.query.set('');
    this.filterValue.set({});
  }
}
