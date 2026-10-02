import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService, CustomOrder } from '../api.service';
import { pill } from '../status-pill';
import { LedgerComponent, StripComponent } from '../ui/primitives';

interface Milestone {
  label: string;
  short: string;
}

/**
 * W10, Custom request status.
 *
 * A gated production record, not a list: the lifecycle track stays a track and
 * nothing collapses, because at each stage the buyer has exactly one decision
 * to make and the surrounding facts must all be visible when they make it.
 */
@Component({
  selector: 'app-custom-status',
  imports: [CommonModule, FormsModule, RouterLink, StripComponent, LedgerComponent],
  template: `
    <a class="link backlink" routerLink="/custom">
      <span class="material-symbols-outlined" aria-hidden="true">arrow_back</span>
      Back to orders &amp; requests
    </a>

    @if (request(); as req) {
      <se-strip label="Custom bespoke request" [badge]="'#CR-' + code(req)" trailing>
        <span stripTrailing class="status {{ pill(req.status) }}">
          {{ req.status.replaceAll('_', ' ') }}
        </span>
        <h1 class="cs-title">{{ title(req) }}</h1>
        <p class="muted small" style="margin: 0 0 var(--space-sm)">{{ req.description }}</p>
        <!-- GAP: attached techpack chip awaits the custom-order asset pipeline -->
        <p class="policy-line">
          <strong>Factory-backed contract.</strong> Full payment is required before production
          begins. Lodged {{ req.createdAt | date: 'dd MMM yyyy' }}.
        </p>
      </se-strip>

      <div class="lifecycle">
        <div class="lc-head">
          <span>Production milestone lifecycle</span>
          <span class="prog">Stage {{ currentStage() + 1 }} of {{ milestones.length }}</span>
        </div>
        <div class="lc-track">
          @for (m of milestones; track m.label; let idx = $index) {
            <div
              class="lc-step"
              [class.done]="idx < currentStage()"
              [class.current]="idx === currentStage()"
            >
              <span class="lc-dot">
                @if (idx < currentStage()) {
                  <span class="material-symbols-outlined" aria-hidden="true">check</span>
                } @else {
                  {{ idx + 1 }}
                }
              </span>
              <span class="lc-l">{{ m.short }}</span>
              <span class="lc-d">{{ idx === 0 ? (req.createdAt | date: 'dd MMM') : '' }}</span>
            </div>
          }
        </div>
      </div>

      @if (req.reviewNote) {
        <se-strip label="Factory review note" badge="Production desk">
          <p class="small" style="margin: 0">“{{ req.reviewNote }}”</p>
        </se-strip>
      }

      @if (req.status === 'quoted') {
        <se-strip label="Quotation & pricing" badge="Awaiting your acceptance">
          @if (quote(); as q) {
            <se-ledger [rows]="quoteRows(q)" />
            @if (q.note) {
              <p class="muted small">{{ q.note }}</p>
            }
            <button class="cta" style="width:100%" (click)="accept(req.id)">
              <span class="material-symbols-outlined" aria-hidden="true">handshake</span>
              Accept quotation
            </button>
          } @else {
            <button class="cta outline" style="width:100%" (click)="loadQuote(req.id)">
              View quotation
            </button>
          }
        </se-strip>
      }

      @if (req.status === 'quote_accepted') {
        <div class="policy-strip">
          <span class="material-symbols-outlined" aria-hidden="true">payments</span>
          <div>
            <strong>Awaiting settlement</strong>
            Full payment (bank transfer / POS) is due now: the desk confirms it, then the strike-off
            sample enters production. No part-payments.
          </div>
        </div>
      }

      <se-strip label="Manufacturing strike-off sample" [badge]="sampleStageLabel(req)">
        <p class="small muted" style="margin: 0 0 var(--space-sm)">
          The factory produces one physical sample for your verification: seams, prints and fabric
          weight, before any bulk cutting starts.
        </p>
        <!-- GAP: sample photography (multi-angle gallery in the reference) awaits
             the S3 media pipeline on custom orders; the stage copy is live data. -->
        @if (req.status === 'sample_in_production') {
          <div class="status-strip ok">
            <span class="dot" aria-hidden="true"></span>
            <span>
              <strong>Your sample is in production at the Aba workshop.</strong> Once it reaches
              you, record your decision in the sign-off terminal below: full production only starts
              after your approval.
            </span>
          </div>
        } @else if (currentStage() >= 4) {
          <p class="small" style="margin: 0"><strong>Sample stage passed.</strong></p>
        } @else {
          <p class="small muted" style="margin: 0">
            Sample production begins after quotation acceptance and confirmed settlement.
          </p>
        }
      </se-strip>

      <se-strip label="Batch parameters" [badge]="req.quantity + ' units total'">
        <div class="size-grid">
          @for (part of sizeParts(req); track part) {
            <div class="sz">
              <span class="s-l">{{ part }}</span>
            </div>
          }
        </div>
        <se-ledger [rows]="batchRows(req)" />
      </se-strip>

      @if (req.status === 'sample_in_production') {
        <se-strip label="Consignee sign-off terminal" badge="Authorised signatory">
          <label
            >Revision notes (optional)
            <textarea
              [(ngModel)]="note"
              name="note"
              rows="3"
              placeholder="Describe required adjustments (e.g. adjust pocket width by 1cm, deepen ribbing tension, tighten wash tone)…"
            ></textarea>
          </label>
          <p class="muted small" style="margin: 0 0 var(--space-sm)">
            Leave blank if approving the strike-off without changes.
          </p>
          <button class="cta signoff-cta" (click)="decide(req, true)">
            <span
              ><span
                class="material-symbols-outlined"
                style="font-size:16px; vertical-align:-3px"
                aria-hidden="true"
                >verified</span
              >
              Approve sample &amp; authorise bulk production</span
            >
            <span class="sub">Locks the {{ req.quantity }}-unit cutting schedule</span>
          </button>
          <button
            class="cta outline"
            style="width:100%; margin-top: var(--space-sm)"
            (click)="decide(req, false)"
          >
            <span class="material-symbols-outlined" aria-hidden="true">sync_problem</span>
            Request changes / revise sample
          </button>
        </se-strip>
      }
      @if (message()) {
        <p class="success">{{ message() }}</p>
      }
      @if (error()) {
        <p class="error">{{ error() }}</p>
      }
    } @else if (missing()) {
      <p class="error">
        Request not found. <a class="link" routerLink="/custom">Back to requests</a>
      </p>
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

  code(req: CustomOrder): string {
    return req.id.slice(0, 8).toUpperCase();
  }

  title(req: CustomOrder): string {
    const words = req.description.trim().split(/\s+/).slice(0, 6).join(' ');
    return words.toUpperCase() || `CUSTOM REQUEST ${this.code(req)}`;
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
    return req.sizes
      .split(/[,|]/)
      .map((p) => p.trim())
      .filter(Boolean);
  }

  paidAt(): string | null {
    return this.request()?.paidAt ?? null;
  }

  quoteRows(q: { amount: number; note: string | null }): Array<LedgerRow> {
    return [
      {
        label: 'Quoted production cost',
        value: `₦${this.money(q.amount)}`,
        note: 'raw material + sewing + branding + packaging',
        total: true,
      },
    ];
  }

  batchRows(req: CustomOrder): Array<LedgerRow> {
    const rows: Array<LedgerRow> = [
      { label: 'Fabric', value: req.fabricQuality, numeric: false },
      { label: 'Approved colourways', value: req.colours, numeric: false },
      { label: 'Target delivery', value: req.desiredDate, numeric: false },
    ];
    const paid = req.paidAt;
    if (paid) {
      rows.push({
        label: 'Settled',
        value: `${this.day(paid)} (desk-confirmed)`,
        numeric: false,
      });
    }
    const q = this.quote();
    if (q) {
      rows.push({
        label: 'Locked production cost',
        value: `₦${this.money(q.amount)}`,
        total: true,
      });
    }
    return rows;
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
        this.message.set(
          'Quotation accepted: settle the full amount with the desk to start the sample.',
        );
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
            ? `Sample approved: the ${req.quantity}-unit batch is authorised for production.`
            : 'Revision requested: the factory will rework the sample.',
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

  private money(value: number): string {
    return value.toLocaleString('en-NG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  private day(value: string): string {
    return new Intl.DateTimeFormat('en-NG', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value));
  }
}

/** The one row shape `se-ledger` accepts. */
interface LedgerRow {
  label: string;
  value: string;
  note?: string;
  total?: boolean;
  numeric?: boolean;
}
