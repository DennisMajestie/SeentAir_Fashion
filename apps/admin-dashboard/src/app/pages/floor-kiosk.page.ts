import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, AuditEntry, Batch } from '../api.service';

/** A17 — Factory floor kiosk / station terminal. LAYOUT SHELL: the reference's
    per-unit stitch counters, machine telemetry and barcode scanners have no
    backend, so this terminal renders the approved layout over the real batch
    the station is working: big readouts, stage advance, and QC flagging —
    all wired to the live production API. */
@Component({
  selector: 'app-floor-kiosk',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="ops-head">
      <div class="ops-id">
        <p class="eyebrow">Factory terminal</p>
        <h1>Station kiosk</h1>
        <p class="ops-sub">Active traveler batch for this station — large-format controls for the sewing floor.</p>
      </div>
      <div class="ops-actions">
        <span class="live-chip">Station online</span>
        <select class="table-filter" [(ngModel)]="selectedId" name="batch" (ngModelChange)="pick()">
          <option value="">— assign traveler batch —</option>
          @for (b of batches(); track b.id) {
            <option [value]="b.id">#{{ b.id.slice(0, 6) }} · {{ b.variant.sku }} × {{ b.quantity }} ({{ b.stage }})</option>
          }
        </select>
      </div>
    </div>

    @if (selected(); as b) {
      <div class="kpi-bar">
        <div class="kpi kpi-action">
          <span class="kpi-label">Active traveler batch</span>
          <span class="kpi-value">#{{ b.id.slice(0, 6) }}</span>
          <span class="kpi-sub">{{ b.variant.sku }} — {{ b.quantity }} unit run</span>
        </div>
        <div class="kpi">
          <span class="kpi-label">Current stage</span>
          <span class="kpi-value" style="text-transform:uppercase;">{{ b.stage }}</span>
          <span class="kpi-sub">planned {{ b.plannedDate || '—' }}</span>
        </div>
        <div class="kpi">
          <span class="kpi-label">Units in run</span>
          <span class="kpi-value">{{ b.quantity }}</span>
          <span class="kpi-sub">{{ flagged() }} flagged by QC on this batch</span>
          <!-- GAP: stitched-and-passed per-unit counters need per-unit scan events; the API
               tracks whole batches only, so no unit-by-unit progress is shown. -->
        </div>
        <div class="kpi">
          <span class="kpi-label">Batch fulfilment</span>
          <span class="kpi-value">{{ stagePct() }}<small>%</small></span>
          <span class="kpi-sub">stage {{ stageIndex(b.stage) + 1 }} of {{ stages().length }}</span>
          <span class="meter ok"><i [style.width]="stagePct() + '%'"></i></span>
        </div>
      </div>

      <div class="ops-grid">
        <div>
          <section class="panel flat" style="text-align:center; padding:1.6rem 1rem;">
            <p class="mini-note">Station action</p>
            @if (nextStage(b.stage); as next) {
              <button class="cta" style="width:100%; min-height:64px; font-size:1rem;" (click)="advance(b, next)">
                ✓ Stage complete — advance to {{ next }}
              </button>
            } @else {
              <p class="success">Run completed — finished goods stocked via the ledger.</p>
            }
            <div class="actions" style="justify-content:center; margin-top:0.8rem;">
              <button class="danger" style="min-height:52px; padding:0 1.4rem;" (click)="showFlag.set(!showFlag())">⚠ Flag seam defect / QC issue</button>
              <a class="cta small ghost" href="/production">Open production board</a>
            </div>
          </section>

          @if (showFlag()) {
            <section class="panel">
              <div class="panel-head"><h2>Flag defect on batch #{{ b.id.slice(0, 6) }}</h2></div>
              <form class="form-grid" (ngSubmit)="flag(b)">
                <label>Qty affected <input type="number" min="1" [max]="b.quantity" [(ngModel)]="fq.quantity" name="fqty" required /></label>
                <label>Classification
                  <select [(ngModel)]="fq.disposition" name="fdisp">
                    <option value="burned">Defective — burn (write-off)</option>
                    <option value="repaired_restocked">Minor factory error — repair & restock</option>
                  </select>
                </label>
                <label class="wide">What happened (required)
                  <input [(ngModel)]="fq.reason" name="freason" required placeholder="needle break line 03 / loose hem…" />
                </label>
                <div class="wide"><button class="cta small" type="submit">Log & call QA lead</button></div>
              </form>
            </section>
          }

          <section class="panel flat">
            <div class="panel-head"><h2>Shift travel feed</h2><span class="ph-sub">production events from the audit log</span></div>
            @if (feed().length > 0) {
              <ul class="activity">
                @for (e of feed(); track e.id) {
                  <li><time>{{ e.timestamp | date: 'HH:mm' }}</time><span class="act-action">{{ e.action }}</span></li>
                }
              </ul>
            } @else {
              <p class="muted small">No production events in the recent audit window.</p>
            }
          </section>
        </div>

        <aside>
          <section class="panel flat">
            <div class="panel-head"><h2>Station bay telemetry</h2></div>
            <div style="border:1px dashed var(--hairline-2); padding:1.2rem 1rem; text-align:center;">
              <p class="mini-note">No machine telemetry</p>
              <p class="muted small" style="margin:0.3rem 0 0;">Stitch cycle counters, thread reserve and vibration
                monitoring need factory IoT hardware that isn't integrated.</p>
            </div>
            <!-- GAP: JUKI/YAMAHA machine RPM, needle cycle values, bobbin thread reserve and
                 harmonic vibration wave — no IoT/telemetry backend exists. -->
          </section>
          <section class="panel flat">
            <div class="panel-head"><h2>Traveler record</h2></div>
            <dl class="kv">
              <dt>Batch id</dt><dd><code class="wrap-anywhere">{{ b.id }}</code></dd>
              <dt>SKU</dt><dd>{{ b.variant.sku }}</dd>
              <dt>Run size</dt><dd>{{ b.quantity }} units</dd>
              <dt>Stage</dt><dd>{{ b.stage }}</dd>
              <dt>Planned</dt><dd>{{ b.plannedDate || '—' }}</dd>
            </dl>
            <!-- GAP: barcode/label scanning to register assembly completion — no scan endpoint. -->
          </section>
        </aside>
      </div>
    } @else {
      <p class="muted">Assign a traveler batch from the selector above to activate this station terminal.</p>
    }

    @if (message()) { <p class="success">{{ message() }}</p> }
    @if (error()) { <p class="error">{{ error() }}</p> }
  `,
})
export class FloorKioskPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly stages = signal<string[]>([]);
  readonly batches = signal<Batch[]>([]);
  readonly selected = signal<Batch | null>(null);
  readonly rejected = signal<number>(0);
  readonly feed = signal<AuditEntry[]>([]);
  readonly showFlag = signal(false);
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  selectedId = '';
  fq = { quantity: 1, disposition: 'burned', reason: '' };

  ngOnInit(): void {
    this.load();
    this.api.auditLog({ limit: 30 }).subscribe({
      next: (res) => this.feed.set(res.data.filter((e) => /batch|production|qc/i.test(e.action)).slice(0, 6)),
      error: () => this.feed.set([]),
    });
  }

  private load(): void {
    this.api.batches().subscribe((res) => {
      this.stages.set(res.stages);
      this.batches.set(res.data);
      const sel = this.selected();
      if (sel) {
        const fresh = res.data.find((b) => b.id === sel.id) ?? null;
        this.selected.set(fresh);
        if (fresh) this.loadRejections(fresh.id);
      } else if (!this.selectedId) {
        // Default assignment: first active (non-final) batch, else the latest run on record.
        const first = this.activeBatches()[0] ?? this.batches()[0];
        if (first) { this.selectedId = first.id; this.pick(); }
      }
    });
  }

  activeBatches(): Batch[] {
    const last = this.stages()[this.stages().length - 1];
    return this.batches().filter((b) => b.stage !== last);
  }

  pick(): void {
    const b = this.batches().find((x) => x.id === this.selectedId) ?? null;
    this.selected.set(b);
    this.rejected.set(0);
    if (b) this.loadRejections(b.id);
  }

  private loadRejections(id: string): void {
    this.api.qcRejections(id).subscribe({
      next: (r) => this.rejected.set((r ?? []).reduce((s, x) => s + Number(x['quantity'] ?? 0), 0)),
      error: () => this.rejected.set(0),
    });
  }

  flagged(): number { return this.rejected(); }
  stageIndex(stage: string): number { return this.stages().indexOf(stage); }
  stagePct(): number {
    const b = this.selected();
    if (!b || this.stages().length === 0) return 0;
    return Math.round(((this.stageIndex(b.stage) + 1) / this.stages().length) * 100);
  }
  nextStage(stage: string): string | null {
    const s = this.stages();
    const i = s.indexOf(stage);
    return i >= 0 && i < s.length - 1 ? s[i + 1] : null;
  }

  advance(b: Batch, next: string): void {
    this.api.moveBatch(b.id, next).subscribe({
      next: () => { this.message.set(`Batch advanced to ${next}.`); this.error.set(null); this.load(); },
      error: (e) => { this.error.set(e?.error?.message ?? 'Stage move failed.'); this.message.set(null); },
    });
  }

  flag(b: Batch): void {
    this.api.recordQcRejection(b.id, {
      quantity: Number(this.fq.quantity), reason: this.fq.reason, disposition: this.fq.disposition,
    }).subscribe({
      next: () => {
        this.fq = { quantity: 1, disposition: 'burned', reason: '' };
        this.showFlag.set(false);
        this.message.set('Defect logged — QC record written; burned units excluded from completion stock-in.');
        this.error.set(null);
        this.loadRejections(b.id);
      },
      error: (e) => { this.error.set(e?.error?.message ?? 'Could not log the defect.'); this.message.set(null); },
    });
  }
}
