import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, Approval, LowStock, ReturnRequest } from './api.service';

interface AttentionRow {
  key: string;
  severity: 'crit' | 'warn' | 'info';
  ico: string;
  tag: string;
  body: string;
  when: string;
  route: string;
}

interface ActionRow {
  label: string;
  route: string;
  ico: string;
  hint: string;
}

const QUICK_ACTIONS: ActionRow[] = [
  {
    label: 'New production batch',
    route: '/production',
    ico: 'precision_manufacturing',
    hint: 'Plan a run',
  },
  { label: 'Add catalogue item', route: '/catalogue', ico: 'add_box', hint: 'New SKU, price' },
  {
    label: 'Record material purchase',
    route: '/materials',
    ico: 'inventory_2',
    hint: 'Inward stock',
  },
  {
    label: 'Post ledger entry',
    route: '/accounting',
    ico: 'account_balance',
    hint: 'Manual movement',
  },
  { label: 'Create delivery', route: '/logistics', ico: 'local_shipping', hint: 'New waybill' },
  {
    label: 'Create custom request',
    route: '/custom-orders',
    ico: 'checkroom',
    hint: 'Bespoke order',
  },
  { label: 'Add staff member', route: '/staff', ico: 'badge', hint: 'Operator account' },
  { label: 'Create wholesale tier', route: '/wholesale', ico: 'warehouse', hint: 'Price band' },
];

/** Header operations hub, a live attention bell plus a quick-actions menu, so
    the owner sees what needs them from any screen without opening a page.
    Data pulls reuse the same endpoints as the dashboard KPI rail. */
@Component({
  selector: 'app-opsbar',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="opsbar">
      <div class="ops-cell">
        <button
          class="ops-btn"
          type="button"
          [attr.aria-expanded]="bellOpen()"
          aria-label="Needs your attention"
          title="Needs your attention"
          [attr.aria-haspopup]="'true'"
          (click)="toggleBell()"
        >
          <span class="ops-ico" aria-hidden="true">notifications</span>
          @if (degraded()) {
            <span
              class="ops-badge err"
              [title]="blind()
                ? 'Cannot reach the server, so this count is unknown'
                : 'Partly loaded: ' + degradedSources() + ' could not be read'"
              >!</span
            >
          } @else if (attentionCount() > 0) {
            <span class="ops-badge">{{ attentionCount() > 9 ? '9+' : attentionCount() }}</span>
          }
        </button>

        @if (bellOpen()) {
          <div class="ops-pop" role="region" aria-label="Needs your attention">
            @if (degraded()) {
              <p class="ops-pop-error" role="status">
                @if (blind()) {
                  Cannot reach the server. Nothing below can be confirmed, so this is
                  not an all-clear.
                } @else {
                  Could not read {{ degradedSources() }}. Anything not listed may still
                  need you.
                }
              </p>
            }
            @for (it of attentionRows(); track it.key) {
              <a
                class="ops-pop-item"
                [class.crit]="it.severity === 'crit'"
                [class.warn]="it.severity === 'warn'"
                routerLink="{{ it.route }}"
                (click)="close()"
              >
                <span class="ops-dot" aria-hidden="true"></span>
                <span class="ops-pop-ico" aria-hidden="true">{{ it.ico }}</span>
                <span class="ops-pop-main">
                  <strong>{{ it.tag }}</strong>
                  <small>{{ it.body }}</small>
                </span>
                <span class="ops-pop-when">{{ it.when }}</span>
              </a>
            }
            @if (attentionRows().length === 0) {
              @if (degraded()) {
                <p class="ops-pop-empty">Nothing confirmed yet. The list above explains why.</p>
              } @else {
                <p class="ops-pop-empty">All clear: nothing needs you right now.</p>
              }
            }
          </div>
        }
      </div>

      <div class="ops-cell">
        <button
          class="ops-btn"
          type="button"
          [attr.aria-expanded]="actionsOpen()"
          aria-label="Quick actions"
          title="Quick actions"
          [attr.aria-haspopup]="'true'"
          (click)="toggleActions()"
        >
          <span class="ops-ico" aria-hidden="true">add</span>
        </button>

        @if (actionsOpen()) {
          <div class="ops-pop" role="menu" aria-label="Quick actions">
            @for (a of quickActions; track a.route + a.label) {
              <a class="ops-pop-item" routerLink="{{ a.route }}" role="menuitem" (click)="close()">
                <span class="ops-pop-ico" aria-hidden="true">{{ a.ico }}</span>
                <span class="ops-pop-main">
                  <strong>{{ a.label }}</strong>
                  <small>{{ a.hint }}</small>
                </span>
              </a>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class AppOpsbarComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly el = inject(ElementRef);
  private readonly approvals = signal<Approval[]>([]);
  private readonly lowStock = signal<LowStock | null>(null);
  private readonly returnList = signal<ReturnRequest[]>([]);
  /** Per-source failure flags. Tracked separately rather than as one boolean so
      a single failing endpoint still lets the others through: losing lowStock
      should not hide the approvals the owner does need to act on. */
  private readonly approvalsFailed = signal(false);
  private readonly lowStockFailed = signal(false);
  private readonly returnsFailed = signal(false);
  readonly bellOpen = signal(false);
  readonly actionsOpen = signal(false);
  readonly quickActions = QUICK_ACTIONS;
  private timer?: ReturnType<typeof setInterval>;
  private onPointer: (e: PointerEvent) => void;

  /** Any source behind us right now, so the counts are incomplete. */
  readonly degraded = computed<boolean>(
    () => this.approvalsFailed() || this.lowStockFailed() || this.returnsFailed(),
  );

  /** Everything behind us. The bell must not read "all clear" in this state. */
  readonly blind = computed<boolean>(
    () => this.approvalsFailed() && this.lowStockFailed() && this.returnsFailed(),
  );

  /** Wording for the banner. Names only the sources that actually failed. */
  readonly degradedSources = computed<string>(() => {
    const parts: string[] = [];
    if (this.approvalsFailed()) parts.push('approvals');
    if (this.lowStockFailed()) parts.push('stock levels');
    if (this.returnsFailed()) parts.push('returns');
    return parts.join(', ');
  });

  constructor() {
    this.onPointer = (e: PointerEvent): void => {
      if (!this.el.nativeElement.contains(e.target as Node)) this.close();
    };
  }

  ngOnInit(): void {
    this.refresh();
    this.timer = setInterval(() => this.refresh(), 60000);
    document.addEventListener('pointerdown', this.onPointer);
  }
  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    document.removeEventListener('pointerdown', this.onPointer);
  }

  private refresh(): void {
    // Each source clears its own flag on success, so a blip that resolves on
    // the next 60s tick stops showing as degraded without a full reload.
    this.api.pendingApprovals().subscribe({
      next: (a) => {
        this.approvals.set(a);
        this.approvalsFailed.set(false);
      },
      error: () => this.approvalsFailed.set(true),
    });
    this.api.lowStock().subscribe({
      next: (ls) => {
        this.lowStock.set(ls);
        this.lowStockFailed.set(false);
      },
      error: () => this.lowStockFailed.set(true),
    });
    this.api.returns().subscribe({
      next: (r) => {
        this.returnList.set(r.data.filter((x) => x.status === 'requested'));
        this.returnsFailed.set(false);
      },
      error: () => this.returnsFailed.set(true),
    });
  }

  readonly attentionRows = computed<AttentionRow[]>(() => {
    const rows: AttentionRow[] = [];
    for (const a of this.approvals().slice(0, 3)) {
      rows.push({
        key: `a-${a.id}`,
        severity: 'warn',
        ico: 'fact_check',
        tag: String(a.actionType ?? 'Approval').replaceAll('_', ' '),
        body: `${a.requestedBy?.name ?? 'A member of staff'} requested this`,
        when: 'awaiting decision',
        route: '/approvals',
      });
    }
    if (this.approvals().length > 3) {
      rows.push({
        key: 'a-more',
        severity: 'info',
        ico: 'playlist_add',
        tag: 'More approvals queued',
        body: `${this.approvals().length - 3} more waiting`,
        when: '',
        route: '/approvals',
      });
    }
    const ls = this.lowStock();
    for (const m of (ls?.materials ?? []).slice(0, 2)) {
      rows.push({
        key: `m-${m.id}`,
        severity: 'crit',
        ico: 'crisis_alert',
        tag: 'Material critical',
        body: `${m.name}- only ${m.currentQuantity} ${m.unit ?? ''} left`,
        when: `threshold ${m.reorderThreshold}`,
        route: '/materials',
      });
    }
    if ((ls?.variants.length ?? 0) > 0) {
      rows.push({
        key: 'v-low',
        severity: 'warn',
        ico: 'inventory_2',
        tag: 'Finished-goods stock low',
        body: `${ls!.variants.length} SKU(s) at or below ${ls!.variantThreshold}`,
        when: 'see inventory',
        route: '/inventory',
      });
    }
    for (const r of this.returnList().slice(0, 2)) {
      const overdue = new Date(r.returnDeadline).getTime() < Date.now();
      rows.push({
        key: `r-${r.id}`,
        severity: overdue ? 'crit' : 'warn',
        ico: 'assignment_return',
        tag: 'Return awaiting inspection',
        body: `${r.variant.sku} × ${r.quantity}`,
        when: overdue ? 'deadline passed' : 'in queue',
        route: '/returns',
      });
    }
    return rows;
  });

  /** Total needing attention. Deliberately uncapped: the badge renders "9+"
      above nine, so clamping here made that branch unreachable and flattened
      50 approvals and 9 approvals to the same "9". */
  readonly attentionCount = computed<number>(() => {
    let n = this.approvals().length;
    n += this.lowStock()?.materials.length ?? 0;
    n += this.lowStock()?.variants.length ?? 0;
    n += this.returnList().length;
    return n;
  });

  toggleBell(): void {
    this.bellOpen.set(!this.bellOpen());
    this.actionsOpen.set(false);
  }
  toggleActions(): void {
    this.actionsOpen.set(!this.actionsOpen());
    this.bellOpen.set(false);
  }
  close(): void {
    this.bellOpen.set(false);
    this.actionsOpen.set(false);
  }
}
