import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  SeActivityComponent,
  SeActivityEntry,
  SeBannerComponent,
  SeBreadcrumb,
  SeButtonDirective,
  SeCardComponent,
  SeConfirmService,
  SeCurrencyService,
  SeEmptyStateComponent,
  SeKvDirective,
  SeKvItemComponent,
  SeMoneyPipe,
  SePageComponent,
  SeSkeletonComponent,
  SeStatusComponent,
  SeToastService,
  formatDate,
} from '@seentair/ui';
import { ApiService, CustomOrder } from '../api.service';
import { customRef } from '../wholesale-format';

type Quote = { amount: number; note: string | null };

/**
 * One custom design request. At each stage the buyer has at most one
 * decision (accept the quote, approve or reject the sample), so the main
 * column holds that decision and the aside holds the facts behind it.
 */
@Component({
  selector: 'app-custom-status',
  imports: [
    SeActivityComponent,
    SeBannerComponent,
    SeButtonDirective,
    SeCardComponent,
    SeEmptyStateComponent,
    SeKvDirective,
    SeKvItemComponent,
    SeMoneyPipe,
    SePageComponent,
    SeSkeletonComponent,
    SeStatusComponent,
  ],
  template: `
    <se-page [title]="ref" [breadcrumbs]="crumbs">
      @if (request(); as req) {
        <se-status sePageStatus kind="custom_order" [value]="req.status" />
      }
      @if (request()) {
        <p sePageMeta>{{ nextStep() }}</p>
      }

      @if (loading()) {
        <se-skeleton shape="detail" />
      } @else if (loadError()) {
        <se-banner
          tone="danger"
          title="The request could not be loaded"
          actionLabel="Try again"
          (action)="load()"
        >
          {{ loadError() }}
        </se-banner>
      } @else if (request(); as req) {
        <div class="se-detail">
          <div class="se-detail__main">
            @if (req.reviewNote) {
              <se-banner tone="info" title="Note from the production desk">
                {{ req.reviewNote }}
              </se-banner>
            }

            @if (req.status === 'quoted') {
              <se-card title="Quotation">
                @if (quote(); as q) {
                  <dl seKv>
                    <div seKvItem label="Production cost" numeric>{{ q.amount | seMoney }}</div>
                    <div seKvItem label="Covers">Raw material, sewing, branding and packaging</div>
                    @if (q.note) {
                      <div seKvItem label="Factory note">{{ q.note }}</div>
                    }
                  </dl>
                  <p class="note">
                    Accepting the quote makes the full amount due upfront. No part-payments.
                  </p>
                } @else {
                  <p class="note">The factory has quoted this request.</p>
                }
                @if (quote(); as q) {
                  <button
                    seButton
                    variant="primary"
                    seCardFooter
                    type="button"
                    [loading]="busy()"
                    (click)="accept(req, q)"
                  >
                    Accept quote
                  </button>
                } @else {
                  <button seButton seCardFooter type="button" (click)="loadQuote(req.id)">
                    View quotation
                  </button>
                }
              </se-card>
            }

            @if (req.status === 'quote_accepted') {
              <se-banner tone="warning" title="Full payment due now">
                Pay the quoted amount by bank transfer or POS; the desk confirms it, then the
                approval sample enters production. No part-payments.
              </se-banner>
            }

            <se-card title="Approval sample">
              @if (req.status === 'sample_in_production') {
                <p class="note">
                  The factory is making one physical sample for you to check seams, prints and
                  fabric weight. Once it reaches you, record your decision here: bulk production
                  only starts after your approval.
                </p>
              } @else if (samplePassed(req.status)) {
                <p class="note">Sample approved. The batch is cleared for production.</p>
              } @else {
                <p class="note">
                  Sample production begins after you accept the quote and the desk confirms full
                  payment.
                </p>
              }
              @if (req.status === 'sample_in_production') {
                <ng-container seCardFooter>
                  <button
                    seButton
                    variant="primary"
                    type="button"
                    [loading]="busy()"
                    (click)="approve(req)"
                  >
                    Approve sample
                  </button>
                  <button seButton type="button" [loading]="busy()" (click)="reject(req)">
                    Request changes
                  </button>
                </ng-container>
              }
            </se-card>

            <se-card title="History">
              <se-activity [entries]="history()" />
            </se-card>
          </div>

          <aside class="se-detail__aside">
            <se-card title="Request">
              <dl seKv>
                <div seKvItem label="Description">{{ req.description }}</div>
                <div seKvItem label="Fabric">{{ req.fabricQuality }}</div>
                <div seKvItem label="Colourways">{{ req.colours }}</div>
                <div seKvItem label="Sizes">{{ req.sizes }}</div>
                <div seKvItem label="Units" numeric>{{ req.quantity }}</div>
                <div seKvItem label="Deliver to">{{ req.location }}</div>
                <div seKvItem label="Wanted by">{{ formatDate(req.desiredDate) }}</div>
                <div seKvItem label="Submitted">{{ formatDate(req.createdAt) }}</div>
                @if (req.paidAt) {
                  <div seKvItem label="Paid">{{ formatDate(req.paidAt) }} (desk-confirmed)</div>
                }
                @if (quote(); as q) {
                  <div seKvItem label="Production cost" numeric>{{ q.amount | seMoney }}</div>
                }
              </dl>
              <p class="note" seCardFooter>
                Full payment is required before production begins. Custom orders are excluded from
                the 12-hour returns window.
              </p>
            </se-card>
          </aside>
        </div>
      } @else {
        <se-empty-state
          heading="Request not found"
          text="It may have been removed, or the link is wrong."
          actionLabel="Back to custom designs"
          (action)="router.navigate(['/custom'])"
        />
      }
    </se-page>
  `,
  styles: [
    `
      .note {
        margin: 0;
      }
      dl + .note {
        margin-top: var(--se-space-4);
      }
    `,
  ],
})
export class CustomStatusPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly confirm = inject(SeConfirmService);
  private readonly toast = inject(SeToastService);
  private readonly currency = inject(SeCurrencyService);
  readonly router = inject(Router);
  readonly formatDate = formatDate;

  readonly id = this.route.snapshot.paramMap.get('id') ?? '';
  readonly ref = customRef(this.id);
  readonly crumbs: SeBreadcrumb[] = [
    { label: 'Custom designs', link: '/custom' },
    { label: this.ref },
  ];

  readonly request = signal<CustomOrder | null>(null);
  readonly quote = signal<Quote | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly busy = signal(false);

  /** What the buyer or the factory does next, in one sentence. */
  readonly nextStep = computed(() => {
    const req = this.request();
    if (!req) return '';
    switch (req.status) {
      case 'submitted':
      case 'under_review':
        return 'The factory is reviewing feasibility; you will be notified when it is quoted.';
      case 'quoted':
        return 'Accept the quotation to move on to payment.';
      case 'quote_accepted':
        return 'Full payment is due now; the sample starts once the desk confirms it.';
      case 'paid':
        return 'Payment confirmed. The factory is preparing your approval sample.';
      case 'sample_in_production':
        return 'Your sample is in production. Approve it or request changes when it arrives.';
      case 'sample_approved':
        return 'Sample approved. The batch is queued for cutting.';
      case 'in_production':
        return 'Your batch is on the factory floor.';
      case 'fulfilled':
      case 'delivered':
        return 'This batch is complete.';
      case 'declined':
        return 'The factory could not take this request.';
      case 'cancelled':
        return 'This request was cancelled.';
      default:
        return '';
    }
  });

  /** Only events with a real timestamp from the API; newest first. */
  readonly history = computed<SeActivityEntry[]>(() => {
    const req = this.request();
    if (!req) return [];
    const entries: SeActivityEntry[] = [{ at: req.createdAt, text: 'Request submitted' }];
    if (req.paidAt) {
      entries.push({
        at: req.paidAt,
        text: 'Full payment confirmed by the desk',
        tone: 'success',
      });
    }
    return entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set('');
    this.api.customOrders().subscribe({
      next: (res) => {
        const req = res.data.find((r) => r.id === this.id) ?? null;
        this.request.set(req);
        this.loading.set(false);
        if (req && !/pending|submitted|under_review|rejected/.test(req.status)) {
          this.api.quotation(req.id).subscribe({
            next: (q) => this.quote.set(q),
            error: () => undefined,
          });
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.loadError.set(err?.error?.message ?? 'The server did not respond.');
      },
    });
  }

  samplePassed(status: string): boolean {
    return /sample_approved|in_production|fulfilled|delivered|completed/.test(status);
  }

  loadQuote(id: string): void {
    this.api.quotation(id).subscribe({
      next: (q) => this.quote.set(q),
      error: (err) =>
        this.toast.show(err?.error?.message ?? 'The quotation is not available yet', {
          tone: 'danger',
        }),
    });
  }

  async accept(req: CustomOrder, q: Quote): Promise<void> {
    const amount = this.currency.format(q.amount);
    const ok = await this.confirm.ask({
      title: `Accept the quote of ${amount}?`,
      consequence: `The full ${amount} becomes due upfront by bank transfer or POS. The approval sample starts once the desk confirms payment.`,
      confirmLabel: 'Accept quote',
    });
    if (!ok) return;
    this.busy.set(true);
    this.api.acceptQuote(req.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.show(`Quote accepted: settle ${amount} with the desk to start the sample`);
        this.reload();
      },
      error: (err) => {
        this.busy.set(false);
        this.toast.show(err?.error?.message ?? 'The quote could not be accepted', {
          tone: 'danger',
          action: { label: 'Try again', run: () => void this.accept(req, q) },
        });
      },
    });
  }

  async approve(req: CustomOrder): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Approve the sample?',
      consequence: `This authorises bulk production of the ${req.quantity}-unit batch and locks the cutting schedule.`,
      confirmLabel: 'Approve sample',
    });
    if (!ok) return;
    this.decide(req, true, undefined);
  }

  async reject(req: CustomOrder): Promise<void> {
    const note = await this.confirm.askWithReason({
      title: 'Request changes to the sample?',
      consequence:
        'The factory reworks the sample from your notes. Bulk production does not start until you approve a sample.',
      confirmLabel: 'Request changes',
      reasonLabel: 'What needs to change',
      danger: true,
    });
    if (note === null) return;
    this.decide(req, false, note.trim() || undefined);
  }

  private decide(req: CustomOrder, approved: boolean, note: string | undefined): void {
    this.busy.set(true);
    this.api.decideSample(req.id, approved, note).subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.show(
          approved
            ? `Sample approved: the ${req.quantity}-unit batch is authorised for production`
            : 'Changes requested: the factory will rework the sample',
        );
        this.reload();
      },
      error: (err) => {
        this.busy.set(false);
        this.toast.show(err?.error?.message ?? 'Your decision could not be recorded', {
          tone: 'danger',
        });
      },
    });
  }

  private reload(): void {
    this.api.customOrders().subscribe({
      next: (res) => this.request.set(res.data.find((r) => r.id === this.id) ?? null),
      error: () => undefined,
    });
  }
}
