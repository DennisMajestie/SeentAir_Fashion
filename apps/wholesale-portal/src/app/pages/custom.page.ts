import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  SeButtonDirective,
  SeCardComponent,
  SeCellDirective,
  SeColumn,
  SeDrawerComponent,
  SeFieldComponent,
  SeInputDirective,
  SePageComponent,
  SeStatusComponent,
  SeTableComponent,
  SeToastService,
  formatDate,
} from '@seentair/ui';
import { ApiService, CustomOrder, Pricing } from '../api.service';
import { customRef } from '../wholesale-format';

const SIZE_KEYS = ['S', 'M', 'L', 'XL', 'XXL'] as const;

/** The factory gate sequence. Facts about the process, not per-request state. */
const ROADMAP: Array<{ label: string; detail: string }> = [
  {
    label: 'Technical review',
    detail: 'Production engineers validate feasibility against factory capability.',
  },
  {
    label: 'Quotation',
    detail: 'Per-batch quote covering raw material, sewing, branding and packaging.',
  },
  {
    label: 'Payment, 100% upfront',
    detail: 'Full settlement by bank transfer or POS, desk-confirmed, before the sample run.',
  },
  {
    label: 'Approval sample',
    detail: 'You sign off a physical sample before any bulk cutting starts.',
  },
  {
    label: 'Full batch production',
    detail: 'Cutting, sewing, finishing, QC and dispatch from the Aba factory.',
  },
];

type FieldKey = 'fabricQuality' | 'colours' | 'description' | 'location' | 'desiredDate' | 'sizes';

/**
 * Custom design requests: the buyer's requests as a table, and the request
 * form in a drawer. The request body is unchanged: sizes are serialised from
 * the size grid plus a free note, quantity is their sum.
 */
@Component({
  selector: 'app-custom',
  imports: [
    FormsModule,
    SeButtonDirective,
    SeCardComponent,
    SeCellDirective,
    SeDrawerComponent,
    SeFieldComponent,
    SeInputDirective,
    SePageComponent,
    SeStatusComponent,
    SeTableComponent,
  ],
  template: `
    <se-page
      title="Custom designs"
      description="Bespoke silhouettes and finishes for commercial batches. Every request is reviewed and quoted by the factory; full payment is due upfront once you accept the quote, and custom orders are excluded from the 12-hour returns window."
    >
      <button seButton variant="primary" sePageActions type="button" (click)="openForm()">
        New request
      </button>

      <se-card title="Your requests" flush>
        <se-table
          caption="Custom design requests"
          [columns]="columns"
          [rows]="requests()"
          [rowId]="rowId"
          [loading]="loading()"
          [error]="error()"
          (retry)="load()"
          activatable
          (rowActivate)="open($event)"
          hideDensity
          emptyHeading="No custom requests yet"
          emptyText="Describe the garment you need and the factory will review and quote it."
          emptyActionLabel="New request"
          (emptyAction)="openForm()"
        >
          <ng-template seCell="status" let-row>
            <se-status kind="custom_order" [value]="row.status" />
          </ng-template>
        </se-table>
      </se-card>

      <se-card title="How a custom batch moves">
        <ol class="roadmap">
          @for (stage of roadmap; track stage.label) {
            <li>
              <strong>{{ stage.label }}</strong>
              <span>{{ stage.detail }}</span>
            </li>
          }
        </ol>
      </se-card>
    </se-page>

    <se-drawer title="New custom design request" [(open)]="formOpen">
      <form class="se-form" id="custom-request-form" (ngSubmit)="submit()" novalidate>
        <div class="se-form__section">
          <se-field label="Fabric weight / quality" [error]="errors()['fabricQuality']">
            <input
              seInput
              [(ngModel)]="form.fabricQuality"
              name="fabricQuality"
              placeholder="e.g. 450 GSM heavyweight french terry"
            />
          </se-field>
          <se-field label="Colourways / dye notes" [error]="errors()['colours']">
            <input
              seInput
              [(ngModel)]="form.colours"
              name="colours"
              placeholder="e.g. washed moss, industrial slate, onyx black"
            />
          </se-field>
          <se-field
            label="Design and construction"
            hint="Silhouette, panels, print or embroidery placements, trims, stitch spec. Describe any reference pieces here; techpack upload is not available yet."
            [error]="errors()['description']"
          >
            <textarea seInput [(ngModel)]="form.description" name="description" rows="4"></textarea>
          </se-field>
        </div>

        <div class="se-form__section">
          <se-field label="Units per size" [hint]="moqHint()" [error]="errors()['sizes']" group>
            <div class="sizes">
              @for (size of sizeKeys; track size) {
                <input
                  seInput
                  type="number"
                  min="0"
                  step="1"
                  inputmode="numeric"
                  [ngModel]="qtyOf(size)"
                  (ngModelChange)="setQty(size, $event)"
                  [name]="'size-' + size"
                  [placeholder]="size"
                  [attr.aria-label]="'Units size ' + size"
                />
              }
            </div>
          </se-field>
          <se-field label="Other sizes / grading notes" optional>
            <input
              seInput
              [(ngModel)]="sizeNote"
              name="sizeNote"
              placeholder="e.g. bespoke chest 46in × 4"
            />
          </se-field>
        </div>

        <div class="se-form__section">
          <se-field label="Delivery destination" [error]="errors()['location']">
            <input
              seInput
              [(ngModel)]="form.location"
              name="location"
              placeholder="e.g. Onitsha Commercial Hub, Anambra State"
            />
          </se-field>
          <se-field
            label="Wanted by"
            hint="Guides production scheduling; the factory confirms the final date with your quote."
            [error]="errors()['desiredDate']"
          >
            <input seInput type="date" [(ngModel)]="form.desiredDate" name="desiredDate" />
          </se-field>
        </div>
      </form>
      <ng-container seDrawerFooter>
        <button seButton type="button" (click)="formOpen.set(false)">Cancel</button>
        <button
          seButton
          variant="primary"
          type="submit"
          form="custom-request-form"
          [loading]="busy()"
        >
          Submit for review
        </button>
      </ng-container>
    </se-drawer>
  `,
  styles: [
    `
      .roadmap {
        margin: 0;
        padding-left: var(--se-space-5);
        display: grid;
        gap: var(--se-space-2);
      }
      .roadmap li {
        display: grid;
        gap: var(--se-space-1);
      }
      .sizes {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: var(--se-space-2);
      }
      .roadmap span {
        color: var(--se-color-text-muted);
        font: var(--se-type-caption);
      }
    `,
  ],
})
export class CustomPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly toast = inject(SeToastService);

  readonly requests = signal<CustomOrder[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly pricingData = signal<Pricing | null>(null);
  readonly formOpen = signal(false);
  readonly busy = signal(false);
  readonly errors = signal<Partial<Record<FieldKey, string>>>({});
  readonly sizeKeys = SIZE_KEYS;
  readonly roadmap = ROADMAP;

  /** Size-grid quantities in a signal, so totals recompute from one source. */
  readonly sizeQty = signal<Record<string, number>>({});
  sizeNote = '';

  form = {
    colours: '',
    location: '',
    fabricQuality: '',
    description: '',
    desiredDate: '',
  };

  readonly totalUnits = computed(() =>
    this.sizeKeys.reduce((n, s) => n + (this.sizeQty()[s] ?? 0), 0),
  );

  readonly rowId = (r: CustomOrder) => r.id;
  readonly columns: SeColumn<CustomOrder>[] = [
    { key: 'ref', header: 'Request', value: (r) => customRef(r.id) },
    { key: 'createdAt', header: 'Submitted', format: (v) => formatDate(v as string) },
    { key: 'quantity', header: 'Units', numeric: true },
    { key: 'desiredDate', header: 'Wanted by', format: (v) => formatDate(v as string) },
    { key: 'status', header: 'Status' },
  ];

  ngOnInit(): void {
    this.load();
    // MOQ is a server-owned policy. If this call fails the form still submits
    // and the factory re-checks on commit.
    this.api.pricing().subscribe({
      next: (p) => this.pricingData.set(p),
      error: () => this.pricingData.set(null),
    });
  }

  load(): void {
    this.api.customOrders().subscribe({
      next: (res) => {
        this.requests.set(res.data);
        this.loading.set(false);
        this.error.set('');
      },
      error: (err) => {
        this.loading.set(false);
        if (this.requests().length === 0) {
          this.error.set(err?.error?.message ?? 'The server did not respond.');
        }
      },
    });
  }

  open(request: CustomOrder): void {
    void this.router.navigate(['/custom', request.id]);
  }

  openForm(): void {
    this.errors.set({});
    this.formOpen.set(true);
  }

  /** "12 units requested · 20-unit batch minimum (8 short)", from the API's MOQ. */
  moqHint(): string {
    const units = this.totalUnits();
    const moq = this.pricingData()?.moq ?? 0;
    const requested = `${units} ${units === 1 ? 'unit' : 'units'} requested`;
    if (moq <= 0) return `${requested} · batch minimum confirmed by the desk`;
    const short = Math.max(0, moq - units);
    return `${requested} · ${moq}-unit batch minimum${short > 0 ? ` (${short} short)` : ' met'}`;
  }

  qtyOf(size: string): number {
    return this.sizeQty()[size] ?? 0;
  }

  setQty(size: string, raw: unknown): void {
    const n = Math.max(0, Math.floor(Number(raw) || 0));
    this.sizeQty.update((s) => ({ ...s, [size]: n }));
  }

  /** Serialise the size grid (+ free note) into the API's sizes string. */
  private sizesString(): string {
    const parts = this.sizeKeys
      .filter((s) => this.qtyOf(s) > 0)
      .map((s) => `${s}×${this.qtyOf(s)}`);
    if (this.sizeNote.trim()) parts.push(this.sizeNote.trim());
    return parts.join(', ');
  }

  private validate(): boolean {
    const e: Partial<Record<FieldKey, string>> = {};
    if (!this.form.fabricQuality.trim())
      e.fabricQuality = 'Say what fabric weight or quality you need.';
    if (!this.form.colours.trim()) e.colours = 'List at least one colourway.';
    if (!this.form.description.trim()) e.description = 'Describe the garment and its construction.';
    if (!this.form.location.trim()) e.location = 'Enter the delivery destination.';
    if (!this.form.desiredDate) e.desiredDate = 'Choose the date you want the batch by.';
    if (this.totalUnits() === 0) e.sizes = 'Allocate at least one unit to a size.';
    this.errors.set(e);
    return Object.keys(e).length === 0;
  }

  submit(): void {
    if (!this.validate()) return;
    const sizes = this.sizesString();
    this.busy.set(true);
    this.api.submitCustomOrder({ ...this.form, sizes, quantity: this.totalUnits() }).subscribe({
      next: (created) => {
        this.busy.set(false);
        this.formOpen.set(false);
        this.resetForm();
        this.toast.show(`Request ${customRef(created.id)} submitted for technical review`, {
          action: { label: 'View request', run: () => this.open(created) },
        });
        this.load();
      },
      error: (err) => {
        this.busy.set(false);
        this.toast.show(err?.error?.message ?? 'The request could not be submitted', {
          tone: 'danger',
          action: { label: 'Try again', run: () => this.submit() },
        });
      },
    });
  }

  private resetForm(): void {
    this.form = { colours: '', location: '', fabricQuality: '', description: '', desiredDate: '' };
    this.sizeQty.set({});
    this.sizeNote = '';
    this.errors.set({});
  }
}
