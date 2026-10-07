import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  SeBannerComponent,
  SeButtonDirective,
  SeCellDirective,
  SeColumn,
  SeConfirmService,
  SeCurrencyService,
  SeDatePipe,
  SeDrawerComponent,
  SeFieldComponent,
  SeFilter,
  SeFilterBarComponent,
  SeInputDirective,
  SeMetricCardComponent,
  SePageComponent,
  SeRowAction,
  SeStatusComponent,
  SeTableComponent,
  SeToastService,
} from '@seentair/ui';
import { AccessService } from '../access.service';
import { ApiService, Batch } from '../api.service';
import { urlFilters } from '../url-filters';
import { batchRef, moveCopy, nextStage, num, stageLabel, units } from './production-format';

interface ProductOpt {
  id: string;
  name: string;
  variants: Array<{ id: string; sku: string }>;
}

/**
 * Production batches, from Planned through to Completed.
 *
 * The list finds a batch and moves it to its next stage; the batch's own page
 * (production/:id) holds its cost, QC rejects, materials and machine readings.
 * Starting a batch is approval-gated: the API refuses it without an approved
 * request, so the form asks for the approval first.
 */
@Component({
  selector: 'app-production',
  imports: [
    FormsModule,
    SeBannerComponent,
    SeButtonDirective,
    SeCellDirective,
    SeDatePipe,
    SeDrawerComponent,
    SeFieldComponent,
    SeFilterBarComponent,
    SeInputDirective,
    SeMetricCardComponent,
    SePageComponent,
    SeStatusComponent,
    SeTableComponent,
  ],
  template: `
    <se-page title="Production">
      @if (canWrite()) {
        <button seButton variant="primary" sePageActions type="button" (click)="openStart()">
          Start batch
        </button>
      }

      <div class="se-metric-grid">
        <se-metric-card label="Units in production" [value]="activeUnits()" [hint]="activeHint()" />
        <se-metric-card
          label="Units completed"
          [value]="completedUnits()"
          hint="In the latest 100 batches"
        />
        <se-metric-card
          label="Units rejected at QC"
          [value]="rejectedUnits()"
          goodDirection="down"
        />
        <se-metric-card
          label="Rejection rate"
          [value]="rejectionRate()"
          hint="Rejected units out of all units"
        />
      </div>

      @if (partial()) {
        <se-banner
          tone="warning"
          title="Some costs or QC rejects could not be read"
          actionLabel="Try again"
          (action)="load()"
        >
          The batches are listed, but the cost and rejected figures may be incomplete.
        </se-banner>
      }

      <se-table
        caption="Batches"
        [columns]="columns"
        [rows]="rows()"
        [loading]="loading()"
        [error]="error()"
        (retry)="load()"
        [pageSize]="25"
        [actions]="actions()"
        activatable
        (rowActivate)="open($event)"
        [emptyHeading]="filtering() ? 'No batches match these filters' : 'No batches yet'"
        [emptyText]="
          filtering()
            ? 'Remove a filter, or clear them all to see every batch.'
            : 'A batch appears here once its production start is approved and it is started.'
        "
        [emptyActionLabel]="filtering() ? 'Clear all filters' : ''"
        (emptyAction)="clearFilters()"
      >
        <se-filter-bar
          seTableToolbar
          searchLabel="Search batches"
          searchPlaceholder="Batch ref or SKU"
          [(query)]="query"
          [filters]="filters()"
          [(value)]="filterValue"
          [summary]="summary()"
        />
        <ng-template seCell="stage" let-row>
          <se-status kind="production" [value]="row.stage" />
        </ng-template>
        <ng-template seCell="planned" let-row>{{ row.plannedDate | seDate }}</ng-template>
      </se-table>

      @if (canWrite()) {
        <se-drawer title="Start batch" [(open)]="starting">
          <div class="se-form">
            <se-field label="Product variant" [error]="startErrors().variant">
              <select seInput [(ngModel)]="nb.variantId">
                <option value="">Choose a variant</option>
                @for (p of products(); track p.id) {
                  @for (v of p.variants; track v.id) {
                    <option [value]="v.id">{{ p.name }}: {{ v.sku }}</option>
                  }
                }
              </select>
            </se-field>
            <se-field label="Units to make" [error]="startErrors().quantity">
              <input seInput type="number" min="1" inputmode="numeric" [(ngModel)]="nb.quantity" />
            </se-field>
            <se-field label="Planned date" optional>
              <input seInput type="date" [(ngModel)]="nb.plannedDate" />
            </se-field>
            <se-field
              label="Approval reference"
              hint="Filled in when you request approval. Management decides in Approvals."
              [error]="startErrors().approval"
            >
              <input seInput [(ngModel)]="nb.approvalRequestId" />
            </se-field>
            <div>
              <button seButton type="button" [loading]="requesting()" (click)="requestApproval()">
                Request approval
              </button>
            </div>
          </div>
          <ng-container seDrawerFooter>
            <button seButton type="button" (click)="starting.set(false)">Cancel</button>
            <button
              seButton
              variant="primary"
              type="button"
              [loading]="saving()"
              (click)="createBatch()"
            >
              Start batch
            </button>
          </ng-container>
        </se-drawer>
      }
    </se-page>
  `,
})
export class ProductionPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly access = inject(AccessService);
  private readonly confirm = inject(SeConfirmService);
  private readonly toast = inject(SeToastService);
  private readonly currency = inject(SeCurrencyService);

  /** Starting, moving and costing a batch all need full access to manufacturing. */
  readonly canWrite = computed(() => this.access.can('manufacturing', 'full'));

  readonly stages = signal<string[]>([]);
  readonly batches = signal<Batch[]>([]);
  readonly products = signal<ProductOpt[]>([]);
  /** Read back per batch: the recorded total cost and the units rejected at QC. */
  readonly costs = signal<Record<string, number>>({});
  readonly rejected = signal<Record<string, number>>({});
  /** True only until the first answer arrives; a refresh keeps the rows on screen. */
  readonly loading = signal(true);
  readonly error = signal('');
  readonly partial = signal(false);

  // ---- filters, mirrored in the URL ----
  private readonly urlState = urlFilters(['stage']);
  readonly query = this.urlState.query;
  readonly filterValue = this.urlState.value;
  /** The stage filter offers the factory's configured stages, as the API names them. */
  readonly filters = computed<SeFilter[]>(() => [
    {
      key: 'stage',
      label: 'Stage',
      options: this.stages().map((stage) => ({ value: stage, label: stageLabel(stage) })),
    },
  ]);
  readonly filtering = computed(
    () => !!this.query().trim() || Object.keys(this.filterValue()).length > 0,
  );
  readonly rows = computed(() => {
    const stage = this.filterValue()['stage'];
    const q = this.query().trim().toLowerCase().replace(/^#/, '');
    return this.batches().filter(
      (b) =>
        (!stage || b.stage === stage) &&
        (!q || b.id.toLowerCase().includes(q) || b.variant.sku.toLowerCase().includes(q)),
    );
  });
  readonly summary = computed(() => {
    const n = this.rows().length;
    return `${n} ${n === 1 ? 'batch' : 'batches'}`;
  });

  readonly columns: SeColumn<Batch>[] = [
    { key: 'ref', header: 'Batch', value: (b) => batchRef(b.id) },
    { key: 'sku', header: 'SKU', sortable: true, value: (b) => b.variant.sku },
    {
      key: 'stage',
      header: 'Stage',
      sortable: true,
      value: (b) => this.stages().indexOf(b.stage),
    },
    { key: 'units', header: 'Units', numeric: true, sortable: true, value: (b) => b.quantity },
    { key: 'planned', header: 'Planned', sortable: true, value: (b) => b.plannedDate ?? '' },
    {
      key: 'rejected',
      header: 'Rejected',
      numeric: true,
      sortable: true,
      value: (b) => this.rejected()[b.id] ?? 0,
    },
    {
      key: 'cost',
      header: 'Cost',
      numeric: true,
      sortable: true,
      value: (b) => this.costs()[b.id] ?? 0,
      format: (v, b) => (b.id in this.costs() ? this.currency.format(v as number) : 'Not recorded'),
    },
  ];

  /**
   * The move to the next stage, whichever stage that is for the row. Built from
   * the configured stage list (PRODUCTION_STAGES on the API), not from the
   * status mapping: the factory names its own stages.
   */
  readonly actions = computed<SeRowAction<Batch>[]>(() =>
    this.stages().map((stage) => ({
      label: `Move to ${stageLabel(stage)}`,
      hidden: (b) => !this.canWrite() || nextStage(this.stages(), b.stage) !== stage,
      run: (b) => void this.move(b),
    })),
  );

  // ---- start batch ----
  readonly starting = signal(false);
  readonly saving = signal(false);
  readonly requesting = signal(false);
  readonly startErrors = signal({ variant: '', quantity: '', approval: '' });
  nb = { variantId: '', quantity: null as number | null, plannedDate: '', approvalRequestId: '' };

  ngOnInit(): void {
    this.load();
    if (this.canWrite()) {
      this.api.products().subscribe({
        next: (res) => this.products.set(res.data as unknown as ProductOpt[]),
        error: () => undefined,
      });
    }
  }

  load(): void {
    this.partial.set(false);
    this.api.batches().subscribe({
      next: (res) => {
        this.stages.set(res.stages);
        this.batches.set(res.data);
        this.loading.set(false);
        this.error.set('');
        this.readBack(res.data);
      },
      error: (err) => {
        this.loading.set(false);
        // A failed refresh must not wipe a list that is already on screen.
        if (this.batches().length === 0) {
          this.error.set(
            err?.error?.message ?? 'The server did not respond. Nothing has been changed.',
          );
        }
      },
    });
  }

  /** Reads back what was recorded against each batch: its cost and its QC rejects. */
  private readBack(batches: Batch[]): void {
    for (const b of batches) {
      this.api.batchCost(b.id).subscribe({
        next: (c) => {
          if (c) this.costs.update((all) => ({ ...all, [b.id]: num(c['totalCost']) }));
        },
        // 404 means no cost is recorded yet, which is normal. Anything else is
        // a failed read and must not look like "no cost".
        error: (err) => {
          if (err?.status !== 404) this.partial.set(true);
        },
      });
      this.api.qcRejections(b.id).subscribe({
        next: (list) =>
          this.rejected.update((all) => ({
            ...all,
            [b.id]: (list ?? []).reduce((sum, r) => sum + num(r['quantity']), 0),
          })),
        error: () => this.partial.set(true),
      });
    }
  }

  // ---- metrics ----
  private readonly lastStage = computed(() => this.stages()[this.stages().length - 1]);
  private readonly active = computed(() =>
    this.batches().filter((b) => b.stage !== this.lastStage()),
  );
  readonly activeUnits = computed(() => this.active().reduce((s, b) => s + b.quantity, 0));
  readonly activeHint = computed(() => {
    const n = this.active().length;
    return `In ${n} ${n === 1 ? 'batch' : 'batches'}`;
  });
  readonly completedUnits = computed(() =>
    this.batches()
      .filter((b) => b.stage === this.lastStage())
      .reduce((s, b) => s + b.quantity, 0),
  );
  readonly rejectedUnits = computed(() =>
    Object.values(this.rejected()).reduce((s, n) => s + n, 0),
  );
  readonly rejectionRate = computed(() => {
    const total = this.batches().reduce((s, b) => s + b.quantity, 0);
    return `${total > 0 ? (Math.round((this.rejectedUnits() / total) * 1000) / 10).toFixed(1) : '0.0'}%`;
  });

  // ---- actions ----
  open(batch: Batch): void {
    void this.router.navigate(['/production', batch.id]);
  }

  clearFilters(): void {
    this.query.set('');
    this.filterValue.set({});
  }

  async move(batch: Batch): Promise<void> {
    const next = nextStage(this.stages(), batch.stage);
    if (!next) return;
    if (!(await this.confirm.ask(moveCopy(batch, next, this.stages())))) return;
    this.api.moveBatch(batch.id, next).subscribe({
      next: () => {
        this.toast.show(`Batch ${batchRef(batch.id)} moved to ${stageLabel(next)}`);
        this.load();
      },
      error: (err) =>
        this.toast.show(err?.error?.message ?? `Batch ${batchRef(batch.id)} could not be moved`, {
          tone: 'danger',
          action: { label: 'Try again', run: () => void this.move(batch) },
        }),
    });
  }

  openStart(): void {
    this.startErrors.set({ variant: '', quantity: '', approval: '' });
    this.starting.set(true);
  }

  /** Checks the variant and quantity; `needApproval` also requires the reference. */
  private validStart(needApproval: boolean): boolean {
    const q = Number(this.nb.quantity);
    const errors = {
      variant: this.nb.variantId ? '' : 'Choose the variant to make.',
      quantity: Number.isInteger(q) && q >= 1 ? '' : 'Enter a whole number of units, 1 or more.',
      approval:
        needApproval && !this.nb.approvalRequestId.trim()
          ? 'Request approval first. A batch can only start once management has approved it.'
          : '',
    };
    this.startErrors.set(errors);
    return !errors.variant && !errors.quantity && !errors.approval;
  }

  requestApproval(): void {
    if (!this.validStart(false)) return;
    this.requesting.set(true);
    this.api
      .createApproval('production_start', {
        variantId: this.nb.variantId,
        quantity: Number(this.nb.quantity),
      })
      .subscribe({
        next: (r) => {
          this.requesting.set(false);
          this.nb.approvalRequestId = r.id;
          this.toast.show(
            `Approval requested for ${units(Number(this.nb.quantity))}. Management decides in Approvals.`,
          );
        },
        error: (err) => {
          this.requesting.set(false);
          this.startErrors.update((e) => ({
            ...e,
            approval: err?.error?.message ?? 'The approval could not be requested.',
          }));
        },
      });
  }

  createBatch(): void {
    if (!this.validStart(true)) return;
    this.saving.set(true);
    this.api
      .createBatch({
        variantId: this.nb.variantId,
        quantity: Number(this.nb.quantity),
        plannedDate: this.nb.plannedDate || undefined,
        approvalRequestId: this.nb.approvalRequestId.trim(),
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.starting.set(false);
          this.nb = { variantId: '', quantity: null, plannedDate: '', approvalRequestId: '' };
          this.toast.show('Batch started in Planned');
          this.load();
        },
        error: (err) => {
          this.saving.set(false);
          this.startErrors.update((e) => ({
            ...e,
            approval:
              err?.error?.message ??
              'This request is not approved yet. Check Approvals, then try again.',
          }));
        },
      });
  }
}
