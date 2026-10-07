import { Component, ElementRef, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeButtonDirective, SeIconComponent, SeIconName } from '@seentair/ui';
import { AccessNeed, AccessService } from './access.service';
import { ApiService, Approval, LowStock, ReturnRequest } from './api.service';

interface AttentionRow {
  key: string;
  severity: 'crit' | 'warn' | 'info';
  tag: string;
  body: string;
  when: string;
  route: string;
}

interface ActionRow {
  label: string;
  route: string;
  icon: SeIconName;
  hint: string;
  /** The API module and level the action needs; it is offered only to a role that has it. */
  module: string;
  need: AccessNeed;
}

const QUICK_ACTIONS: ActionRow[] = [
  {
    label: 'Start a production batch',
    route: '/production',
    icon: 'factory',
    hint: 'Plan a run',
    module: 'manufacturing',
    need: 'full',
  },
  {
    label: 'Add a product',
    route: '/catalogue',
    icon: 'tag',
    hint: 'New product, sizes and price',
    module: 'catalogue',
    need: 'full',
  },
  {
    label: 'Record a material purchase',
    route: '/materials',
    icon: 'layers',
    hint: 'Stock coming in',
    module: 'raw_materials',
    need: 'full',
  },
  {
    label: 'Post a ledger entry',
    route: '/accounting',
    icon: 'bank',
    hint: 'Manual income or spending',
    module: 'accounting',
    need: 'full',
  },
  {
    label: 'Create a delivery',
    route: '/logistics',
    icon: 'truck',
    hint: 'New waybill',
    module: 'logistics',
    need: 'full',
  },
  {
    label: 'Create a custom request',
    route: '/custom-orders',
    icon: 'edit',
    hint: 'Made-to-order',
    module: 'custom_orders',
    need: 'full',
  },
  {
    label: 'Add a staff member',
    route: '/staff',
    icon: 'user',
    hint: 'New account',
    module: 'staff_access',
    need: 'full',
  },
  {
    label: 'Create a wholesale tier',
    route: '/wholesale',
    icon: 'users',
    hint: 'Price band',
    module: 'wholesale_orders',
    need: 'full',
  },
];

/**
 * The top bar's two shortcuts: a bell listing what needs this person, from any
 * screen, and a menu of quick actions.
 *
 * Both are cut to the role. The bell only asks the API about queues the role
 * can see (approvals, stock levels, returns), and the quick actions only list
 * what the role may do; with none to offer, that button is not shown.
 *
 * A queue that could not be read is never treated as empty: the bell shows "!"
 * and says which source failed, so a network fault cannot read as "all clear".
 */
@Component({
  selector: 'app-opsbar',
  imports: [RouterLink, SeButtonDirective, SeIconComponent],
  styles: [
    `
      .ops {
        display: flex;
        align-items: center;
        gap: var(--se-space-1);
      }
      .ops__cell {
        position: relative;
      }
      .ops__panel {
        top: calc(100% + var(--se-space-2));
        width: var(--se-size-drawer);
      }
      /* The count on the bell. */
      .ops__count {
        position: absolute;
        top: 0;
        right: 0;
        display: grid;
        place-items: center;
        min-width: var(--se-space-5);
        height: var(--se-space-5);
        padding: 0 var(--se-space-1);
        border-radius: var(--se-radius-pill);
        background: var(--se-color-danger-solid);
        color: var(--se-color-on-danger);
        font: var(--se-type-overline);
        font-variant-numeric: var(--se-font-numeric);
        letter-spacing: 0;
      }
      .ops__count--unknown {
        background: var(--se-color-warning-border);
      }
    `,
  ],
  template: `
    <div class="ops">
      <div class="ops__cell">
        <button
          seButton
          variant="ghost"
          iconOnly
          class="ops__trigger"
          type="button"
          [attr.aria-expanded]="bellOpen()"
          aria-label="Needs your attention"
          title="Needs your attention"
          (click)="toggleBell()"
        >
          <se-icon name="bell" />
          @if (degraded()) {
            <span
              class="ops__count ops__count--unknown"
              [title]="
                blind()
                  ? 'Cannot reach the server, so this count is unknown'
                  : 'Partly loaded: ' + degradedSources() + ' could not be read'
              "
              >!</span
            >
          } @else if (attentionCount() > 0) {
            <span class="ops__count">{{ attentionCount() > 9 ? '9+' : attentionCount() }}</span>
          }
        </button>

        @if (bellOpen()) {
          <div
            class="se-popover se-popover--end ops__panel"
            role="region"
            aria-label="Needs your attention"
          >
            @if (degraded()) {
              <p class="se-popover__note" role="status">
                @if (blind()) {
                  Cannot reach the server. Nothing below can be confirmed, so this is not an all
                  clear.
                } @else {
                  Could not read {{ degradedSources() }}. Anything not listed may still need you.
                }
              </p>
            }
            @for (it of attentionRows(); track it.key) {
              <a class="se-popover__item" [routerLink]="it.route" (click)="close()">
                <span
                  class="se-popover__mark"
                  [class.se-popover__mark--danger]="it.severity === 'crit'"
                  [class.se-popover__mark--warning]="it.severity === 'warn'"
                  [class.se-popover__mark--info]="it.severity === 'info'"
                  aria-hidden="true"
                ></span>
                <span class="se-popover__main">
                  <span class="se-popover__title">{{ it.tag }}</span>
                  <span class="se-popover__text"
                    >{{ it.body }}{{ it.when ? ', ' + it.when : '' }}</span
                  >
                </span>
              </a>
            }
            @if (attentionRows().length === 0) {
              @if (degraded()) {
                <p class="se-popover__note">Nothing confirmed yet. The note above explains why.</p>
              } @else {
                <p class="se-popover__note">All clear: nothing needs you right now.</p>
              }
            }
          </div>
        }
      </div>

      @if (quickActions().length > 0) {
        <div class="ops__cell">
          <button
            seButton
            variant="ghost"
            iconOnly
            type="button"
            [attr.aria-expanded]="actionsOpen()"
            aria-label="Quick actions"
            title="Quick actions"
            (click)="toggleActions()"
          >
            <se-icon name="plus" />
          </button>

          @if (actionsOpen()) {
            <div
              class="se-popover se-popover--end ops__panel"
              role="region"
              aria-label="Quick actions"
            >
              @for (a of quickActions(); track a.route + a.label) {
                <a class="se-popover__item" [routerLink]="a.route" (click)="close()">
                  <se-icon [name]="a.icon" />
                  <span class="se-popover__main">
                    <span class="se-popover__title">{{ a.label }}</span>
                    <span class="se-popover__text">{{ a.hint }}</span>
                  </span>
                </a>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class AppOpsbarComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly access = inject(AccessService);
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
  /** Only the actions this role may take. */
  readonly quickActions = computed(() =>
    QUICK_ACTIONS.filter((a) => this.access.can(a.module, a.need)),
  );
  /** Which queues this role can see; the others are never asked for or counted. */
  private readonly seesApprovals = computed(() => this.access.can('approvals_audit', 'approve'));
  private readonly seesStock = computed(() => this.access.can('analytics'));
  private readonly seesReturns = computed(() => this.access.can('returns'));
  private timer?: ReturnType<typeof setInterval>;
  private onPointer: (e: PointerEvent) => void;
  private onKey: (e: KeyboardEvent) => void;

  /** Any source behind us right now, so the counts are incomplete. */
  readonly degraded = computed<boolean>(
    () => this.approvalsFailed() || this.lowStockFailed() || this.returnsFailed(),
  );

  /** Every queue this role can see is behind us. The bell must not read "all clear" then. */
  readonly blind = computed<boolean>(() => {
    const asked = [
      [this.seesApprovals(), this.approvalsFailed()],
      [this.seesStock(), this.lowStockFailed()],
      [this.seesReturns(), this.returnsFailed()],
    ].filter(([sees]) => sees);
    return asked.length > 0 && asked.every(([, failed]) => failed);
  });

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
    this.onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') this.close();
    };
  }

  ngOnInit(): void {
    this.refresh();
    this.timer = setInterval(() => this.refresh(), 60000);
    document.addEventListener('pointerdown', this.onPointer);
    document.addEventListener('keydown', this.onKey);
  }
  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    document.removeEventListener('pointerdown', this.onPointer);
    document.removeEventListener('keydown', this.onKey);
  }

  private refresh(): void {
    // Each source clears its own flag on success, so a blip that resolves on
    // the next 60s tick stops showing as degraded without a full reload.
    if (this.seesApprovals()) {
      this.api.pendingApprovals().subscribe({
        next: (a) => {
          this.approvals.set(a);
          this.approvalsFailed.set(false);
        },
        error: () => this.approvalsFailed.set(true),
      });
    }
    if (this.seesStock()) {
      this.api.lowStock().subscribe({
        next: (ls) => {
          this.lowStock.set(ls);
          this.lowStockFailed.set(false);
        },
        error: () => this.lowStockFailed.set(true),
      });
    }
    if (this.seesReturns()) {
      this.api.returns().subscribe({
        next: (r) => {
          this.returnList.set(r.data.filter((x) => x.status === 'requested'));
          this.returnsFailed.set(false);
        },
        error: () => this.returnsFailed.set(true),
      });
    }
  }

  readonly attentionRows = computed<AttentionRow[]>(() => {
    const rows: AttentionRow[] = [];
    for (const a of this.approvals().slice(0, 3)) {
      rows.push({
        key: `a-${a.id}`,
        severity: 'warn',
        tag: `${sentence(String(a.actionType ?? 'request'))} awaiting approval`,
        body: `Requested by ${a.requestedBy?.name ?? 'a member of staff'}`,
        when: '',
        route: '/approvals',
      });
    }
    if (this.approvals().length > 3) {
      rows.push({
        key: 'a-more',
        severity: 'info',
        tag: 'More requests are waiting',
        body: `${this.approvals().length - 3} more in the approvals queue`,
        when: '',
        route: '/approvals',
      });
    }
    const ls = this.lowStock();
    for (const m of (ls?.materials ?? []).slice(0, 2)) {
      rows.push({
        key: `m-${m.id}`,
        severity: 'crit',
        tag: `${m.name} is running low`,
        body: `${m.currentQuantity} ${m.unit ?? ''} left`.trim(),
        when: `reorder at ${m.reorderThreshold}`,
        route: '/materials',
      });
    }
    if ((ls?.variants.length ?? 0) > 0) {
      rows.push({
        key: 'v-low',
        severity: 'warn',
        tag: 'Product stock is low',
        body: `${ls!.variants.length} ${ls!.variants.length === 1 ? 'size is' : 'sizes are'} at or below ${ls!.variantThreshold} units`,
        when: '',
        route: '/inventory',
      });
    }
    for (const r of this.returnList().slice(0, 2)) {
      const overdue = new Date(r.returnDeadline).getTime() < Date.now();
      rows.push({
        key: `r-${r.id}`,
        severity: overdue ? 'crit' : 'warn',
        tag: 'Return waiting to be checked',
        body: `${r.variant.sku}, ${r.quantity} ${r.quantity === 1 ? 'unit' : 'units'}`,
        when: overdue ? 'deadline passed' : '',
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

/** "price_change" -> "Price change". */
function sentence(text: string): string {
  const words = text.replace(/_/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : '';
}
