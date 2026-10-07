import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import {
  SeBadgeComponent,
  SeBannerComponent,
  SeButtonDirective,
  SeCardComponent,
  SeCellDirective,
  SeColumn,
  SeConfirmService,
  SeDatePipe,
  SeDrawerComponent,
  SeFieldComponent,
  SeInputDirective,
  SeKvDirective,
  SeKvItemComponent,
  SeMoneyPipe,
  SePageComponent,
  SeSkeletonComponent,
  SeStatusComponent,
  SeTableComponent,
  SeToastService,
} from '@seentair/ui';
import { AccessService } from '../access.service';
import { ApiService } from '../api.service';
import { QcRejectDrawer, ReadingDrawer } from './production-drawers';
import {
  BatchDetail,
  batchRef,
  dispositionLabel,
  dispositionTone,
  moveCopy,
  nextStage,
  num,
  stageLabel,
} from './production-format';

type Row = Record<string, unknown>;
const COST_FIELDS = [
  { key: 'materialCost', label: 'Raw material' },
  { key: 'sewingCost', label: 'Sewing' },
  { key: 'brandingCost', label: 'Branding' },
  { key: 'packagingCost', label: 'Packaging' },
] as const;

/**
 * One production batch: where it is, what it cost, what QC rejected, the
 * materials it used against the plan, and its machine readings.
 */
@Component({
  selector: 'app-production-detail',
  imports: [
    FormsModule,
    QcRejectDrawer,
    ReadingDrawer,
    SeBadgeComponent,
    SeBannerComponent,
    SeButtonDirective,
    SeCardComponent,
    SeCellDirective,
    SeDatePipe,
    SeDrawerComponent,
    SeFieldComponent,
    SeInputDirective,
    SeKvDirective,
    SeKvItemComponent,
    SeMoneyPipe,
    SePageComponent,
    SeSkeletonComponent,
    SeStatusComponent,
    SeTableComponent,
  ],
  template: `
    <se-page [title]="'Batch ' + ref" [breadcrumbs]="crumbs">
      @if (batch(); as b) {
        <se-status sePageStatus kind="production" [value]="b.stage" />
      }
      <!-- One @if, not two: a slot is only matched on the direct root of a block. -->
      @if (batch() && canWrite()) {
        <ng-container sePageActions>
          <button seButton type="button" (click)="costing.set(true)">Record cost</button>
          <button seButton type="button" (click)="rejecting.set(true)">Record QC reject</button>
          @if (next(); as n) {
            <button seButton variant="primary" type="button" (click)="move()">
              Move to {{ label(n) }}
            </button>
          }
        </ng-container>
      }

      @if (loading()) {
        <div class="se-detail" aria-busy="true">
          <div class="se-detail__main">
            <se-card><se-skeleton shape="table" [rows]="3" [columns]="4" /></se-card>
          </div>
          <aside class="se-detail__aside">
            <se-card><se-skeleton shape="detail" [rows]="4" /></se-card>
          </aside>
        </div>
      } @else if (loadError()) {
        <se-banner
          tone="danger"
          title="This batch could not be loaded"
          actionLabel="Try again"
          (action)="load()"
        >
          {{ loadError() }}
        </se-banner>
      } @else if (batch(); as b) {
        <div class="se-detail">
          <div class="se-detail__main">
            <se-card title="QC rejects" flush>
              <se-table
                caption="QC rejects"
                [columns]="rejectColumns"
                [rows]="rejects()"
                [error]="rejectsError()"
                (retry)="loadParts()"
                hideDensity
                emptyHeading="No units rejected"
                emptyText="Units that fail quality check are recorded here with a reason."
              >
                <ng-template seCell="disposition" let-row>
                  <se-badge [tone]="tone(row['disposition'])">{{
                    disposition(row['disposition'])
                  }}</se-badge>
                </ng-template>
                <ng-template seCell="at" let-row>{{
                  row['createdAt'] | seDate: 'datetime'
                }}</ng-template>
              </se-table>
            </se-card>
            <se-card title="Materials, planned against used" flush>
              <se-table
                caption="Materials"
                [columns]="materialColumns"
                [rows]="materials()"
                [error]="materialsError()"
                (retry)="loadParts()"
                hideDensity
                emptyHeading="No materials planned"
                emptyText="This product has no bill of materials yet."
              />
            </se-card>
            <se-card title="Machine readings" flush>
              @if (canWrite()) {
                <button seButton size="sm" seCardActions type="button" (click)="reading.set(true)">
                  Record reading
                </button>
              }
              <se-table
                caption="Machine readings"
                [columns]="readingColumns"
                [rows]="readings()"
                hideDensity
                emptyHeading="No readings yet"
                emptyText="Readings taken on the floor for this batch appear here."
              >
                <ng-template seCell="stage" let-row>
                  <se-status kind="production" [value]="row['stage']" />
                </ng-template>
                <ng-template seCell="at" let-row>{{
                  row['recordedAt'] | seDate: 'datetime'
                }}</ng-template>
              </se-table>
            </se-card>
          </div>
          <aside class="se-detail__aside">
            <se-card title="Details">
              <dl seKv>
                <div seKvItem label="SKU">{{ b.variant.sku }}</div>
                <div seKvItem label="Units" numeric>{{ b.quantity }}</div>
                <div seKvItem label="Rejected" numeric>{{ rejectedUnits() }}</div>
                <div seKvItem label="Planned">{{ b.plannedDate | seDate }}</div>
                <div seKvItem label="Completed">{{ b.completedDate | seDate }}</div>
                <div seKvItem label="Approval">
                  {{ b.approvalRequestId ? refOf(b.approvalRequestId) : '–' }}
                </div>
                <div seKvItem label="Label barcode">{{ b.barcode || '–' }}</div>
              </dl>
            </se-card>
            <se-card title="Cost">
              @if (cost(); as c) {
                <dl seKv>
                  @for (f of costFields; track f.key) {
                    <div seKvItem [label]="f.label" numeric>{{ n(c[f.key]) | seMoney }}</div>
                  }
                  <div seKvItem label="Total" numeric>{{ n(c['totalCost']) | seMoney }}</div>
                  <div seKvItem label="Per unit" numeric>{{ perUnit(b) | seMoney: 2 }}</div>
                </dl>
              } @else {
                <p>No cost recorded yet.</p>
              }
            </se-card>
          </aside>
        </div>

        <app-qc-reject-drawer
          [batch]="b"
          [staff]="staff()"
          [inspectorId]="myId()"
          [(open)]="rejecting"
          (saved)="load()"
        />
        <app-reading-drawer
          [batch]="b"
          [stages]="stages()"
          [operatorId]="myId()"
          [(open)]="reading"
          (saved)="loadParts()"
        />
        <se-drawer title="Record cost" [(open)]="costing">
          <div class="se-form">
            @for (f of costFields; track f.key) {
              <se-field [label]="f.label" [error]="costErrors()[f.key] || ''">
                <input seInput type="number" min="0" inputmode="decimal" [(ngModel)]="nc[f.key]" />
              </se-field>
            }
          </div>
          <ng-container seDrawerFooter>
            <button seButton type="button" (click)="costing.set(false)">Cancel</button>
            <button
              seButton
              variant="primary"
              type="button"
              [loading]="saving()"
              (click)="saveCost()"
            >
              Save cost
            </button>
          </ng-container>
        </se-drawer>
      }
    </se-page>
  `,
})
export class ProductionDetailPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly access = inject(AccessService);
  private readonly confirm = inject(SeConfirmService);
  private readonly toast = inject(SeToastService);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';

  readonly ref = batchRef(this.id);
  readonly crumbs = [{ label: 'Production', link: '/production' }, { label: this.ref }];
  readonly canWrite = computed(() => this.access.can('manufacturing', 'full'));
  readonly label = stageLabel;
  readonly refOf = batchRef;
  readonly n = num;
  readonly disposition = dispositionLabel;
  readonly tone = dispositionTone;
  readonly costFields = COST_FIELDS;

  readonly batch = signal<BatchDetail | null>(null);
  readonly stages = signal<string[]>([]);
  readonly cost = signal<Row | null>(null);
  readonly rejects = signal<Row[]>([]);
  readonly materials = signal<Row[]>([]);
  readonly readings = signal<Row[]>([]);
  readonly staff = signal<Row[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly rejectsError = signal('');
  readonly materialsError = signal('');

  readonly next = computed(() => {
    const b = this.batch();
    return b ? nextStage(this.stages(), b.stage) : null;
  });
  readonly rejectedUnits = computed(() =>
    this.rejects().reduce((s, r) => s + num(r['quantity']), 0),
  );
  /** The signed-in person's user id, to offer them as inspector and operator. */
  readonly myId = computed(() => {
    const email = this.access.me()?.email;
    return String(this.staff().find((u) => u['email'] === email)?.['id'] ?? '');
  });

  readonly rejectColumns: SeColumn<Row>[] = [
    { key: 'at', header: 'Recorded', value: (r) => r['createdAt'] },
    { key: 'quantity', header: 'Units', numeric: true, value: (r) => num(r['quantity']) },
    { key: 'disposition', header: 'Outcome', value: (r) => r['disposition'] },
    { key: 'reason', header: 'Reason', value: (r) => r['reason'] },
  ];
  readonly materialColumns: SeColumn<Row>[] = [
    { key: 'material', header: 'Material', value: (r) => r['materialName'] },
    { key: 'planned', header: 'Planned', numeric: true, value: (r) => num(r['plannedQuantity']) },
    { key: 'used', header: 'Used', numeric: true, value: (r) => num(r['consumedQuantity']) },
    { key: 'variance', header: 'Difference', numeric: true, value: (r) => num(r['variance']) },
  ];
  readonly readingColumns: SeColumn<Row>[] = [
    { key: 'at', header: 'Recorded', value: (r) => r['recordedAt'] },
    { key: 'stage', header: 'Stage', value: (r) => r['stage'] },
    { key: 'machine', header: 'Machine', value: (r) => r['machine'] },
    { key: 'rpm', header: 'Speed (rpm)', numeric: true, value: (r) => r['rpm'] ?? '–' },
    {
      key: 'cycles',
      header: 'Needle cycles',
      numeric: true,
      value: (r) => r['needleCycles'] ?? '–',
    },
    {
      key: 'thread',
      header: 'Thread left (%)',
      numeric: true,
      value: (r) => r['threadReservePct'] ?? '–',
    },
  ];

  readonly rejecting = signal(false);
  readonly reading = signal(false);
  readonly costing = signal(false);
  readonly saving = signal(false);
  readonly costErrors = signal<Record<string, string>>({});
  nc: Record<string, number | null> = {};

  ngOnInit(): void {
    this.load();
    this.api
      .batches()
      .subscribe({ next: (res) => this.stages.set(res.stages), error: () => undefined });
    if (this.canWrite()) {
      // The staff list is only for choosing an inspector; without it the field is left out.
      this.api
        .users()
        .subscribe({ next: (res) => this.staff.set(res.data), error: () => undefined });
    }
  }

  load(): void {
    this.api.batch(this.id).subscribe({
      next: (b) => {
        this.batch.set(b as unknown as BatchDetail);
        this.loading.set(false);
        this.loadError.set('');
      },
      error: (err) => {
        this.loading.set(false);
        if (!this.batch()) {
          this.loadError.set(
            err?.error?.message ?? 'The server did not respond. Nothing has been changed.',
          );
        }
      },
    });
    this.loadParts();
  }

  loadParts(): void {
    const failed = (err: { error?: { message?: string } }): string =>
      err?.error?.message ?? 'The server did not respond.';
    this.api.batchCost(this.id).subscribe({
      next: (c) => {
        this.cost.set(c);
        for (const f of COST_FIELDS) this.nc[f.key] = c ? num(c[f.key]) : null;
      },
      error: () => undefined, // 404: no cost recorded yet
    });
    this.api.qcRejections(this.id).subscribe({
      next: (r) => (this.rejects.set(r ?? []), this.rejectsError.set('')),
      error: (err) => this.rejectsError.set(failed(err)),
    });
    this.api.plannedVsConsumed(this.id).subscribe({
      next: (r) => (this.materials.set((r ?? []) as unknown as Row[]), this.materialsError.set('')),
      error: (err) => this.materialsError.set(failed(err)),
    });
    this.api.batchTelemetry(this.id).subscribe({
      next: (r) => this.readings.set(r ?? []),
      error: () => undefined,
    });
  }

  perUnit(b: BatchDetail): number {
    return b.quantity > 0 ? num(this.cost()?.['totalCost']) / b.quantity : 0;
  }

  async move(): Promise<void> {
    const b = this.batch();
    const next = this.next();
    if (!b || !next) return;
    if (!(await this.confirm.ask(moveCopy(b, next, this.stages())))) return;
    this.api.moveBatch(b.id, next).subscribe({
      next: () => {
        this.toast.show(`Batch ${this.ref} moved to ${stageLabel(next)}`);
        this.load();
      },
      error: (err) =>
        this.toast.show(err?.error?.message ?? `Batch ${this.ref} could not be moved`, {
          tone: 'danger',
          action: { label: 'Try again', run: () => void this.move() },
        }),
    });
  }

  saveCost(): void {
    const errors: Record<string, string> = {};
    for (const f of COST_FIELDS) {
      const v = this.nc[f.key];
      if (v == null || !(Number(v) >= 0)) errors[f.key] = 'Enter an amount, 0 or more.';
    }
    this.costErrors.set(errors);
    if (Object.keys(errors).length > 0) return;
    this.saving.set(true);
    const body = Object.fromEntries(COST_FIELDS.map((f) => [f.key, Number(this.nc[f.key])]));
    this.api.recordBatchCost(this.id, body).subscribe({
      next: () => {
        this.saving.set(false);
        this.costing.set(false);
        this.toast.show(`Cost saved for batch ${this.ref}`);
        this.loadParts();
      },
      error: (err) => {
        this.saving.set(false);
        this.costErrors.set({
          packagingCost: err?.error?.message ?? 'The cost could not be saved. Nothing was changed.',
        });
      },
    });
  }
}
