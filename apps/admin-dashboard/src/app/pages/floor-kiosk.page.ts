import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  SeActivityComponent,
  SeActivityEntry,
  SeBannerComponent,
  SeButtonDirective,
  SeCardComponent,
  SeConfirmService,
  SeDrawerComponent,
  SeEmptyStateComponent,
  SeFieldComponent,
  SeInputDirective,
  SeKvDirective,
  SeKvItemComponent,
  SeMetricCardComponent,
  SePageComponent,
  SeSkeletonComponent,
  SeStatusComponent,
  SeToastService,
} from '@seentair/ui';
import { AccessService } from '../access.service';
import { ApiService, Batch } from '../api.service';
import { QcRejectDrawer, ReadingDrawer } from './production-drawers';
import { batchRef, moveCopy, nextStage, num, stageLabel, units } from './production-format';

type Row = Record<string, unknown>;

/**
 * The factory-floor screen, used standing up on a tablet: choose the batch at
 * this station, then move it on, report a defect, log a scan or take a machine
 * reading. Each job is one large button; the forms open in a drawer.
 */
@Component({
  selector: 'app-floor-kiosk',
  imports: [
    FormsModule,
    QcRejectDrawer,
    ReadingDrawer,
    SeActivityComponent,
    SeBannerComponent,
    SeButtonDirective,
    SeCardComponent,
    SeDrawerComponent,
    SeEmptyStateComponent,
    SeFieldComponent,
    SeInputDirective,
    SeKvDirective,
    SeKvItemComponent,
    SeMetricCardComponent,
    SePageComponent,
    SeSkeletonComponent,
    SeStatusComponent,
  ],
  // The system has no large-tile layout: a grid of tall buttons for gloved, standing use.
  styles: [
    `
      .kiosk-actions {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(calc(var(--se-space-16) * 3), 1fr));
        gap: var(--se-space-4);
        margin-block: var(--se-space-6);
      }
      .kiosk-actions button {
        min-height: calc(var(--se-space-16) * 1.5);
        font: var(--se-type-subheading);
        border-radius: var(--se-radius-lg);
      }
    `,
  ],
  template: `
    <se-page title="Floor kiosk">
      @if (selected(); as b) {
        <se-status sePageStatus kind="production" [value]="b.stage" />
      }

      @if (loading()) {
        <div aria-busy="true"><se-skeleton shape="form" [rows]="3" /></div>
      } @else if (error()) {
        <se-banner
          tone="danger"
          title="Batches could not be loaded"
          actionLabel="Try again"
          (action)="load()"
        >
          {{ error() }}
        </se-banner>
      } @else if (batches().length === 0) {
        <se-empty-state
          heading="No batches yet"
          text="A batch appears here once it is started in Production."
        />
      } @else {
        <se-field label="Batch at this station">
          <select seInput [ngModel]="selectedId()" (ngModelChange)="pick($event)">
            @for (b of choices(); track b.id) {
              <option [value]="b.id">
                {{ ref(b.id) }}: {{ b.variant.sku }}, {{ count(b.quantity) }}
              </option>
            }
          </select>
        </se-field>

        @if (selected(); as b) {
          @if (canWrite()) {
            <div class="kiosk-actions">
              @if (next(); as n) {
                <button seButton variant="primary" type="button" (click)="advance()">
                  Move to {{ label(n) }}
                </button>
              }
              <button seButton type="button" (click)="rejecting.set(true)">Report defect</button>
              <button seButton type="button" (click)="openScan()">Log scan</button>
              <button seButton type="button" (click)="reading.set(true)">
                Record machine reading
              </button>
              <button seButton type="button" (click)="openLabel()">Register label</button>
            </div>
          }

          <div class="se-metric-grid">
            <se-metric-card label="Units in batch" [value]="b.quantity" [hint]="b.variant.sku" />
            <se-metric-card label="Units scanned" [value]="unitsScanned()" [hint]="scanHint()" />
            <se-metric-card label="Units rejected" [value]="rejected()" goodDirection="down" />
            <se-metric-card label="Stage" [value]="stageOf()" [hint]="label(b.stage)" />
          </div>

          <div class="se-detail">
            <div class="se-detail__main">
              <se-card title="Latest machine reading">
                @if (latest(); as t) {
                  <dl seKv>
                    <div seKvItem label="Machine">{{ t['machine'] || '–' }}</div>
                    <div seKvItem label="Speed (rpm)" numeric>{{ t['rpm'] ?? '–' }}</div>
                    <div seKvItem label="Needle cycles" numeric>{{ t['needleCycles'] ?? '–' }}</div>
                    <div seKvItem label="Thread left (%)" numeric>
                      {{ t['threadReservePct'] ?? '–' }}
                    </div>
                  </dl>
                } @else {
                  <p>No reading taken for this batch yet.</p>
                }
              </se-card>
            </div>
            <aside class="se-detail__aside">
              <se-card title="Label">
                <dl seKv>
                  <div seKvItem label="Barcode">{{ barcode() || 'Not registered' }}</div>
                </dl>
              </se-card>
              <se-card title="Recent floor activity">
                <se-activity [entries]="feed()" emptyText="Nothing recorded on the floor yet." />
              </se-card>
            </aside>
          </div>

          <app-qc-reject-drawer [batch]="b" [(open)]="rejecting" (saved)="loadBatch(b.id)" />
          <app-reading-drawer
            [batch]="b"
            [stages]="stages()"
            [(open)]="reading"
            (saved)="loadBatch(b.id)"
          />
          <se-drawer title="Log scan" [(open)]="scanning">
            <div class="se-form">
              <se-field
                label="Checkpoint"
                hint="Where the batch was scanned, for example cutting out"
                [error]="scanError()"
              >
                <input seInput [(ngModel)]="ns.eventType" />
              </se-field>
              <se-field
                label="Units scanned"
                optional
                [hint]="'Leave empty for the whole batch, ' + count(b.quantity)"
              >
                <input
                  seInput
                  type="number"
                  min="1"
                  inputmode="numeric"
                  [(ngModel)]="ns.scannedQty"
                />
              </se-field>
            </div>
            <ng-container seDrawerFooter>
              <button seButton type="button" (click)="scanning.set(false)">Cancel</button>
              <button
                seButton
                variant="primary"
                type="button"
                [loading]="saving()"
                (click)="logScan(b)"
              >
                Log scan
              </button>
            </ng-container>
          </se-drawer>
          <se-drawer title="Register label" [(open)]="labelling">
            <div class="se-form">
              <se-field
                label="Barcode"
                hint="Scan or type the code printed on the batch label"
                [error]="labelError()"
              >
                <input seInput [(ngModel)]="barcodeInput" />
              </se-field>
            </div>
            <ng-container seDrawerFooter>
              <button seButton type="button" (click)="labelling.set(false)">Cancel</button>
              <button
                seButton
                variant="primary"
                type="button"
                [loading]="saving()"
                (click)="registerLabel(b)"
              >
                Register label
              </button>
            </ng-container>
          </se-drawer>
        }
      }
    </se-page>
  `,
})
export class FloorKioskPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly access = inject(AccessService);
  private readonly confirm = inject(SeConfirmService);
  private readonly toast = inject(SeToastService);

  /** Every job on this screen writes to a batch, which needs full access to manufacturing. */
  readonly canWrite = computed(() => this.access.can('manufacturing', 'full'));
  readonly ref = batchRef;
  readonly label = stageLabel;
  readonly count = units;

  readonly stages = signal<string[]>([]);
  readonly batches = signal<Batch[]>([]);
  readonly selectedId = signal('');
  readonly loading = signal(true);
  readonly error = signal('');
  readonly rejected = signal(0);
  readonly scans = signal<Row[]>([]);
  readonly readings = signal<Row[]>([]);
  readonly barcode = signal('');
  readonly feed = signal<SeActivityEntry[]>([]);

  readonly selected = computed(
    () => this.batches().find((b) => b.id === this.selectedId()) ?? null,
  );
  /** Batches still being made come first; finished ones stay choosable below them. */
  readonly choices = computed(() => {
    const last = this.stages()[this.stages().length - 1];
    return [...this.batches()].sort((a, b) => Number(a.stage === last) - Number(b.stage === last));
  });
  readonly next = computed(() => {
    const b = this.selected();
    return b ? nextStage(this.stages(), b.stage) : null;
  });
  readonly stageOf = computed(() => {
    const b = this.selected();
    return b ? `${this.stages().indexOf(b.stage) + 1} of ${this.stages().length}` : '';
  });
  readonly unitsScanned = computed(() =>
    this.scans().reduce((s, x) => s + Number(x['scannedQty'] ?? 1), 0),
  );
  readonly scanHint = computed(() => {
    const n = this.scans().length;
    return `${n} ${n === 1 ? 'scan' : 'scans'} logged`;
  });
  readonly latest = computed(() => this.readings()[this.readings().length - 1] ?? null);

  readonly rejecting = signal(false);
  readonly reading = signal(false);
  readonly scanning = signal(false);
  readonly labelling = signal(false);
  readonly saving = signal(false);
  readonly scanError = signal('');
  readonly labelError = signal('');
  ns = { eventType: '', scannedQty: null as number | null };
  barcodeInput = '';

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.batches().subscribe({
      next: (res) => {
        this.stages.set(res.stages);
        this.batches.set(res.data);
        this.loading.set(false);
        this.error.set('');
        if (!this.selected()) this.selectedId.set(this.choices()[0]?.id ?? '');
        if (this.selectedId()) this.loadBatch(this.selectedId());
      },
      error: (err) => {
        this.loading.set(false);
        if (this.batches().length === 0) {
          this.error.set(
            err?.error?.message ?? 'The server did not respond. Nothing has been changed.',
          );
        }
      },
    });
    this.api.auditLog({ limit: 30 }).subscribe({
      next: (res) =>
        this.feed.set(
          res.data
            .filter((e) => /batch|production|qc/i.test(e.action))
            .slice(0, 6)
            .map((e) => ({ at: e.timestamp, text: e.action.replace(/[._]/g, ' ') })),
        ),
      error: () => undefined,
    });
  }

  pick(id: string): void {
    this.selectedId.set(id);
    this.rejected.set(0);
    this.scans.set([]);
    this.readings.set([]);
    this.barcode.set('');
    this.loadBatch(id);
  }

  /** Reads what is recorded against the chosen batch: rejects, scans, readings and its label. */
  loadBatch(id: string): void {
    this.api.qcRejections(id).subscribe({
      next: (r) => this.rejected.set((r ?? []).reduce((s, x) => s + num(x['quantity']), 0)),
      error: () => undefined,
    });
    this.api
      .batchScans(id)
      .subscribe({ next: (r) => this.scans.set(r ?? []), error: () => undefined });
    this.api
      .batchTelemetry(id)
      .subscribe({ next: (r) => this.readings.set(r ?? []), error: () => undefined });
    this.api.batch(id).subscribe({
      next: (b) => this.barcode.set(b?.['barcode'] ? String(b['barcode']) : ''),
      error: () => undefined,
    });
  }

  async advance(): Promise<void> {
    const b = this.selected();
    const next = this.next();
    if (!b || !next) return;
    if (!(await this.confirm.ask(moveCopy(b, next, this.stages())))) return;
    this.api.moveBatch(b.id, next).subscribe({
      next: () => {
        this.toast.show(`Batch ${batchRef(b.id)} moved to ${stageLabel(next)}`);
        this.load();
      },
      error: (err) =>
        this.toast.show(err?.error?.message ?? `Batch ${batchRef(b.id)} could not be moved`, {
          tone: 'danger',
          action: { label: 'Try again', run: () => void this.advance() },
        }),
    });
  }

  openScan(): void {
    this.scanError.set('');
    this.scanning.set(true);
  }

  logScan(b: Batch): void {
    const checkpoint = this.ns.eventType.trim();
    if (!checkpoint) {
      this.scanError.set('Enter the checkpoint the batch was scanned at.');
      return;
    }
    this.saving.set(true);
    this.api
      .recordBatchScan(b.id, {
        eventType: checkpoint,
        scannedQty: this.ns.scannedQty ?? b.quantity,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.scanning.set(false);
          this.ns = { eventType: '', scannedQty: null };
          this.toast.show(`Scan logged at ${checkpoint}`);
          this.loadBatch(b.id);
        },
        error: (err) => {
          this.saving.set(false);
          this.scanError.set(err?.error?.message ?? 'The scan could not be logged.');
        },
      });
  }

  openLabel(): void {
    this.labelError.set('');
    this.barcodeInput = '';
    this.labelling.set(true);
  }

  registerLabel(b: Batch): void {
    const code = this.barcodeInput.trim();
    if (!code) {
      this.labelError.set('Scan or type the barcode on the label.');
      return;
    }
    this.saving.set(true);
    this.api.registerBatchBarcode(b.id, code).subscribe({
      next: () => {
        this.saving.set(false);
        this.labelling.set(false);
        this.barcode.set(code);
        this.toast.show(`Label registered for batch ${batchRef(b.id)}`);
      },
      error: (err) => {
        this.saving.set(false);
        this.labelError.set(err?.error?.message ?? 'The label could not be registered.');
      },
    });
  }
}
