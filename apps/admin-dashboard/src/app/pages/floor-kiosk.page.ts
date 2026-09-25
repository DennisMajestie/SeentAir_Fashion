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
        <p class="ops-sub">The batch currently at this work station — big, easy buttons for the sewing floor.</p>
      </div>
      <div class="ops-actions">
        <span class="live-chip">Station online</span>
        <select class="table-filter" [(ngModel)]="selectedId" name="batch" (ngModelChange)="pick()">
          <option value="">— assign a batch —</option>
          @for (b of batches(); track b.id) {
            <option [value]="b.id">#{{ b.id.slice(0, 6) }} · {{ b.variant.sku }} × {{ b.quantity }} ({{ b.stage }})</option>
          }
        </select>
      </div>
    </div>

    @if (selected(); as b) {
      <div class="kpi-bar">
        <div class="kpi kpi-action">
          <span class="kpi-label">Active batch</span>
          <span class="kpi-value">#{{ b.id.slice(0, 6) }}</span>
          <span class="kpi-sub">{{ b.variant.sku }} — {{ b.quantity }} units</span>
        </div>
        <div class="kpi">
          <span class="kpi-label">Current stage</span>
          <span class="kpi-value" style="text-transform:uppercase;">{{ b.stage }}</span>
          <span class="kpi-sub">planned {{ b.plannedDate || '—' }}</span>
        </div>
        <div class="kpi">
          <span class="kpi-label">Units in run</span>
          <span class="kpi-value">{{ b.quantity }}</span>
          <span class="kpi-sub">{{ unitsScanned() }} unit(s) gated at stage · {{ flagged() }} flagged</span>
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
              <p class="success">Batch done — finished goods added to stock.</p>
            }
            <div class="actions" style="justify-content:center; margin-top:0.8rem;">
              <button class="danger" style="min-height:52px; padding:0 1.4rem;" (click)="showFlag.set(!showFlag())">⚠ Flag seam defect / QC issue</button>
              <a class="cta small ghost" href="/production">Open production board</a>
            </div>
            <div class="panel-head" style="margin-top:0.9rem;"><h3 style="font-size:0.9rem;">Stage-gate scan</h3><span class="ph-sub">operator log at gate</span></div>
            <div style="display:flex; gap:0.5rem;">
              <input style="flex:1;" placeholder="event — e.g. sewing_start, qc" [(ngModel)]="ns.eventType" name="kevent" />
              <input type="number" min="0" style="width:5.5rem;" [(ngModel)]="ns.scannedQty" name="kqty" placeholder="qty" />
              <button class="cta small" [disabled]="!ns.eventType" type="button" (click)="gateScan(b)">Log scan</button>
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
            <div class="panel-head"><h2>Recent activity</h2><span class="ph-sub">production events</span></div>
            @if (feed().length > 0) {
              <ul class="activity">
                @for (e of feed(); track e.id) {
                  <li><time>{{ e.timestamp | date: 'HH:mm' }}</time><span class="act-action">{{ e.action }}</span></li>
                }
              </ul>
            } @else {
              <div class="empty-state">
                <span class="empty-state-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="m8.2 12.4 2.6 2.6 5-5.2" /></svg></span>
                <h2 class="empty-state-title">No recent activity</h2>
                <p class="empty-state-sub">Production events appear here as the batch moves.</p>
              </div>
            }
          </section>
        </div>

        <aside>
          <section class="panel flat">
            <div class="panel-head"><h2>Machine status</h2><span class="ph-end"><button class="cta small ghost" type="button" (click)="showTel.set(!showTel())">Record snapshot</button></span></div>
            @if (latestTel(); as t) {
              <div class="kpi-bar" style="grid-template-columns:repeat(3,1fr);">
                <div class="kpi"><span class="kpi-label">Machine</span><span class="kpi-value" style="font-size:0.95rem;">{{ t['machine'] }}</span><span class="kpi-sub">{{ t['stage'] }}</span></div>
                <div class="kpi"><span class="kpi-label">RPM</span><span class="kpi-value">{{ t['rpm'] ?? '—' }}</span><span class="kpi-sub">needle cycles {{ t['needleCycles'] ?? '—' }}</span></div>
                <div class="kpi"><span class="kpi-label">Thread reserve</span><span class="kpi-value">{{ t['threadReservePct'] != null ? t['threadReservePct'] + '%' : '—' }}</span><span class="kpi-sub">{{ t['recordedAt'] ? (str(t['recordedAt']) | date: 'HH:mm') : '—' }}</span></div>
              </div>
            } @else {
              <div style="border:1px dashed var(--hairline-2); padding:1.2rem 1rem; text-align:center;">
                <p class="mini-note">No machine snapshots yet</p>
                <p class="muted small" style="margin:0.3rem 0 0;">Use "Record snapshot" to log RPM, needle cycles and thread reserve for this batch.</p>
              </div>
            }
            @if (showTel()) {
              <form class="form-grid" (ngSubmit)="recordTel()" style="margin-top:0.8rem;">
                <label>Stage <input [(ngModel)]="nt.stage" name="kstage" required placeholder="Sewing" /></label>
                <label>Machine <input [(ngModel)]="nt.machine" name="kmachine" required placeholder="JUKI DDL-8700 · line 02" /></label>
                <label>RPM <input type="number" min="0" [(ngModel)]="nt.rpm" name="krpm" /></label>
                <label>Needle cycles <input type="number" min="0" [(ngModel)]="nt.needleCycles" name="kcycles" /></label>
                <label>Thread reserve % <input type="number" min="0" max="100" [(ngModel)]="nt.threadReservePct" name="kreserve" /></label>
                <div class="wide actions flat"><button class="cta small" type="submit">Save</button><button class="link" type="button" (click)="showTel.set(false)">Close</button></div>
              </form>
            }
          </section>
          <section class="panel flat">
            <div class="panel-head"><h2>Batch details</h2></div>
            <dl class="kv">
              <dt>Batch id</dt><dd><code class="wrap-anywhere">{{ b.id }}</code></dd>
              <dt>SKU</dt><dd>{{ b.variant.sku }}</dd>
              <dt>Run size</dt><dd>{{ b.quantity }} units</dd>
              <dt>Stage</dt><dd>{{ b.stage }}</dd>
              <dt>Planned</dt><dd>{{ b.plannedDate || '—' }}</dd>
              <dt>Label barcode</dt>
              <dd>
                @if (barcode(); as bc) { <code class="wrap-anywhere">{{ bc }}</code> }
                @else { <span class="muted small">not registered</span> }
              </dd>
            </dl>
            <form class="form-grid" (ngSubmit)="registerBarcode(b)" style="margin-top:0.7rem;">
              <label class="wide mini-note">Register printed label barcode
                <div style="display:flex; gap:0.5rem; margin-top:0.3rem;">
                  <input [(ngModel)]="barcodeInput" name="kbc" placeholder="scan / type barcode value" style="flex:1;" />
                  <button class="cta small" type="submit" [disabled]="!barcodeInput">Save</button>
                </div>
              </label>
            </form>
          </section>
        </aside>
      </div>
    } @else {
      <p class="muted">Assign a batch from the menu above to start working on it.</p>
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
  readonly telemetry = signal<Array<Record<string, unknown>>>([]);
  readonly scans = signal<Array<Record<string, unknown>>>([]);
  readonly barcode = signal<string | null>(null);
  readonly showTel = signal(false);
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  selectedId = '';
  fq = { quantity: 1, disposition: 'burned', reason: '' };
  barcodeInput = '';
  ns = { eventType: '', scannedQty: null as number | null };
  nt = { stage: '', machine: '', rpm: null as number | null, needleCycles: null as number | null, threadReservePct: null as number | null };

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
        if (fresh) { this.loadRejections(fresh.id); this.loadKiosk(fresh.id); }
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
    this.telemetry.set([]);
    this.scans.set([]);
    this.barcode.set(null);
    if (b) { this.loadRejections(b.id); this.loadKiosk(b.id); }
  }

  private loadKiosk(id: string): void {
    this.api.batchScans(id).subscribe({
      next: (r) => this.scans.set(r as unknown as Array<Record<string, unknown>>),
      error: () => this.scans.set([]),
    });
    this.api.batchTelemetry(id).subscribe({
      next: (r) => this.telemetry.set(r as unknown as Array<Record<string, unknown>>),
      error: () => this.telemetry.set([]),
    });
    this.api.batch(id).subscribe({
      next: (batch) => this.barcode.set(batch && batch['barcode'] ? String(batch['barcode']) : null),
      error: () => this.barcode.set(null),
    });
  }

  private loadRejections(id: string): void {
    this.api.qcRejections(id).subscribe({
      next: (r) => this.rejected.set((r ?? []).reduce((s, x) => s + Number(x['quantity'] ?? 0), 0)),
      error: () => this.rejected.set(0),
    });
  }

  flagged(): number { return this.rejected(); }
  str(v: unknown): string { return v ? String(v) : ''; }
  unitsScanned(): number {
    return this.scans().reduce((s, x) => s + Number(x['scannedQty'] ?? 1), 0);
  }
  latestTel(): Record<string, unknown> | null {
    return this.telemetry()[this.telemetry().length - 1] ?? null;
  }
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

  registerBarcode(b: Batch): void {
    if (!this.barcodeInput.trim()) return;
    this.api.registerBatchBarcode(b.id, this.barcodeInput.trim()).subscribe({
      next: (fresh) => {
        this.barcode.set(String((fresh as Record<string, unknown> | null)?.['barcode'] ?? this.barcodeInput.trim()));
        this.message.set('Barcode registered for this batch label.');
        this.error.set(null);
      },
      error: (e) => { this.error.set(e?.error?.message ?? 'Could not register the barcode.'); this.message.set(null); },
    });
  }

  recordTel(): void {
    const b = this.selected();
    if (!b) return;
    this.api.recordTelemetry(b.id, {
      stage: this.nt.stage,
      machine: this.nt.machine,
      rpm: this.nt.rpm ?? undefined,
      needleCycles: this.nt.needleCycles ?? undefined,
      threadReservePct: this.nt.threadReservePct ?? undefined,
    }).subscribe({
      next: () => {
        this.nt = { stage: '', machine: '', rpm: null, needleCycles: null, threadReservePct: null };
        this.showTel.set(false);
        this.message.set('Machine snapshot recorded.');
        this.error.set(null);
        this.api.batchTelemetry(b.id).subscribe((r) => this.telemetry.set(r as unknown as Array<Record<string, unknown>>));
      },
      error: (e) => { this.error.set(e?.error?.message ?? 'Could not record the snapshot.'); this.message.set(null); },
    });
  }

  gateScan(b: Batch): void {
    if (!this.ns.eventType.trim()) return;
    this.api.recordBatchScan(b.id, {
      eventType: this.ns.eventType.trim(),
      scannedQty: this.ns.scannedQty ?? b.quantity,
    }).subscribe({
      next: () => {
        this.ns = { eventType: '', scannedQty: null };
        this.message.set(`Gate scan "${this.ns.eventType}" logged.`);
        this.error.set(null);
        this.api.batchScans(b.id).subscribe((r) => this.scans.set(r as unknown as Array<Record<string, unknown>>));
      },
      error: (e) => { this.error.set(e?.error?.message ?? 'Could not log the scan.'); this.message.set(null); },
    });
  }
}
