import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SeDatePipe, SeToastService } from '@seentair/ui';
import { ApiService, CustomOrder, Pricing } from '../api.service';
import { WholesaleTabBar } from '../tab-bar';
import { customRef } from '../wholesale-format';

const SIZE_KEYS = ['S', 'M', 'L', 'XL', 'XXL'] as const;

/** The factory gate sequence. Facts about the process, not per-request state. */
const ROADMAP: Array<{ label: string; detail: string }> = [
  { label: '1. Brief', detail: 'Specs & Ref' },
  { label: '2. Quote', detail: '24hr costing' },
  { label: '3. Sample', detail: 'Fit signoff' },
  { label: '4. Mill Cut', detail: 'Bulk run' },
];

type FieldKey = 'fabricQuality' | 'colours' | 'description' | 'location' | 'desiredDate' | 'sizes';

/**
 * Custom design requests: the buyer's requests as cards, and the request
 * sheet. The request body is unchanged: sizes are serialised from the size
 * grid plus a free note, quantity is their sum.
 */
@Component({
  selector: 'app-custom',
  imports: [FormsModule, RouterLink, SeDatePipe, WholesaleTabBar],
  template: `
    <div class="stitch">
      <div class="bg-canvas text-light-on-surface min-h-screen pb-24 antialiased selection:bg-accent/20">
        <!-- Header -->
        <header class="px-4 pt-4 pb-3 border-b border-border/70 bg-canvas/90 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between">
          <div>
            <h1 class="text-[20px] font-bold text-light-primary tracking-tight">Custom Designs</h1>
            <span class="text-[11px] text-light-secondary font-medium">Bespoke Mill Batches &amp; Technical Tech-Packs</span>
          </div>
          <button type="button" class="new-btn px-3.5 py-1.5 rounded-full bg-accent text-on-accent text-[12px] font-bold flex items-center gap-1 shadow-sm hover:brightness-105 flex-shrink-0" (click)="openForm()">
            <span class="material-symbols-outlined text-[16px]">add</span>
            New Request
          </button>
        </header>

        <!-- Main Content -->
        <main class="px-4 py-4 flex flex-col gap-4 max-w-[390px] mx-auto w-full">
          <!-- Intro & Policy Notice -->
          <section class="bg-light-surface rounded-xl p-4 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.05)] flex flex-col gap-2">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-warning text-[20px]">architecture</span>
              <h2 class="text-[14px] font-bold text-light-primary">Bespoke Manufacturing Protocol</h2>
            </div>
            <p class="text-[12px] text-light-secondary leading-normal">
              All custom patterns and silhouettes are engineered and costed individually by the Aba pattern desk. <strong>Full payment is required upfront</strong> once quotes are accepted. Custom production runs are strictly excluded from standard return windows.
            </p>
          </section>

          <!-- Roadmap: How a Custom Batch Moves -->
          <section class="roadmap bg-canvas-tint/70 rounded-xl p-4 border border-border flex flex-col gap-2.5">
            <span class="text-[11px] font-mono uppercase tracking-wider text-light-secondary font-semibold">How a Custom Batch Moves</span>
            <div class="grid grid-cols-4 gap-1.5 text-center text-[10px]">
              @for (stage of roadmap; track stage.label) {
                <div class="p-2 rounded-lg bg-light-surface border border-border">
                  <span class="font-bold text-light-primary block">{{ stage.label }}</span>
                  <span class="text-light-secondary">{{ stage.detail }}</span>
                </div>
              }
            </div>
          </section>

          @if (loading()) {
            <div aria-busy="true">
              <span class="text-[11px] font-mono text-light-secondary uppercase tracking-wider block mb-2">Loading your requests…</span>
              <div class="bg-light-surface/60 rounded-xl p-3.5 border border-dashed border-border flex gap-3.5 animate-pulse">
                <div class="w-24 h-20 rounded-lg bg-canvas-tint/80 flex-shrink-0"></div>
                <div class="flex-1 flex flex-col justify-between py-1">
                  <div class="space-y-2">
                    <div class="h-3 w-1/3 bg-canvas-tint rounded"></div>
                    <div class="h-4 w-4/5 bg-canvas-tint rounded"></div>
                  </div>
                  <div class="h-5 w-24 bg-canvas-tint rounded-full"></div>
                </div>
              </div>
            </div>
          } @else if (error()) {
            <div class="load-error p-3.5 rounded-xl bg-light-surface border border-danger/30 flex items-center justify-between gap-2">
              <div>
                <h2 class="text-[13px] font-bold text-danger">Your requests could not be loaded</h2>
                <span class="text-[11px] text-light-secondary">{{ error() }}</span>
              </div>
              <button type="button" class="px-3.5 py-1.5 rounded-full bg-accent text-on-accent text-[12px] font-semibold flex-shrink-0" (click)="load()">Try again</button>
            </div>
          } @else if (!requests().length) {
            <div class="empty-state bg-light-surface p-3.5 rounded-xl border border-border flex flex-col items-center gap-1.5 text-center">
              <span class="material-symbols-outlined text-[28px] text-light-secondary">design_services</span>
              <strong class="text-[14px] text-light-primary">No custom requests yet</strong>
              <p class="text-[11px] text-light-secondary">Describe the garment you need and the factory will review and quote it.</p>
              <button type="button" class="mt-1 px-3.5 py-1.5 rounded-full bg-accent text-on-accent text-[12px] font-semibold" (click)="openForm()">New request</button>
            </div>
          } @else {
            <!-- Your Requests List -->
            <section class="flex flex-col gap-3">
              <div class="flex items-center justify-between">
                <h3 class="text-[15px] font-bold text-light-primary">Your Requests ({{ requests().length }})</h3>
                <span class="text-[11px] font-mono text-light-secondary">ACTIVE TICKETS</span>
              </div>

              @for (r of requests(); track r.id) {
                <a [routerLink]="['/custom', r.id]" class="request-card bg-light-surface rounded-xl p-4 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.05)] flex flex-col gap-2.5 active:scale-[0.99] transition-all group">
                  <div class="flex items-center justify-between gap-2">
                    <span class="font-mono font-bold text-[13px] text-light-primary">{{ customRef(r.id) }}</span>
                    <span class="status-pill px-2.5 py-0.5 rounded-full font-semibold text-[11px] whitespace-nowrap" [class]="pillClass(r.status)">{{ statusLabel(r.status) }}</span>
                  </div>

                  <div>
                    <h4 class="text-[14px] font-bold text-light-primary group-hover:text-accent transition-colors">{{ r.description }}</h4>
                    <span class="text-[12px] text-light-secondary">{{ r.fabricQuality }} • {{ r.quantity }} Units</span>
                  </div>

                  <div class="pt-2 border-t border-border flex items-center justify-between text-[11px] text-light-secondary">
                    <span>Wanted by: <strong>{{ r.desiredDate | seDate }}</strong></span>
                    @if (isQuoted(r.status)) {
                      <span class="text-accent font-semibold flex items-center gap-0.5">
                        Review Quote
                        <span class="material-symbols-outlined text-[15px]">arrow_forward</span>
                      </span>
                    } @else {
                      <span class="text-light-primary font-semibold flex items-center gap-0.5">
                        View Details
                        <span class="material-symbols-outlined text-[15px]">arrow_forward</span>
                      </span>
                    }
                  </div>
                </a>
              }
            </section>
          }
        </main>

        <ws-tab-bar />
      </div>
    </div>

    <!-- Request Sheet (Drawer Pattern) -->
    @if (formOpen()) {
      <div class="fixed inset-0 z-50 flex flex-col justify-end">
        <div class="absolute inset-0 bg-black/40" (click)="formOpen.set(false)"></div>
        <div class="sheet relative bg-light-surface rounded-t-[28px] border-t border-border shadow-[0_-12px_40px_rgba(27,25,22,0.18)] max-w-[390px] mx-auto w-full max-h-[92vh] flex flex-col overflow-hidden">
          <!-- Sheet Drag Handle & Header -->
          <div class="pt-3 pb-3 px-5 border-b border-border flex flex-col items-center relative">
            <div class="w-12 h-1.5 rounded-full bg-border mb-3"></div>
            <div class="flex items-center justify-between w-full">
              <div>
                <h2 class="text-[17px] font-bold text-light-primary">New Custom Design Request</h2>
                <span class="text-[11px] text-light-secondary">Aba Mill Technical Desk Pattern Brief</span>
              </div>
              <button type="button" aria-label="Close request form" class="w-8 h-8 rounded-full bg-canvas flex items-center justify-center text-light-secondary hover:text-light-primary" (click)="formOpen.set(false)">
                <span class="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
          </div>

          <!-- Scrollable Form Body -->
          <form id="custom-request-form" class="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4" (ngSubmit)="submit()" novalidate>
            <!-- Fabric Weight / Quality -->
            <label class="flex flex-col gap-1.5">
              <span class="text-[12px] font-semibold text-light-primary">Fabric weight &amp; quality</span>
              <input
                type="text"
                placeholder="e.g. 280 GSM 100% Organic Raw Cotton Twill"
                [(ngModel)]="form.fabricQuality"
                name="fabricQuality"
                class="px-3.5 py-2.5 rounded-md bg-canvas/70 border border-border text-[13px] text-light-primary focus:outline-none focus:border-accent"
              />
              @if (errors()['fabricQuality']; as msg) {
                <span class="field-error text-[11px] text-danger">{{ msg }}</span>
              }
            </label>

            <!-- Colourways & Dye Notes -->
            <label class="flex flex-col gap-1.5">
              <span class="text-[12px] font-semibold text-light-primary">Colourways &amp; dye specifications</span>
              <input
                type="text"
                placeholder="e.g. Pantone 18-0935 TCX (Raw Ochre) + Jet Black"
                [(ngModel)]="form.colours"
                name="colours"
                class="px-3.5 py-2.5 rounded-md bg-canvas/70 border border-border text-[13px] text-light-primary focus:outline-none focus:border-accent"
              />
              @if (errors()['colours']; as msg) {
                <span class="field-error text-[11px] text-danger">{{ msg }}</span>
              }
            </label>

            <!-- Design & Construction -->
            <label class="flex flex-col gap-1.5">
              <div class="flex items-center justify-between">
                <span class="text-[12px] font-semibold text-light-primary">Design &amp; construction tech-notes</span>
                <span class="text-[10px] text-light-secondary">Multiline</span>
              </div>
              <textarea
                rows="3"
                placeholder="Describe silhouette, panels, print, embroidery, trims, stitch type..."
                [(ngModel)]="form.description"
                name="description"
                class="px-3.5 py-2.5 rounded-md bg-canvas/70 border border-border text-[13px] text-light-primary focus:outline-none focus:border-accent resize-none leading-relaxed"
              ></textarea>
              <span class="text-[11px] text-light-secondary">Be specific with seam finishes and hardware placements.</span>
              @if (errors()['description']; as msg) {
                <span class="field-error text-[11px] text-danger">{{ msg }}</span>
              }
            </label>

            <!-- Reference Image Upload Slot -->
            <div class="flex flex-col gap-1.5">
              <span class="text-[12px] font-semibold text-light-primary">Reference sample photo (Optional)</span>
              @if (photoUrl(); as url) {
                <div class="p-3 rounded-xl bg-canvas border border-border flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <div class="w-12 h-12 rounded-lg bg-canvas-tint border border-border flex items-center justify-center flex-shrink-0 relative overflow-hidden">
                      <img [src]="url" alt="Reference image preview" class="w-full h-full object-cover" />
                    </div>
                    <div class="flex flex-col">
                      <span class="text-[12px] font-bold text-light-primary truncate max-w-[170px]">Reference photo</span>
                      <span class="text-[10px] text-light-secondary font-mono">Uploaded &amp; verified</span>
                    </div>
                  </div>
                  <button type="button" aria-label="Remove image" class="text-light-secondary hover:text-danger p-1" (click)="clearPhoto()">
                    <span class="material-symbols-outlined text-[18px]">close</span>
                  </button>
                </div>
              } @else {
                <label class="block">
                  <span class="sr-only">Add a reference photo</span>
                  <div class="p-3 rounded-xl bg-canvas border border-border flex items-center gap-3 cursor-pointer">
                    <div class="w-12 h-12 rounded-lg bg-canvas-tint border border-border flex items-center justify-center flex-shrink-0">
                      <span class="material-symbols-outlined text-[24px] text-accent">image</span>
                    </div>
                    <div class="flex flex-col">
                      <span class="text-[12px] font-bold text-light-primary">Add a reference photo</span>
                      <span class="text-[10px] text-light-secondary font-mono">JPG, PNG or WebP • up to 5 MB</span>
                    </div>
                  </div>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    class="sr-only"
                    (change)="pickPhoto($event)"
                  />
                </label>
              }
              @if (photoUploading()) {
                <p class="photo-note text-[11px] text-light-secondary">Uploading photo…</p>
              }
              @if (photoError(); as msg) {
                <p class="photo-error field-error text-[11px] text-danger" role="alert">{{ msg }}</p>
              }
              <span class="text-[10px] text-light-secondary">Supports JPG, PNG, WebP up to 5 MB.</span>
            </div>

            <!-- Units Per Size Grid -->
            <div class="flex flex-col gap-1.5">
              <div class="flex items-center justify-between">
                <span class="text-[12px] font-semibold text-light-primary">Units per size breakdown</span>
                <span class="moq-chip text-[11px] text-warning font-mono font-semibold">{{ moqChip() }}</span>
              </div>
              <div class="grid grid-cols-5 gap-1.5 text-center">
                @for (size of sizeKeys; track size) {
                  <div class="p-2 rounded-lg bg-canvas border border-border">
                    <span class="text-[10px] font-bold text-light-secondary block">{{ size }}</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      inputmode="numeric"
                      [ngModel]="qtyOf(size)"
                      (ngModelChange)="setQty(size, $event)"
                      [name]="'size-' + size"
                      class="w-full text-center font-mono font-bold text-[12px] bg-light-surface border border-border rounded py-0.5 mt-1"
                      [attr.aria-label]="'Units size ' + size"
                    />
                  </div>
                }
              </div>
              <label class="flex flex-col gap-1">
                <span class="text-[12px] font-semibold text-light-primary">Other sizes / grading notes <span class="text-[10px] text-light-secondary font-normal">(optional)</span></span>
                <input
                  type="text"
                  placeholder="e.g. bespoke chest 46in × 4"
                  [(ngModel)]="sizeNote"
                  name="sizeNote"
                  class="px-3.5 py-2.5 rounded-md bg-canvas/70 border border-border text-[13px] text-light-primary focus:outline-none focus:border-accent"
                />
              </label>
              <div class="flex justify-between items-center text-[11px] pt-1">
                <span class="text-light-secondary">Total Requested Units:</span>
                @if (totalUnits() === 0) {
                  <span class="font-mono font-bold text-light-secondary">0 Units</span>
                } @else if (!moqKnown()) {
                  <span class="font-mono font-bold text-light-primary">{{ totalUnits() }} Units</span>
                } @else if (moqShort() > 0) {
                  <span class="font-mono font-bold text-warning">{{ totalUnits() }} Units ({{ moqShort() }} short of MOQ)</span>
                } @else {
                  <span class="font-mono font-bold text-success">{{ totalUnits() }} Units (Meets MOQ)</span>
                }
              </div>
              @if (errors()['sizes']; as msg) {
                <span class="field-error text-[11px] text-danger">{{ msg }}</span>
              }
            </div>

            <!-- Destination & Wanted By Date -->
            <div class="grid grid-cols-2 gap-2.5">
              <label class="flex flex-col gap-1">
                <span class="text-[12px] font-semibold text-light-primary">Delivery Hub</span>
                <input
                  type="text"
                  placeholder="e.g. Lagos Central Hub"
                  [(ngModel)]="form.location"
                  name="location"
                  class="px-3 py-2 rounded-md bg-canvas/70 border border-border text-[12px] text-light-primary focus:outline-none focus:border-accent"
                />
                @if (errors()['location']; as msg) {
                  <span class="field-error text-[11px] text-danger">{{ msg }}</span>
                }
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-[12px] font-semibold text-light-primary">Wanted by date</span>
                <input
                  type="date"
                  [(ngModel)]="form.desiredDate"
                  name="desiredDate"
                  class="px-3 py-2 rounded-md bg-canvas/70 border border-border text-[12px] text-light-primary focus:outline-none focus:border-accent"
                />
                @if (errors()['desiredDate']; as msg) {
                  <span class="field-error text-[11px] text-danger">{{ msg }}</span>
                }
              </label>
            </div>

            <!-- Policy Reminder -->
            <div class="p-3 rounded-lg bg-canvas-tint/70 border border-border text-[11px] text-light-secondary leading-normal">
              Aba pattern room quotes within 24 working hours. Sampling commences upon 100% upfront quote acceptance.
            </div>
          </form>

          <!-- Sheet Footer Actions -->
          <div class="p-4 bg-light-surface border-t border-border flex items-center gap-3">
            <button type="button" class="w-1/3 py-3 rounded-full bg-canvas border border-border text-light-secondary font-semibold text-[13px] hover:bg-canvas-tint" (click)="formOpen.set(false)">
              Cancel
            </button>
            <button
              type="submit"
              form="custom-request-form"
              [disabled]="busy()"
              class="flex-1 py-3.5 rounded-full bg-accent text-on-accent font-semibold text-[14px] flex items-center justify-center gap-2 shadow-sm hover:brightness-105 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              <span>{{ busy() ? 'Submitting…' : 'Submit for Review' }}</span>
              <span class="material-symbols-outlined text-[18px]">send</span>
            </button>
          </div>
        </div>
      </div>
    }
  `,
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
  readonly photoUrl = signal<string | null>(null);
  readonly photoUploading = signal(false);
  readonly photoError = signal('');
  readonly sizeKeys = SIZE_KEYS;
  readonly roadmap = ROADMAP;
  readonly customRef = customRef;

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

  readonly moqKnown = computed(() => (this.pricingData()?.moq ?? 0) > 0);
  readonly moqShort = computed(() =>
    Math.max(0, (this.pricingData()?.moq ?? 0) - this.totalUnits()),
  );

  moqChip(): string {
    const moq = this.pricingData()?.moq ?? 0;
    return moq > 0 ? `Min ${moq}u custom batch` : 'Batch minimum by desk';
  }

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

  qtyOf(size: string): number {
    return this.sizeQty()[size] ?? 0;
  }

  setQty(size: string, raw: unknown): void {
    const n = Math.max(0, Math.floor(Number(raw) || 0));
    this.sizeQty.update((s) => ({ ...s, [size]: n }));
  }

  isQuoted(status: string): boolean {
    return /^quoted$/.test(status.trim().toLowerCase());
  }

  statusLabel(status: string): string {
    const words = status.replaceAll('_', ' ').trim();
    return words ? words[0].toUpperCase() + words.slice(1) : 'Update';
  }

  pillClass(status: string): string {
    const s = status.toLowerCase();
    if (/rejected|cancelled|declined/.test(s)) return '!bg-danger/15 !text-danger';
    if (/quoted|review|pending/.test(s)) return '!bg-warning/15 !text-warning';
    if (/approved|production|sample|shipped|delivered|completed/.test(s)) return '!bg-success/15 !text-success';
    return '';
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

  pickPhoto(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    this.photoError.set('');
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      this.photoError.set('Only JPG, PNG and WebP images are allowed.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.photoError.set('The photo must be 5 MB or smaller.');
      return;
    }
    this.photoUploading.set(true);
    this.api.uploadCustomReferenceImage(file).subscribe({
      next: (res) => {
        this.photoUploading.set(false);
        this.photoUrl.set(res.url);
      },
      error: (err) => {
        this.photoUploading.set(false);
        this.photoError.set(err?.error?.message ?? 'The photo could not be uploaded. Try again.');
      },
    });
  }

  clearPhoto(): void {
    this.photoUrl.set(null);
    this.photoError.set('');
  }

  submit(): void {
    if (this.photoUploading()) {
      this.photoError.set('Wait for the photo to finish uploading first.');
      return;
    }
    if (!this.validate()) return;
    const sizes = this.sizesString();
    const referenceImageUrl = this.photoUrl() ?? undefined;
    this.busy.set(true);
    this.api
      .submitCustomOrder({ ...this.form, sizes, quantity: this.totalUnits(), ...(referenceImageUrl ? { referenceImageUrl } : {}) })
      .subscribe({
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
    this.photoUrl.set(null);
    this.photoUploading.set(false);
    this.photoError.set('');
  }
}
