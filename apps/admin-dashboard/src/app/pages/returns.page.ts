import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  SE_STATUS,
  SeBadgeComponent,
  SeButtonDirective,
  SeCellDirective,
  SeColumn,
  SeConfirmService,
  SeCurrencyService,
  SeDatePipe,
  SeDrawerComponent,
  SeFieldComponent,
  SeFilter,
  SeFilterBarComponent,
  SeInputDirective,
  SeKvDirective,
  SeKvItemComponent,
  SeMetricCardComponent,
  SeMoneyPipe,
  SePageComponent,
  SeStatusComponent,
  SeTableComponent,
  SeToastService,
} from '@seentair/ui';
import { AccessService } from '../access.service';
import { ApiService, ReturnRequest } from '../api.service';
import { urlFilters } from '../url-filters';
import { countOf, deadlineLabel, isOverdue, shortRef } from './ops-format';

/**
 * Returns: what customers have asked to send back, and the inspection that
 * closes each one. The 12-hour request and 24-hour completion windows, and the
 * exclusion of custom orders, are enforced by the API.
 *
 * Resolving a return moves stock and money, so both outcomes are confirmed.
 */
@Component({
  selector: 'app-returns',
  imports: [
    FormsModule,
    SeBadgeComponent,
    SeButtonDirective,
    SeCellDirective,
    SeDatePipe,
    SeDrawerComponent,
    SeFieldComponent,
    SeFilterBarComponent,
    SeInputDirective,
    SeKvDirective,
    SeKvItemComponent,
    SeMetricCardComponent,
    SeMoneyPipe,
    SePageComponent,
    SeStatusComponent,
    SeTableComponent,
  ],
  template: `
    <se-page
      title="Returns"
      description="A customer must ask within 12 hours of receiving an order, and the return must be completed within 24 hours. Custom orders cannot be returned."
    >
      <div class="se-metric-grid">
        <se-metric-card label="Waiting for inspection" [value]="pending().length" [hint]="pendingUnits()" />
        <se-metric-card label="Past the deadline" [value]="overdueCount()" hint="Open returns older than 24 hours" />
        <se-metric-card label="Refunds at stake" [value]="exposure() | seMoney" hint="On returns not yet resolved" />
        <se-metric-card label="All returns" [value]="returns().length" hint="Latest loaded" />
      </div>

      <se-table
        caption="Returns"
        [columns]="columns"
        [rows]="rows()"
        [loading]="loading()"
        [error]="error()"
        (retry)="load()"
        [pageSize]="25"
        activatable
        (rowActivate)="open($event)"
        [emptyHeading]="filtering() ? 'No returns match these filters' : 'No returns yet'"
        [emptyText]="
          filtering()
            ? 'Remove a filter, or clear them all to see every return.'
            : 'A return appears here when a customer asks to send an item back.'
        "
        [emptyActionLabel]="filtering() ? 'Clear all filters' : ''"
        (emptyAction)="clearFilters()"
      >
        <se-filter-bar
          seTableToolbar
          searchLabel="Search returns"
          searchPlaceholder="Return ref, SKU or reason"
          [(query)]="query"
          [filters]="filters"
          [(value)]="filterValue"
          [summary]="summary()"
        />
        <ng-template seCell="requested" let-row>{{ row.requestedAt | seDate: 'datetime' }}</ng-template>
        <ng-template seCell="deadline" let-row>
          @if (row.status === 'requested') {
            <se-badge [tone]="overdue(row) ? 'danger' : 'warning'">{{ deadline(row) }}</se-badge>
          } @else {
            {{ row.returnDeadline | seDate: 'datetime' }}
          }
        </ng-template>
        <ng-template seCell="status" let-row>
          <se-status kind="return" [value]="row.status" />
        </ng-template>
      </se-table>

      <se-drawer [title]="drawerTitle()" [open]="!!selected()" (openChange)="$event || close()">
        @if (selected(); as r) {
          <dl seKv>
            <div seKvItem label="Status"><se-status kind="return" [value]="r.status" /></div>
            <div seKvItem label="Item">{{ r.variant.sku }}</div>
            <div seKvItem label="Quantity" numeric>{{ r.quantity }}</div>
            <div seKvItem label="Order">#{{ r.order.id.slice(0, 8).toUpperCase() }}</div>
            @if (r.refundAmount != null) {
              <div seKvItem label="Refund" numeric>{{ r.refundAmount | seMoney: 2 }}</div>
            }
            <div seKvItem label="Reason">{{ r.reason }}</div>
            <div seKvItem label="Requested">{{ r.requestedAt | seDate: 'datetime' }}</div>
            <div seKvItem label="Return due">
              {{ r.returnDeadline | seDate: 'datetime' }}
              @if (r.status === 'requested') {
                ({{ deadline(r) }})
              }
            </div>
            @if (r.bayTag) {
              <div seKvItem label="Quarantine bay">{{ r.bayTag }}</div>
            }
            @if (r.photoUrls?.length) {
              <div seKvItem label="Photos">
                @for (u of r.photoUrls; track u) {
                  <a [href]="u" target="_blank" rel="noopener">Photo {{ $index + 1 }}</a>
                }
              </div>
            }
          </dl>

          @if (r.status === 'requested' && canResolve) {
            <form class="se-form" (ngSubmit)="resolve('restocked')">
              <se-field
                label="Inspection note"
                hint="What you found, for example: tags intact, or seam torn"
                [error]="noteError()"
              >
                <textarea seInput rows="2" name="note" [(ngModel)]="note"></textarea>
              </se-field>
              <se-field label="Photo links" hint="Separate several links with commas" optional>
                <input seInput name="photos" [(ngModel)]="photos" />
              </se-field>
              <se-field label="Quarantine bay" hint="The tag attached to the item" optional>
                <input seInput name="bay" [(ngModel)]="bay" />
              </se-field>
            </form>
          } @else if (r.status !== 'requested') {
            <p>This return is closed. The outcome is recorded in inventory and in the activity log.</p>
          }
        }
        <ng-container seDrawerFooter>
          <button seButton type="button" (click)="close()">
            {{ canAct() ? 'Cancel' : 'Close' }}
          </button>
          @if (canAct()) {
            <button seButton variant="danger" type="button" [loading]="saving()" (click)="resolve('damaged')">
              Write off as damaged
            </button>
            <button seButton variant="primary" type="button" [loading]="saving()" (click)="resolve('restocked')">
              Restock item
            </button>
          }
        </ng-container>
      </se-drawer>
    </se-page>
  `,
})
export class ReturnsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly access = inject(AccessService);
  private readonly confirm = inject(SeConfirmService);
  private readonly toast = inject(SeToastService);
  private readonly currency = inject(SeCurrencyService);

  /** Resolving is PATCH /returns/:id/resolve, which needs full access to returns. */
  readonly canResolve = this.access.can('returns', 'full');

  readonly returns = signal<ReturnRequest[]>([]);
  /** True only until the first answer arrives; a refresh keeps the rows on screen. */
  readonly loading = signal(true);
  readonly error = signal('');
  readonly selected = signal<ReturnRequest | null>(null);
  readonly saving = signal(false);
  readonly noteError = signal('');
  note = '';
  photos = '';
  bay = '';

  private readonly urlState = urlFilters(['status']);
  readonly query = this.urlState.query;
  readonly filterValue = this.urlState.value;
  readonly filters: SeFilter[] = [
    {
      key: 'status',
      label: 'Status',
      options: Object.entries(SE_STATUS.return).map(([value, m]) => ({ value, label: m.label })),
    },
  ];
  readonly filtering = computed(
    () => !!this.query().trim() || Object.keys(this.filterValue()).length > 0,
  );
  readonly rows = computed(() => {
    const status = this.filterValue()['status'];
    const q = this.query().trim().toLowerCase();
    return this.returns().filter((r) => {
      if (status && r.status !== status) return false;
      if (!q) return true;
      return [r.id, shortRef('RET', r.id), r.variant.sku, r.reason, r.status].some((v) =>
        v.toLowerCase().includes(q),
      );
    });
  });
  readonly summary = computed(() => countOf(this.rows().length, 'return'));

  readonly columns: SeColumn<ReturnRequest>[] = [
    { key: 'ref', header: 'Return', value: (r) => shortRef('RET', r.id) },
    { key: 'item', header: 'Item', sortable: true, value: (r) => r.variant.sku },
    { key: 'quantity', header: 'Quantity', numeric: true, sortable: true, value: (r) => r.quantity },
    { key: 'reason', header: 'Reason', value: (r) => r.reason },
    { key: 'requested', header: 'Requested', sortable: true, value: (r) => r.requestedAt },
    { key: 'deadline', header: 'Return due', sortable: true, value: (r) => r.returnDeadline },
    { key: 'status', header: 'Status', sortable: true, value: (r) => r.status },
  ];

  // ---- metrics ----
  readonly pending = computed(() => this.returns().filter((r) => r.status === 'requested'));
  readonly pendingUnits = computed(() =>
    countOf(
      this.pending().reduce((sum, r) => sum + r.quantity, 0),
      'unit',
    ) + ' held back from stock',
  );
  readonly overdueCount = computed(() => this.pending().filter((r) => this.overdue(r)).length);
  readonly exposure = computed(() =>
    this.pending().reduce((sum, r) => sum + (Number(r.refundAmount) || 0), 0),
  );

  readonly drawerTitle = computed(() => {
    const r = this.selected();
    return r ? `Return ${shortRef('RET', r.id)}` : 'Return';
  });
  readonly canAct = computed(() => this.canResolve && this.selected()?.status === 'requested');

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.returns().subscribe({
      next: (res) => {
        this.returns.set(res.data);
        this.loading.set(false);
        this.error.set('');
        const open = this.selected();
        if (open) this.selected.set(res.data.find((r) => r.id === open.id) ?? null);
      },
      error: (err) => {
        this.loading.set(false);
        // A failed refresh must not wipe a list that is already on screen.
        if (this.returns().length === 0) {
          this.error.set(
            err?.error?.message ?? 'The server did not respond. Nothing has been changed.',
          );
        }
      },
    });
  }

  overdue(r: ReturnRequest): boolean {
    return isOverdue(r.returnDeadline);
  }
  deadline(r: ReturnRequest): string {
    return deadlineLabel(r.returnDeadline);
  }

  open(r: ReturnRequest): void {
    this.note = this.photos = this.bay = '';
    this.noteError.set('');
    this.selected.set(r);
  }
  close(): void {
    this.selected.set(null);
  }
  clearFilters(): void {
    this.query.set('');
    this.filterValue.set({});
  }

  /** Closes the return either way: the units go back into stock, or are written off. */
  async resolve(disposition: 'restocked' | 'damaged'): Promise<void> {
    const r = this.selected();
    if (!r || !this.canAct()) return;
    const note = this.note.trim();
    if (!note) {
      this.noteError.set('Write what you found when you inspected the item.');
      return;
    }
    this.noteError.set('');
    const ref = shortRef('RET', r.id);
    const units = `${countOf(r.quantity, 'unit')} of ${r.variant.sku}`;
    const refund =
      r.refundAmount != null
        ? `A refund of ${this.currency.format(Number(r.refundAmount), 2)} is recorded.`
        : 'The refund is recorded.';
    const restock = disposition === 'restocked';
    const ok = await this.confirm.ask({
      title: restock ? `Restock return ${ref}?` : `Write off return ${ref} as damaged?`,
      consequence:
        (restock
          ? `${units} go back into sellable stock. `
          : `${units} are written off as damaged and never return to stock. `) +
        `${refund} This is audited and cannot be undone.`,
      confirmLabel: restock ? 'Restock item' : 'Write off as damaged',
      danger: !restock,
    });
    if (!ok) return;
    const photos = this.photos
      .split(',')
      .map((u) => u.trim())
      .filter((u) => u.length > 0);
    this.saving.set(true);
    this.api
      .resolveReturnWithEvidence(r.id, note, disposition, photos, this.bay.trim() || undefined)
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.close();
          this.toast.show(restock ? `Return ${ref} restocked` : `Return ${ref} written off`);
          this.load();
        },
        error: (err) => {
          this.saving.set(false);
          this.toast.show(err?.error?.message ?? `Return ${ref} could not be resolved`, {
            tone: 'danger',
            action: { label: 'Try again', run: () => void this.resolve(disposition) },
          });
        },
      });
  }
}
