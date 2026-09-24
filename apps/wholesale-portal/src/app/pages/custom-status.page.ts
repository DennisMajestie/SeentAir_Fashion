import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService, CustomOrder } from '../api.service';
import { pill } from '../status-pill';

interface Milestone {
  label: string;
  short: string;
}

/**
 * W10 — Custom request status: bespoke-request header, production milestone
 * lifecycle, strike-off sample panel, batch parameters and the consignee
 * sign-off terminal (quote acceptance / sample approval), all wired to the
 * live custom-orders API.
 */
@Component({
  selector: 'app-custom-status',
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <a class="link backlink" routerLink="/custom">
      <span class="material-symbols-outlined" aria-hidden="true">arrow_back</span>
      Back to orders &amp; requests
    </a>

    @if (request(); as req) {
      <div class="cart-strip">
        <span class="left"><span class="chip">Custom bespoke request #CR-{{ req.id.slice(0, 8).toUpperCase() }}</span></span>
        <span class="muted small">Lodged {{ req.createdAt | date: 'dd MMM yyyy' }}</span>
      </div>

      <section class="panel">
        <div class="oc-top">
          <h1 style="font-size: var(--type-heading-md); max-width: 30ch">{{ title(req) }}</h1>
          <span class="status" [class]="'status ' + pill(req.status)">
            {{ req.status.replaceAll('_', ' ') }}</span>
        </div>
        <p class="muted small" style="margin: var(--space-sm) 0 0">{{ req.description }}</p>
        <!-- GAP: attached techpack chip awaits the custom-order asset pipeline -->
        <p class="meta-line muted" style="margin-top: var(--space-sm)">
          <span class="material-symbols-outlined" style="font-size:14px; vertical-align:-2px"
            aria-hidden="true">verified</span>
          Factory-backed contract · full payment before production
        </p>
      </section>

      <div class="lifecycle">
        <div class="lc-head">
          <span>Production milestone lifecycle</span>
          <span class="prog">Stage {{ currentStage() + 1 }} of {{ milestones.length }}</span>
        </div>
        <div class="lc-track">
          @for (m of milestones; track m.label; let idx = $index) {
            <div class="lc-step" [class.done]="idx < currentStage()"
              [class.current]="idx === currentStage()">
              <span class="lc-dot">
                @if (idx < currentStage()) {
                  <span class="material-symbols-outlined" aria-hidden="true">check</span>
                } @else { {{ idx + 1 }} }
              </span>
              <span class="lc-l">{{ m.short }}</span>
              <span class="lc-d">{{ idx === 0 ? (req.createdAt | date: 'dd MMM') : '' }}</span>
            </div>
          }
        </div>
      </div>

      @if (req.reviewNote) {
        <section class="panel">
          <div class="tagbar"><span>Factory review note</span><span>Production desk</span></div>
          <p class="small" style="margin:0">“{{ req.reviewNote }}”</p>
        </section>
      }

      @if (req.status === 'quoted') {
        <div class="section-head">
          <h2>Quotation &amp; pricing</h2>
          <span class="aside">Awaiting your acceptance</span>
        </div>
        <section class="panel">
          @if (quote(); as q) {
            <div class="ledger">
              <div class="lg-row total"><span>Quoted production cost<br />
                <span class="muted" style="font-weight:400; font-size: var(--type-body-sm); text-transform:none; letter-spacing:normal">
                  raw material + sewing + branding + packaging</span></span>
                <span class="v">₦{{ q.amount | number: '1.0-2' }}</span></div>
            </div>
            @if (q.note) { <p class="muted small">{{ q.note }}</p> }
            <button class="cta" style="width:100%" (click)="accept(req.id)">
              <span class="material-symbols-outlined" aria-hidden="true">handshake</span>
              Accept quotation
            </button>
          } @else {
            <button class="cta outline" style="width:100%" (click)="loadQuote(req.id)">View quotation</button>
          }
        </section>
      }

      @if (req.status === 'quote_accepted') {
        <div class="policy-strip">
          <span class="material-symbols-outlined" aria-hidden="true">payments</span>
          <div>
            <strong>Awaiting settlement</strong>
            Full payment (bank transfer / POS) is due now — the desk confirms it, then the
            strike-off sample enters production. No part-payments.
          </div>
        </div>
      }

      <div class="section-head">
        <h2>Manufacturing strike-off sample</h2>
        <span class="aside">{{ sampleStageLabel(req) }}</span>
      </div>
      <section class="panel">
        <p class="small muted" style="margin:0 0 var(--space-sm)">
          The factory produces one physical sample for your verification — seams, prints
          and fabric weight — before any bulk cutting starts.
        </p>
        <!-- GAP: sample photography (multi-angle gallery in the reference) awaits
             the S3 media pipeline on custom orders; the stage copy is live data. -->
        @if (req.status === 'sample_in_production') {
          <div class="moq-banner met" style="margin:0">
            <span class="material-symbols-outlined" aria-hidden="true">precision_manufacturing</span>
            <div>
              <strong>Your sample is in production at the Aba workshop.</strong>
              <span class="sub">Once it reaches you, record your decision in the sign-off
                terminal below — full production only starts after your approval.</span>
            </div>
          </div>
        } @else if (currentStage() >= 4) {
          <p class="small" style="margin:0"><strong>Sample stage passed.</strong></p>
        } @else {
          <p class="small muted" style="margin:0">Sample production begins after quotation
            acceptance and confirmed settlement.</p>
        }
      </section>

      <div class="section-head">
        <h2>Batch parameters</h2>
        <span class="aside">{{ req.quantity }} units total</span>
      </div>
      <section class="panel">
        <div class="scroll-hint" style="margin-top:0"><span>Ratio breakdown</span></div>
        <div class="size-grid" style="margin-bottom: var(--space-md)">
          @for (part of sizeParts(req); track part) {
            <div class="sz" style="padding: var(--space-sm)">
              <span class="s-l" style="margin-bottom:0">{{ part }}</span>
            </div>
          }
        </div>
        <div class="ledger">
          <div class="lg-row"><span>Fabric</span><span class="v">{{ req.fabricQuality }}</span></div>
          <div class="lg-row"><span>Approved colourways</span><span class="v">{{ req.colours }}</span></div>
          <div class="lg-row"><span>Target delivery</span><span class="v">{{ req.desiredDate }}</span></div>
          @if (paidAt(); as when) {
            <div class="lg-row"><span>Settled</span>
              <span class="v">{{ when | date: 'dd MMM yyyy' }} (desk-confirmed)</span></div>
          }
          @if (quote(); as q) {
            <div class="lg-row total"><span>Locked production cost</span>
              <span class="v">₦{{ q.amount | number: '1.0-2' }}</span></div>
          }
        </div>
      </section>

      @if (req.status === 'sample_in_production') {
        <div class="section-head">
          <h2>Consignee sign-off terminal</h2>
          <span class="aside" style="color: var(--primary)">Authorised signatory</span>
        </div>
        <section class="panel">
          <label>Revision notes (optional)
            <textarea [(ngModel)]="note" name="note" rows="3"
              placeholder="Describe required adjustments (e.g. adjust pocket width by 1cm, deepen ribbing tension, tighten wash tone)…"></textarea></label>
          <p class="muted small" style="margin: 0 0 var(--space-sm)">
            Leave blank if approving the strike-off without changes.</p>
          <button class="cta signoff-cta" (click)="decide(req, true)">
            <span><span class="material-symbols-outlined" style="font-size:16px; vertical-align:-3px"
              aria-hidden="true">verified</span>
              Approve sample &amp; authorise bulk production</span>
            <span class="sub">Locks the {{ req.quantity }}-unit cutting schedule</span>
          </button>
          <button class="cta outline" style="width:100%; margin-top: var(--space-sm)"
            (click)="decide(req, false)">
            <span class="material-symbols-outlined" aria-hidden="true">sync_problem</span>
            Request changes / revise sample
          </button>
        </section>
      }
      @if (message()) { <p class="success">{{ message() }}</p> }
      @if (error()) { <p class="error">{{ error() }}</p> }
    } @else if (missing()) {
      <p class="error">Request not found. <a class="link" routerLink="/custom">Back to requests</a></p>
    } @else {
      <p class="muted">Loading request status…</p>
    }
  `,
})
export class CustomStatusPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  readonly pill = pill;
  readonly request = signal<CustomOrder | null>(null);
  readonly quote = signal<{ amount: number; note: string | null } | null>(null);
  readonly missing = signal(false);
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  note = '';

  readonly milestones: Milestone[] = [
    { label: 'Submitted', short: 'Submitted' },
    { label: 'Technical review', short: 'Review' },
    { label: 'Quoted', short: 'Quoted' },
    { label: 'Paid', short: 'Paid' },
    { label: 'Sample', short: 'Sample' },
    { label: 'Production', short: 'Production' },
  ];

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.api.customOrders().subscribe({
      next: (res) => {
        const req = res.data.find((r) => r.id === id) ?? null;
        this.request.set(req);
        this.missing.set(!req);
        if (req && !/pending|submitted|under_review|rejected/.test(req.status)) {
          this.api.quotation(req.id).subscribe({
            next: (q) => this.quote.set(q),
            error: () => undefined,
          });
        }
      },
      error: () => this.missing.set(true),
    });
  }

  title(req: CustomOrder): string {
    const words = req.description.trim().split(/\s+/).slice(0, 6).join(' ');
    return words.toUpperCase() || `CUSTOM REQUEST ${req.id.slice(0, 8).toUpperCase()}`;
  }

  /** Map API status onto the six lifecycle stages. */
  currentStage(): number {
    const s = this.request()?.status ?? '';
    if (/completed|in_production|production_started/.test(s)) return 5;
    if (/sample/.test(s)) return 4;
    if (/paid|quote_accepted/.test(s)) return 3;
    if (/quoted/.test(s)) return 2;
    if (/review/.test(s)) return 1;
    return 0;
  }

  sampleStageLabel(req: CustomOrder): string {
    if (req.status === 'sample_in_production') return 'Awaiting your sign-off';
    return this.currentStage() >= 4 ? 'Stage passed' : 'Upcoming stage';
  }

  sizeParts(req: CustomOrder): string[] {
    return req.sizes.split(/[,|]/).map((p) => p.trim()).filter(Boolean);
  }

  paidAt(): string | null {
    return this.request()?.paidAt ?? null;
  }

  loadQuote(id: string): void {
    this.api.quotation(id).subscribe({
      next: (q) => this.quote.set(q),
      error: (err) => this.error.set(err?.error?.message ?? 'Quotation unavailable.'),
    });
  }

  accept(id: string): void {
    this.error.set(null);
    this.api.acceptQuote(id).subscribe({
      next: () => {
        this.message.set('Quotation accepted — settle the full amount with the desk to start the sample.');
        this.reload(id);
      },
      error: (err) => this.error.set(err?.error?.message ?? 'Could not accept.'),
    });
  }

  decide(req: CustomOrder, approved: boolean): void {
    this.error.set(null);
    this.api.decideSample(req.id, approved, this.note.trim() || undefined).subscribe({
      next: () => {
        this.message.set(
          approved
            ? `Sample approved — the ${req.quantity}-unit batch is authorised for production.`
            : 'Revision requested — the factory will rework the sample.',
        );
        this.reload(req.id);
      },
      error: (err) => this.error.set(err?.error?.message ?? 'Could not record decision.'),
    });
  }

  private reload(id: string): void {
    this.api.customOrders().subscribe((res) => {
      this.request.set(res.data.find((r) => r.id === id) ?? null);
    });
  }
}
