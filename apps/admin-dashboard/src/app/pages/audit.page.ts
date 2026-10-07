import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import {
  SeBannerComponent,
  SeButtonDirective,
  SeCellDirective,
  SeColumn,
  SeDatePipe,
  SeDrawerComponent,
  SeFilterBarComponent,
  SeKvDirective,
  SeKvItemComponent,
  SePageComponent,
  SeTableComponent,
} from '@seentair/ui';
import { ApiService, AuditEntry } from '../api.service';
import { urlFilters } from '../url-filters';

interface VerifyResult {
  total: number;
  valid: number;
  broken: number;
  headHash: string | null;
}

/** The time window a filter chip stands for, in days back from today. */
const WINDOWS: Array<{ value: string; label: string; days: number }> = [
  { value: '1', label: 'Today', days: 0 },
  { value: '7', label: 'Last 7 days', days: 7 },
  { value: '30', label: 'Last 30 days', days: 30 },
];

/**
 * The audit log: every write, by whom, with the before and after states
 * (principle #4). Reading it needs approve access on approvals_audit; the
 * integrity check needs view. A failed read must never look like a quiet
 * day, so the error state replaces the table rather than an empty one.
 */
@Component({
  selector: 'app-audit',
  imports: [
    SeBannerComponent,
    SeButtonDirective,
    SeCellDirective,
    SeDatePipe,
    SeDrawerComponent,
    SeFilterBarComponent,
    SeKvDirective,
    SeKvItemComponent,
    SePageComponent,
    SeTableComponent,
  ],
  template: `
    <se-page title="Audit log">
      <button
        seButton
        sePageActions
        type="button"
        [loading]="verifying()"
        (click)="verifyIntegrity()"
      >
        Check integrity
      </button>

      @if (verifyError()) {
        <se-banner
          tone="danger"
          title="The integrity check could not run"
          actionLabel="Try again"
          (action)="verifyIntegrity()"
        >
          The ledger has not been verified. Nothing has been changed.
        </se-banner>
      } @else if (verifyResult(); as v) {
        @if (v.broken > 0) {
          <se-banner
            tone="danger"
            [title]="v.broken + ' of ' + v.total + ' entries fail the hash chain'"
          >
            Someone or something has altered the ledger. Keep this page open and tell the owner.
          </se-banner>
        } @else {
          <se-banner tone="success" title="Ledger verified: hash-chain valid">
            {{ v.valid }} of {{ v.total }} entries check out.
            @if (v.headHash) {
              Head {{ v.headHash.slice(0, 12) }}.
            }
          </se-banner>
        }
      }

      <se-table
        caption="Audit entries"
        [columns]="columns"
        [rows]="entries()"
        [loading]="loading()"
        [error]="
          loadError() ? 'Could not load the activity log. Nothing on screen is current.' : ''
        "
        (retry)="load()"
        activatable
        (rowActivate)="open($event)"
        [emptyHeading]="filtered() ? 'No entries match this filter window' : 'No entries yet'"
        [emptyText]="
          filtered()
            ? 'Widen the window or clear the filters to see every entry.'
            : 'Every change made in the system is listed here.'
        "
      >
        <se-filter-bar
          seTableToolbar
          searchLabel="Search by action"
          searchPlaceholder="For example orders.update"
          [(query)]="query"
          [filters]="filters"
          [(value)]="filterValue"
          [summary]="summary()"
        />
        <ng-template seCell="timestamp" let-row>{{
          row.timestamp | seDate: 'datetime'
        }}</ng-template>
      </se-table>

      <se-drawer title="Audit entry" [(open)]="inspecting">
        @if (selected(); as e) {
          <dl seKv>
            <div seKvItem label="Action">{{ e.action }}</div>
            <div seKvItem label="Actor">{{ actorName(e.actorId) }}</div>
            <div seKvItem label="When">{{ e.timestamp | seDate: 'datetime' }}</div>
            <div seKvItem label="Before">
              <pre>{{ pretty(e.beforeState) }}</pre>
            </div>
            <div seKvItem label="After">
              <pre>{{ pretty(e.afterState) }}</pre>
            </div>
          </dl>
        }
      </se-drawer>
    </se-page>
  `,
})
export class AuditPage implements OnInit {
  private readonly api = inject(ApiService);

  readonly entries = signal<AuditEntry[]>([]);
  readonly total = signal(0);
  /** True only until the first answer arrives. */
  readonly loading = signal(true);
  /** Set when the entry fetch fails. Distinguishes "the log is genuinely empty"
      from "we could not read the log", which on this screen is the difference
      between a quiet day and a blind one. */
  readonly loadError = signal(false);
  readonly verifyResult = signal<VerifyResult | null>(null);
  /** Separate from loadError: the integrity check is the one control on the
      page whose silence would read as good news, so it never fails quietly. */
  readonly verifyError = signal(false);
  readonly verifying = signal(false);

  // ---- filters, applied by the server and mirrored in the URL ----
  private readonly urlState = urlFilters(['window']);
  readonly query = this.urlState.query;
  readonly filterValue = this.urlState.value;
  readonly filters = [
    {
      key: 'window',
      label: 'When',
      options: WINDOWS.map(({ value, label }) => ({ value, label })),
    },
  ];
  readonly filtered = computed(
    () => !!this.query().trim() || Object.keys(this.filterValue()).length > 0,
  );
  readonly summary = computed(() => {
    const shown = this.entries().length;
    const noun = this.total() === 1 ? 'entry' : 'entries';
    return this.total() > shown
      ? `Latest ${shown} of ${this.total()} entries`
      : `${this.total()} ${noun}`;
  });

  readonly columns: SeColumn<AuditEntry>[] = [
    { key: 'timestamp', header: 'When', value: (e) => e.timestamp },
    { key: 'action', header: 'Action', value: (e) => e.action },
    { key: 'actor', header: 'Actor', value: (e) => this.actorName(e.actorId) },
  ];

  readonly inspecting = signal(false);
  readonly selected = signal<AuditEntry | null>(null);

  private filterKey(): string {
    return `${this.query().trim()}|${this.filterValue()['window'] ?? ''}`;
  }
  private lastKey = this.filterKey();

  constructor() {
    // The search and window are applied by the server, so a change re-reads the log.
    effect(() => {
      const key = this.filterKey();
      untracked(() => {
        if (key !== this.lastKey) {
          this.lastKey = key;
          this.applyFilters();
        }
      });
    });
  }

  /** Who an actor id is, by name; ids stay as ids when the list is not readable. */
  private readonly names = signal<Record<string, string>>({});
  actorName(actorId: string | null): string {
    if (!actorId) return 'System';
    return this.names()[actorId] ?? actorId;
  }

  ngOnInit(): void {
    this.load();
    this.verifyIntegrity();
    this.api.users().subscribe({
      next: (res) =>
        this.names.set(
          Object.fromEntries(res.data.map((u) => [u['id'] as string, u['name'] as string])),
        ),
      error: () => undefined,
    });
  }

  load(): void {
    const window = WINDOWS.find((w) => w.value === this.filterValue()['window']);
    let from: string | undefined;
    if (window) {
      const d = new Date();
      d.setDate(d.getDate() - window.days);
      from = d.toISOString().slice(0, 10);
    }
    this.api.auditLog({ action: this.query().trim() || undefined, from, limit: 50 }).subscribe({
      next: (res) => {
        this.entries.set(res.data);
        this.total.set(res.total);
        this.loading.set(false);
        this.loadError.set(false);
      },
      error: () => {
        // Drop any rows already on screen: leaving stale entries under a
        // fresh filter would misreport what the window currently contains.
        this.entries.set([]);
        this.total.set(0);
        this.loading.set(false);
        this.loadError.set(true);
      },
    });
  }

  /** Re-reads with the current search and window. */
  applyFilters(): void {
    this.load();
  }

  open(e: AuditEntry): void {
    this.selected.set(e);
    this.inspecting.set(true);
  }

  pretty(v: unknown): string {
    if (v == null) return 'Not captured';
    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return String(v);
    }
  }

  verifyIntegrity(): void {
    this.verifying.set(true);
    this.verifyError.set(false);
    this.api.auditVerify().subscribe({
      next: (res) => {
        this.verifyResult.set(res);
        this.verifying.set(false);
      },
      error: () => {
        // Clear any earlier passing result so a stale "hash-chain valid" cannot
        // outlive the check it came from and stand in for this one.
        this.verifyResult.set(null);
        this.verifyError.set(true);
        this.verifying.set(false);
      },
    });
  }
}
