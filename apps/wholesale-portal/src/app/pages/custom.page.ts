import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService, CustomOrder, Pricing } from '../api.service';
import { pill } from '../status-pill';
import { LedgerComponent, StripComponent } from '../ui/primitives';

const SIZE_KEYS = ['S', 'M', 'L', 'XL', 'XXL'] as const;

/** The factory gate sequence. Facts about the process, not per-request state. */
const ROADMAP: Array<{ label: string; detail: string }> = [
  {
    label: 'Technical review',
    detail: 'Production engineers validate feasibility against factory capability.',
  },
  {
    label: 'Quotation & pricing allocation',
    detail: 'Per-batch quote covering raw material, sewing, branding and packaging.',
  },
  {
    label: 'Payment (100% upfront)',
    detail: 'Full settlement: bank transfer or POS, desk-confirmed, before the sample run.',
  },
  {
    label: 'Physical approval sample',
    detail: 'You sign off a strike-off sample before any bulk cutting starts.',
  },
  {
    label: 'Full batch production',
    detail: 'Cutting → sewing → finishing → QC → dispatch from the Aba factory.',
  },
];

/**
 * W9, Request a custom design.
 *
 * Built on the shared primitives: the four numbered steps are strips, the
 * factory roadmap is an ordered list, and the existing requests are a flat
 * hairline list rather than a stack of floating cards.
 */
@Component({
  selector: 'app-custom',
  imports: [CommonModule, FormsModule, RouterLink, StripComponent, LedgerComponent],
  template: `
    <a class="link backlink" routerLink="/">
      <span class="material-symbols-outlined" aria-hidden="true">arrow_back</span>
      Back to wholesale home
    </a>

    <se-strip label="Manufacturing production">
      <h1 class="form-h1">Request a custom design</h1>
      <p class="muted" style="margin: 0 0 var(--space-sm)">
        Bespoke garment silhouettes, cut &amp; sew engineering and custom fabric finishing for
        commercial batch orders.
      </p>
      <p class="policy-line">
        <strong>Production policy &amp; SLA terms.</strong> Custom batch requests are technically
        reviewed and quoted by the factory. Full payment is due upfront once you accept the
        quotation, and a physical sample must be approved before the full batch enters production.
        Custom orders are excluded from the 12-hour returns window.
      </p>
    </se-strip>

    <form (ngSubmit)="submit()" novalidate>
      <se-strip label="01 · Garment specifications" badge="Step 1 of 4">
        <label
          >Fabric weight / quality *
          <input
            [(ngModel)]="form.fabricQuality"
            name="fabricQuality"
            required
            placeholder="e.g. 450 GSM heavyweight french terry"
        /></label>
        <label
          >Colourways / dye notes *
          <input
            [(ngModel)]="form.colours"
            name="colours"
            required
            placeholder="e.g. washed vintage moss, industrial slate, onyx black"
        /></label>
        <label
          >Design &amp; construction description *
          <textarea
            [(ngModel)]="form.description"
            name="description"
            rows="4"
            required
            placeholder="Silhouette, panels, print/embroidery placements, trims, stitch spec…"
          ></textarea>
        </label>
      </se-strip>

      <se-strip label="02 · Techpack & assets" badge="Step 2 of 4">
        <!-- GAP: techpack file upload awaits the S3 asset pipeline on custom
             orders: the dropzone is present but locked, and buyers reference
             assets in the description meanwhile. -->
        <div class="dropzone" aria-disabled="true">
          <div class="dz-icon">
            <span class="material-symbols-outlined" aria-hidden="true">cloud_upload</span>
          </div>
          <div class="dz-title">Upload techpack or CAD sketches</div>
          <p class="dz-sub">PDF, PNG, AI, SVG or CAD vector renders.</p>
          <button
            class="cta small quiet"
            type="button"
            disabled
            title="File upload arrives with the S3 asset pipeline"
          >
            <span class="material-symbols-outlined" aria-hidden="true">lock</span> Browse files
          </button>
          <p class="dz-sub">
            Upload lands with the asset pipeline, for now, describe reference pieces in your design
            description and the desk will request files.
          </p>
        </div>
      </se-strip>

      <se-strip label="03 · Size breakdown & volume" badge="Step 3 of 4">
        <div class="size-grid">
          @for (size of sizeKeys; track size) {
            <div class="sz">
              <span class="s-l">{{ size }}</span>
              <input
                type="number"
                min="0"
                step="1"
                inputmode="numeric"
                [ngModel]="qtyOf(size)"
                (ngModelChange)="setQty(size, $event)"
                [name]="'size-' + size"
                [attr.aria-label]="'Units size ' + size"
              />
            </div>
          }
        </div>
        <label
          >Other sizes / grading notes
          <input [(ngModel)]="sizeNote" name="sizeNote" placeholder="e.g. bespoke chest 46in × 4"
        /></label>

        <!-- MOQ comes from the API, never a literal. 20 is the configured
             default, not a constant this page is entitled to assume. -->
        <se-ledger [rows]="moqRows()" />
      </se-strip>

      <se-strip label="04 · Delivery & logistics" badge="Step 4 of 4">
        <label
          >Delivery destination / consignee hub *
          <input
            [(ngModel)]="form.location"
            name="location"
            required
            placeholder="e.g. Onitsha Commercial Hub, Anambra State"
        /></label>
        <label
          >Target delivery / timeline date *
          <input type="date" [(ngModel)]="form.desiredDate" name="desiredDate" required
        /></label>
        <p class="muted small" style="margin: 0">
          The desired date guides production scheduling, the factory confirms the final SLA with
          your quotation.
        </p>
      </se-strip>

      <se-strip label="Production roadmap" badge="5-stage pipeline">
        <p class="muted small" style="margin: 0 0 var(--space-sm)">
          Every custom batch moves through manufacturer-grade gates before mainline production
          begins.
        </p>
        <ol class="roadmap-list">
          @for (stage of roadmap; track stage.label; let i = $index) {
            <li [class.active]="i === 0">
              <span class="rm-n">{{ i + 1 }}</span>
              <div>
                <span class="rm-t">{{ stage.label }}</span>
                @if (i === 0) {
                  <span class="chip soft">First gate</span>
                }
                <p class="rm-d">{{ stage.detail }}</p>
              </div>
            </li>
          }
        </ol>
      </se-strip>

      <button class="cta" style="width:100%" type="submit" [disabled]="busy()">
        <span class="material-symbols-outlined" aria-hidden="true">engineering</span>
        {{ busy() ? 'Submitting…' : 'Submit for technical review' }}
      </button>
      @if (message()) {
        <p class="success">{{ message() }}</p>
      }
      @if (error()) {
        <p class="error">{{ error() }}</p>
      }
    </form>

    <se-strip label="Your requests" [badge]="requests().length + ' lodged'">
      @if (requests().length === 0) {
        <p class="muted small" style="margin: 0">No custom requests yet.</p>
      } @else {
        <ul class="reqs">
          @for (request of requests(); track request.id) {
            <li>
              <a [routerLink]="['/custom', request.id]">
                <span class="req-id">#CR-{{ request.id.slice(0, 8).toUpperCase() }}</span>
                <span class="req-meta"
                  >{{ request.quantity }} pcs · target {{ request.desiredDate }}</span
                >
                <span class="status {{ pill(request.status) }}">
                  {{ request.status.replaceAll('_', ' ') }}
                </span>
              </a>
              <p class="req-desc muted small">{{ request.description }}</p>
            </li>
          }
        </ul>
      }
    </se-strip>
  `,
})
export class CustomPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  readonly pill = pill;
  readonly requests = signal<CustomOrder[]>([]);
  readonly pricingData = signal<Pricing | null>(null);
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
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

  ngOnInit(): void {
    this.load();
    // MOQ is a server-owned policy. If this call fails the form still submits
    // and the factory re-checks on commit.
    this.api.pricing().subscribe({
      next: (p) => this.pricingData.set(p),
      error: () => this.pricingData.set(null),
    });
  }

  private load(): void {
    this.api.customOrders().subscribe((res) => this.requests.set(res.data));
  }

  moq(): number {
    return this.pricingData()?.moq ?? 0;
  }

  moqKnown(): boolean {
    return this.moq() > 0;
  }

  moqShort(): number {
    if (!this.moqKnown()) return 0;
    return Math.max(0, this.moq() - this.totalUnits());
  }

  moqRows(): Array<{ label: string; value: string; note?: string; total?: boolean }> {
    const units = this.totalUnits();
    if (!this.moqKnown()) {
      return [
        { label: 'Requested units', value: `${units} units` },
        { label: 'Batch minimum', value: 'Being confirmed by the desk', note: 'factory decides' },
      ];
    }
    return [
      { label: 'Requested units', value: `${units} units` },
      {
        label: 'Batch minimum',
        value: `${this.moq()} units`,
        note: this.moqShort() > 0 ? `${this.moqShort()} short` : 'MOQ met',
        total: true,
      },
    ];
  }

  qtyOf(size: string): number {
    return this.sizeQty()[size] ?? 0;
  }

  setQty(size: string, raw: unknown): void {
    const n = Math.max(0, Math.floor(Number(raw) || 0));
    this.sizeQty.update((s) => ({ ...s, [size]: n }));
  }

  /** Serialize the size grid (+ free note) into the API's sizes string. */
  private sizesString(): string {
    const parts = this.sizeKeys
      .filter((s) => this.qtyOf(s) > 0)
      .map((s) => `${s}×${this.qtyOf(s)}`);
    if (this.sizeNote.trim()) parts.push(this.sizeNote.trim());
    return parts.join(', ');
  }

  submit(): void {
    this.error.set(null);
    this.message.set(null);
    const sizes = this.sizesString();
    if (!sizes || this.totalUnits() === 0) {
      this.error.set('Allocate at least one unit in the size breakdown (step 3).');
      return;
    }
    this.busy.set(true);
    this.api.submitCustomOrder({ ...this.form, sizes, quantity: this.totalUnits() }).subscribe({
      next: (created) => {
        this.busy.set(false);
        this.message.set(
          'Request submitted for technical review, you will be notified when it is quoted.',
        );
        this.load();
        void this.router.navigate(['/custom', created.id]);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(err?.error?.message ?? 'Submission failed.');
      },
    });
  }
}
