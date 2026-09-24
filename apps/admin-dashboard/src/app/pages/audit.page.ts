import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, AuditEntry } from '../api.service';

/** A15 — Immutable operational audit log. Approved Stitch layout: integrity
    header, entry tiles, server-side filters (action / actor / date window) and
    an expandable before/after state inspector per entry. Entries are written
    automatically by the API's audit interceptor (principle #4). */
@Component({
  selector: 'app-audit',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="ops-head">
      <div class="ops-id">
        <p class="eyebrow">Governance · Audit</p>
        <h1>Activity log</h1>
        <p class="ops-sub">Every change to the business is recorded here automatically — nothing needs to be typed in by hand.</p>
      </div>
      <div class="ops-actions">
        <span class="live-chip">Automatic</span>
        <!-- GAP: the reference's "Verify Data Integrity" runs a cryptographic hash-chain check;
             the audit table has no hash column, so no integrity-proof action exists yet. -->
      </div>
    </div>

    <div class="kpi-bar">
      <div class="kpi"><span class="kpi-label">Entries recorded</span><span class="kpi-value">{{ total() | number }}</span><span class="kpi-sub">matching current filter</span></div>
      <div class="kpi"><span class="kpi-label">Distinct actors</span><span class="kpi-value">{{ distinctActors() }}</span><span class="kpi-sub">on this page of results</span></div>
      <div class="kpi"><span class="kpi-label">System writes</span><span class="kpi-value">{{ systemWrites() }}</span><span class="kpi-sub">entries without a staff actor</span></div>
      <div class="kpi"><span class="kpi-label">Window</span><span class="kpi-value">{{ entries().length }}</span><span class="kpi-sub">entries shown (latest first)</span></div>
    </div>

    <div class="ops-toolbar">
      <span class="search"><input placeholder="Filter by action (e.g. orders, role, price)…" [(ngModel)]="fAction" name="fa" (keyup.enter)="applyFilters()" aria-label="Filter by action" /></span>
      <label class="inline">From <input type="date" [(ngModel)]="fFrom" name="ff" /></label>
      <label class="inline">To <input type="date" [(ngModel)]="fTo" name="ft" /></label>
      <button class="cta small ghost" type="button" (click)="applyFilters()">Apply filters</button>
      @if (filtered()) { <button class="link" type="button" (click)="clearFilters()">clear</button> }
    </div>

    <div class="table-scroll">
      <table class="table">
        <thead><tr><th>Timestamp (WAT)</th><th>Actor</th><th>Action</th><th>State capture</th><th></th></tr></thead>
        <tbody>
          @for (entry of entries(); track entry.id) {
            <tr class="clickable" [class.sel]="openId() === entry.id" (click)="toggle(entry.id)">
              <td class="mono small">{{ entry.timestamp | date: 'MMM d, y HH:mm:ss' }}</td>
              <td class="mono small">
                @if (entry.actorId) { {{ entry.actorId.slice(0, 8) }} } @else { <span class="chip">system</span> }
              </td>
              <td><code>{{ entry.action }}</code></td>
              <td class="small muted">
                @if (hasState(entry)) { before/after captured } @else { — }
              </td>
              <td><button class="link" type="button" (click)="toggle(entry.id); $event.stopPropagation()">{{ openId() === entry.id ? 'hide' : 'inspect' }}</button></td>
            </tr>
            @if (openId() === entry.id) {
              <tr>
                <td colspan="5">
                  <div class="cols">
                    <div>
                      <p class="mini-note">Before state</p>
                      <pre class="json-fold">{{ pretty(entry.beforeState) }}</pre>
                    </div>
                    <div>
                      <p class="mini-note">After state</p>
                      <pre class="json-fold">{{ pretty(entry.afterState) }}</pre>
                    </div>
                  </div>
                  <p class="mini-note" style="margin-top:0.4rem;">Entry {{ entry.id }} · actor {{ entry.actorId ?? 'system' }}</p>
                </td>
              </tr>
            }
          }
          @if (entries().length === 0) { <tr><td colspan="5" class="muted small">No entries match this filter window.</td></tr> }
        </tbody>
      </table>
    </div>
  `,
})
export class AuditPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly entries = signal<AuditEntry[]>([]);
  readonly total = signal(0);
  readonly openId = signal<string | null>(null);
  readonly filtered = signal(false);
  fAction = '';
  fFrom = '';
  fTo = '';

  ngOnInit(): void {
    this.load();
  }

  readonly distinctActors = computed(() => new Set(this.entries().filter((e) => e.actorId).map((e) => e.actorId)).size);
  readonly systemWrites = computed(() => this.entries().filter((e) => !e.actorId).length);

  private load(): void {
    this.api.auditLog({
      action: this.fAction.trim() || undefined,
      from: this.fFrom || undefined,
      to: this.fTo ? `${this.fTo}T23:59:59` : undefined,
      limit: 50,
    }).subscribe((res) => {
      this.entries.set(res.data);
      this.total.set(res.total);
    });
  }

  applyFilters(): void {
    this.filtered.set(!!(this.fAction.trim() || this.fFrom || this.fTo));
    this.load();
  }

  clearFilters(): void {
    this.fAction = ''; this.fFrom = ''; this.fTo = '';
    this.filtered.set(false);
    this.load();
  }

  toggle(id: string): void {
    this.openId.set(this.openId() === id ? null : id);
  }

  hasState(e: AuditEntry): boolean {
    return e.beforeState != null || e.afterState != null;
  }

  pretty(v: unknown): string {
    if (v == null) return '— not captured —';
    try { return JSON.stringify(v, null, 2); } catch { return String(v); }
  }
}
