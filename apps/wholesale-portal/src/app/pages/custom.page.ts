import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService, CustomOrder } from '../api.service';
import { pill } from '../status-pill';

const SIZE_KEYS = ['S', 'M', 'L', 'XL', 'XXL'] as const;

/**
 * W9 — Request a custom design: policy/SLA panel, four numbered step cards
 * (garment specifications, techpack & assets, size breakdown & volume,
 * delivery & logistics) and the production roadmap, submitting through the
 * live custom-orders API. Existing requests link to their W10 status pages.
 */
@Component({
  selector: 'app-custom',
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <a class="link backlink" routerLink="/">
      <span class="material-symbols-outlined" aria-hidden="true">arrow_back</span>
      Back to wholesale home
    </a>

    <p class="meta-line muted" style="margin: var(--space-sm) 0 0">
      <span class="material-symbols-outlined" style="font-size:14px; vertical-align:-2px"
        aria-hidden="true">design_services</span>
      Manufacturing production
    </p>
    <h1>Request a custom design</h1>
    <p class="muted" style="margin-top: var(--space-xs)">
      Bespoke garment silhouettes, cut &amp; sew engineering and custom fabric
      finishing for commercial batch orders.
    </p>

    <div class="policy-strip">
      <span class="material-symbols-outlined" aria-hidden="true">gavel</span>
      <div>
        <strong>Production policy &amp; SLA terms</strong>
        Custom batch requests are technically reviewed and quoted by the factory.
        Full payment is due upfront once you accept the quotation, and a physical
        sample must be approved before the full batch enters production.
        Custom orders are excluded from the 12-hour returns window.
      </div>
    </div>

    <form (ngSubmit)="submit()" novalidate>
      <section class="step-card">
        <div class="sc-head">
          <div class="sc-title"><span class="sc-n">01</span><h2>Garment specifications</h2></div>
          <span class="sc-step">Step 1 of 4</span>
        </div>
        <label>Fabric weight / quality *
          <input [(ngModel)]="form.fabricQuality" name="fabricQuality" required
            placeholder="e.g. 450 GSM heavyweight french terry" /></label>
        <label>Colourways / dye notes *
          <input [(ngModel)]="form.colours" name="colours" required
            placeholder="e.g. washed vintage moss, industrial slate, onyx black" /></label>
        <label>Design &amp; construction description *
          <textarea [(ngModel)]="form.description" name="description" rows="4" required
            placeholder="Silhouette, panels, print/embroidery placements, trims, stitch spec…"></textarea></label>
      </section>

      <section class="step-card">
        <div class="sc-head">
          <div class="sc-title"><span class="sc-n">02</span><h2>Techpack &amp; assets</h2></div>
          <span class="sc-step">Step 2 of 4</span>
        </div>
        <!-- GAP: techpack file upload awaits the S3 asset pipeline on custom
             orders — the dropzone is present but locked, and buyers reference
             assets in the description meanwhile. -->
        <div class="dropzone" aria-disabled="true">
          <div class="dz-icon"><span class="material-symbols-outlined" aria-hidden="true">cloud_upload</span></div>
          <div class="dz-title">Upload techpack or CAD sketches</div>
          <p class="dz-sub">PDF, PNG, AI, SVG or CAD vector renders.</p>
          <button class="cta small quiet" type="button" disabled
            title="File upload arrives with the S3 asset pipeline">
            <span class="material-symbols-outlined" aria-hidden="true">lock</span> Browse files
          </button>
          <p class="dz-sub">Upload lands with the asset pipeline — for now, describe
            reference pieces in your design description and the desk will request files.</p>
        </div>
      </section>

      <section class="step-card">
        <div class="sc-head">
          <div class="sc-title"><span class="sc-n">03</span><h2>Size breakdown &amp; volume</h2></div>
          <span class="sc-step">Step 3 of 4</span>
        </div>
        <div class="size-grid" style="margin-top: var(--space-sm)">
          @for (size of sizeKeys; track size) {
            <div class="sz">
              <span class="s-l">{{ size }}</span>
              <input type="number" min="0" [(ngModel)]="sizeQty[size]"
                [name]="'size-' + size" [attr.aria-label]="'Units size ' + size" />
            </div>
          }
        </div>
        <label>Other sizes / grading notes
          <input [(ngModel)]="sizeNote" name="sizeNote" placeholder="e.g. bespoke chest 46in × 4" /></label>
        <div class="cart-strip" style="margin-bottom:0">
          <span class="left"><span class="dot"></span> Committed batch: {{ totalUnits() }} units</span>
          @if (totalUnits() >= 20) { <span class="chip okc">MOQ met (20)</span> }
          @else { <span class="chip accent">Need {{ 20 - totalUnits() }} more</span> }
        </div>
      </section>

      <section class="step-card">
        <div class="sc-head">
          <div class="sc-title"><span class="sc-n">04</span><h2>Delivery &amp; logistics</h2></div>
          <span class="sc-step">Step 4 of 4</span>
        </div>
        <label>Delivery destination / consignee hub *
          <input [(ngModel)]="form.location" name="location" required
            placeholder="e.g. Onitsha Commercial Hub, Anambra State" /></label>
        <label>Target delivery / timeline date *
          <input type="date" [(ngModel)]="form.desiredDate" name="desiredDate" required /></label>
        <p class="muted small" style="margin:0">
          The desired date guides production scheduling — the factory confirms the final
          SLA with your quotation.
        </p>
      </section>

      <section class="roadmap">
        <div class="sc-head" style="margin-bottom:0">
          <div class="sc-title">
            <span class="material-symbols-outlined" style="color: var(--primary)"
              aria-hidden="true">timeline</span>
            <h2>Production roadmap</h2>
          </div>
          <span class="sc-step">5-stage pipeline</span>
        </div>
        <p class="muted small" style="margin: var(--space-sm) 0 0">
          Every custom batch moves through manufacturer-grade gates before mainline
          production begins.
        </p>
        <div class="rm-item active">
          <span class="rm-n">1</span>
          <div style="flex:1">
            <div class="rm-t"><span>Technical review</span><span class="chip soft">First gate</span></div>
            <p class="rm-d">Production engineers validate feasibility against factory capability.</p>
          </div>
        </div>
        <div class="rm-item">
          <span class="rm-n">2</span>
          <div style="flex:1">
            <div class="rm-t"><span>Quotation &amp; pricing allocation</span></div>
            <p class="rm-d">Per-batch quote covering raw material, sewing, branding and packaging.</p>
          </div>
        </div>
        <div class="rm-item">
          <span class="rm-n">3</span>
          <div style="flex:1">
            <div class="rm-t"><span>Payment (100% upfront)</span></div>
            <p class="rm-d">Full settlement — bank transfer or POS, desk-confirmed — before the sample run.</p>
          </div>
        </div>
        <div class="rm-item">
          <span class="rm-n">4</span>
          <div style="flex:1">
            <div class="rm-t"><span>Physical approval sample</span></div>
            <p class="rm-d">You sign off a strike-off sample before any bulk cutting starts.</p>
          </div>
        </div>
        <div class="rm-item">
          <span class="rm-n">5</span>
          <div style="flex:1">
            <div class="rm-t"><span>Full batch production</span></div>
            <p class="rm-d">Cutting → sewing → finishing → QC → dispatch from the Lagos factory.</p>
          </div>
        </div>
      </section>

      <button class="cta" style="width:100%" type="submit" [disabled]="busy()">
        <span class="material-symbols-outlined" aria-hidden="true">engineering</span>
        {{ busy() ? 'Submitting…' : 'Submit for technical review' }}
      </button>
      @if (message()) { <p class="success">{{ message() }}</p> }
      @if (error()) { <p class="error">{{ error() }}</p> }
    </form>

    <div class="section-head">
      <h2>Your requests</h2>
      <span class="aside">{{ requests().length }} lodged</span>
    </div>
    @if (requests().length === 0) {
      <p class="muted small">No custom requests yet.</p>
    }
    @for (request of requests(); track request.id) {
      <a class="ordercard" style="display:block; text-decoration:none" [routerLink]="['/custom', request.id]">
        <div class="oc-top">
          <div>
            <span class="oc-id">#CR-{{ request.id.slice(0, 8).toUpperCase() }}</span>
            <span class="oc-meta">{{ request.quantity }} pcs · target {{ request.desiredDate }}</span>
          </div>
          <span class="status" [class]="'status ' + pill(request.status)">
            {{ request.status.replaceAll('_', ' ') }}</span>
        </div>
        <p class="muted small" style="margin: var(--space-sm) 0 0">{{ request.description }}</p>
      </a>
    }
  `,
})
export class CustomPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  readonly pill = pill;
  readonly requests = signal<CustomOrder[]>([]);
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  readonly sizeKeys = SIZE_KEYS;
  sizeQty: Record<string, number> = {};
  sizeNote = '';

  form = {
    colours: '',
    location: '',
    fabricQuality: '',
    description: '',
    desiredDate: '',
  };

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.api.customOrders().subscribe((res) => this.requests.set(res.data));
  }

  totalUnits(): number {
    return this.sizeKeys.reduce((n, s) => n + (this.sizeQty[s] || 0), 0);
  }

  /** Serialize the size grid (+ free note) into the API's sizes string. */
  private sizesString(): string {
    const parts = this.sizeKeys
      .filter((s) => (this.sizeQty[s] || 0) > 0)
      .map((s) => `${s}×${this.sizeQty[s]}`);
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
    this.api
      .submitCustomOrder({ ...this.form, sizes, quantity: this.totalUnits() })
      .subscribe({
        next: (created) => {
          this.busy.set(false);
          this.message.set('Request submitted for technical review — you will be notified when it is quoted.');
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
