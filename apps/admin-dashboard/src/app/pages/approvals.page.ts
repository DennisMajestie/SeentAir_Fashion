import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import {
  SeBannerComponent,
  SeButtonDirective,
  SeCardComponent,
  SeCellDirective,
  SeColumn,
  SeConfirmService,
  SeDatePipe,
  SeEmptyStateComponent,
  SeFilter,
  SeFilterBarComponent,
  SeKvDirective,
  SeKvItemComponent,
  SeMoneyPipe,
  SePageComponent,
  SeSkeletonComponent,
  SeStatusComponent,
  SeTableComponent,
  SeToastService,
} from '@seentair/ui';
import { AccessService } from '../access.service';
import { ApiService, Approval } from '../api.service';
import { urlFilters } from '../url-filters';
import {
  APPROVAL_TYPE_LABEL,
  approvalRef,
  approvalTypeLabel,
  payloadEntries,
  priceChange,
} from './approvals-format';

/**
 * Management approvals: price changes, purchasing, production starts, fund
 * movements and stock disposals wait here until someone with approve access
 * decides. The queue is short and each request is decided from what is shown,
 * so pending requests are cards; past decisions are a table underneath.
 * The gate itself is server-side (architectural principle #3): the API
 * rejects a decision from the requester or from a role without approve access.
 */
@Component({
  selector: 'app-approvals',
  imports: [
    SeBannerComponent,
    SeButtonDirective,
    SeCardComponent,
    SeCellDirective,
    SeDatePipe,
    SeEmptyStateComponent,
    SeFilterBarComponent,
    SeKvDirective,
    SeKvItemComponent,
    SeMoneyPipe,
    SePageComponent,
    SeSkeletonComponent,
    SeStatusComponent,
    SeTableComponent,
  ],
  template: `
    <se-page
      title="Approvals"
      description="Price changes, purchases, production starts and fund movements wait here until management decides."
    >
      <se-filter-bar
        sePageFilters
        searchLabel=""
        [filters]="filters"
        [(value)]="filterValue"
        [summary]="pendingSummary()"
      />

      @if (loading()) {
        <div aria-busy="true"><se-skeleton shape="detail" /></div>
      } @else if (error()) {
        <se-banner
          tone="danger"
          title="Approvals could not be loaded"
          actionLabel="Try again"
          (action)="load()"
        >
          {{ error() }}
        </se-banner>
      } @else if (visible().length === 0) {
        <se-empty-state
          heading="Nothing waiting"
          [text]="
            filterValue()['type']
              ? 'No pending requests of this type. Remove the filter to see every request.'
              : 'Every request has been decided.'
          "
        />
      } @else {
        <div class="queue">
          @for (a of visible(); track a.id) {
            <se-card [title]="typeLabel(a.actionType) + ' ' + ref(a.id)">
              <ng-container seCardActions>
                <se-status kind="approval" [value]="a.status" />
              </ng-container>
              <p>Requested by {{ a.requestedBy.name }} on {{ a.createdAt | seDate: 'datetime' }}</p>
              @if (price(a); as pc) {
                <dl seKv>
                  @if (pc.product) {
                    <div seKvItem label="Product">{{ pc.product }}</div>
                  }
                  <div seKvItem label="Current price" numeric>{{ pc.from | seMoney }}</div>
                  <div seKvItem label="Proposed price" numeric>{{ pc.to | seMoney }}</div>
                  <div seKvItem label="Change" numeric>
                    {{ pc.deltaPct }}% {{ pc.to >= pc.from ? 'increase' : 'decrease' }}
                  </div>
                  @if (pc.saleEndsAt) {
                    <div seKvItem label="Timed sale ends">
                      {{ pc.saleEndsAt | seDate: 'datetime' }} (the normal price returns on its own)
                    </div>
                  }
                </dl>
              } @else {
                <dl seKv>
                  @for (kv of entries(a); track kv[0]) {
                    <div seKvItem [label]="kv[0]">{{ kv[1] }}</div>
                  }
                </dl>
              }
              @if (canDecide) {
                <ng-container seCardFooter>
                  <button seButton variant="danger" type="button" (click)="reject(a)">
                    Reject
                  </button>
                  <button seButton variant="primary" type="button" (click)="approve(a)">
                    Approve
                  </button>
                </ng-container>
              }
            </se-card>
          }
        </div>
      }

      <se-card title="Decision history" flush>
        <se-table
          caption="Decision history"
          [columns]="historyColumns"
          [rows]="history()"
          [loading]="historyLoading()"
          [error]="historyError()"
          (retry)="loadHistory()"
          hideDensity
          emptyHeading="No decisions yet"
          emptyText="Approved and rejected requests are listed here."
        >
          <se-filter-bar
            seTableToolbar
            searchLabel=""
            [filters]="historyFilters"
            [(value)]="historyValue"
          />
          <ng-template seCell="status" let-row>
            <se-status kind="approval" [value]="row.status" />
          </ng-template>
          <ng-template seCell="when" let-row>{{ row.createdAt | seDate: 'datetime' }}</ng-template>
        </se-table>
      </se-card>
    </se-page>
  `,
  styles: [
    `
      .queue {
        display: grid;
        gap: var(--se-space-4);
        margin-bottom: var(--se-space-6);
      }
    `,
  ],
})
export class ApprovalsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly access = inject(AccessService);
  private readonly confirm = inject(SeConfirmService);
  private readonly toast = inject(SeToastService);

  /** Deciding needs approve access on the module; the API checks this too. */
  readonly canDecide = this.access.can('approvals_audit', 'approve');

  readonly approvals = signal<Approval[]>([]);
  /** True only until the first answer arrives. */
  readonly loading = signal(true);
  readonly error = signal('');
  readonly history = signal<Approval[]>([]);
  readonly historyLoading = signal(true);
  readonly historyError = signal('');

  // ---- filters, mirrored in the URL ----
  private readonly urlState = urlFilters(['type']);
  readonly filterValue = this.urlState.value;
  readonly filters: SeFilter[] = [
    {
      key: 'type',
      label: 'Type',
      options: Object.entries(APPROVAL_TYPE_LABEL).map(([value, label]) => ({ value, label })),
    },
  ];
  /** The history's own filter, applied by the server. */
  readonly historyValue = signal<Record<string, string>>({});
  readonly historyFilters: SeFilter[] = [
    {
      key: 'decision',
      label: 'Decision',
      options: [
        { value: 'approved', label: 'Approved' },
        { value: 'rejected', label: 'Rejected' },
      ],
    },
  ];

  readonly visible = computed(() => {
    const t = this.filterValue()['type'];
    return t ? this.approvals().filter((a) => a.actionType === t) : this.approvals();
  });
  readonly pendingSummary = computed(() => {
    const n = this.visible().length;
    return `${n} pending ${n === 1 ? 'request' : 'requests'}`;
  });

  readonly historyColumns: SeColumn<Approval>[] = [
    { key: 'ref', header: 'Request', value: (a) => approvalRef(a.id) },
    { key: 'type', header: 'Type', value: (a) => approvalTypeLabel(a.actionType) },
    { key: 'requestedBy', header: 'Requested by', value: (a) => a.requestedBy.name },
    { key: 'status', header: 'Decision', value: (a) => a.status },
    { key: 'when', header: 'Requested', value: (a) => a.createdAt },
  ];

  private lastDecision = '';

  readonly typeLabel = approvalTypeLabel;
  readonly ref = approvalRef;
  readonly price = priceChange;
  readonly entries = payloadEntries;

  ngOnInit(): void {
    this.load();
    this.loadHistory();
  }

  load(): void {
    this.api.pendingApprovals().subscribe({
      next: (a) => {
        this.approvals.set(a);
        this.loading.set(false);
        this.error.set('');
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(
          err?.error?.message ?? 'The server did not respond. Nothing has been changed.',
        );
      },
    });
  }

  loadHistory(): void {
    const decision = this.historyValue()['decision'] ?? '';
    this.lastDecision = decision;
    this.api.approvalsHistory(decision || undefined).subscribe({
      next: (res) => {
        this.history.set(res.data);
        this.historyLoading.set(false);
        this.historyError.set('');
      },
      error: (err) => {
        this.historyLoading.set(false);
        this.historyError.set(err?.error?.message ?? 'The server did not respond.');
      },
    });
  }

  constructor() {
    // The history is filtered by the server, so a changed decision filter re-reads it.
    effect(() => {
      const decision = this.historyValue()['decision'] ?? '';
      untracked(() => {
        if (decision !== this.lastDecision) this.loadHistory();
      });
    });
  }

  async approve(a: Approval): Promise<void> {
    const label = `${approvalTypeLabel(a.actionType).toLowerCase()} ${approvalRef(a.id)}`;
    const ok = await this.confirm.ask({
      title: `Approve ${label}?`,
      consequence: `The ${approvalTypeLabel(a.actionType).toLowerCase()} requested by ${a.requestedBy.name} goes ahead. The decision is written to the audit log and cannot be withdrawn.`,
      confirmLabel: 'Approve request',
    });
    if (!ok) return;
    this.decide(a, 'approved', '');
  }

  async reject(a: Approval): Promise<void> {
    const label = `${approvalTypeLabel(a.actionType).toLowerCase()} ${approvalRef(a.id)}`;
    const reason = await this.confirm.askWithReason({
      title: `Reject ${label}?`,
      consequence: `${a.requestedBy.name} will have to raise a new request. The rejection and your reason are written to the audit log and cannot be withdrawn.`,
      confirmLabel: 'Reject request',
      reasonLabel: 'Reason for rejection',
      danger: true,
    });
    if (reason === null) return;
    this.decide(a, 'rejected', reason);
  }

  private decide(a: Approval, decision: 'approved' | 'rejected', justification: string): void {
    const label = `${approvalTypeLabel(a.actionType)} ${approvalRef(a.id)}`;
    // An approval carries no reason, so it is posted without the field entirely
    // rather than as an empty string, which the server reads as "a reason was
    // given but is blank".
    const call$ = justification
      ? this.api.decideApprovalWithJustification(a.id, decision, justification)
      : this.api.decideApproval(a.id, decision);
    call$.subscribe({
      next: () => {
        this.toast.show(`${label} ${decision}`);
        this.load();
        this.loadHistory();
      },
      error: (err) =>
        this.toast.show(err?.error?.message ?? `${label} could not be ${decision}`, {
          tone: 'danger',
          action: {
            label: 'Try again',
            run: () => (decision === 'approved' ? void this.approve(a) : void this.reject(a)),
          },
        }),
    });
  }
}
