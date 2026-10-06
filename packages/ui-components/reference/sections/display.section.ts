import { Component, inject } from '@angular/core';
import {
  SE_STATUS,
  SeBadgeComponent,
  SeButtonDirective,
  SeCardComponent,
  SeCurrencyService,
  SeMetricCardComponent,
  SeMoneyPipe,
  SeStatusComponent,
  SeStatusKind,
} from '@seentair/ui';

@Component({
  selector: 'ref-display',
  imports: [
    SeBadgeComponent,
    SeButtonDirective,
    SeCardComponent,
    SeMetricCardComponent,
    SeMoneyPipe,
    SeStatusComponent,
  ],
  template: `
    <h3 class="ref-h3">Status badge: the fixed mapping from domain state to wording and colour</h3>
    <p class="ref-lede">
      Each state the API can send is defined once. An order that is "awaiting payment" is the same
      words and the same colour in admin, wholesale and partner.
    </p>
    <div class="ref-panel">
      @for (kind of kinds; track kind) {
        <div class="ref-row">
          <span class="ref-tag">{{ kind }}</span>
          @for (value of valuesOf(kind); track value) {
            <se-status [kind]="kind" [value]="value" />
          }
        </div>
      }
      <div class="ref-row">
        <span class="ref-tag">free badge</span>
        <se-badge>Draft</se-badge>
        <se-badge tone="info">New</se-badge>
        <se-badge tone="success">Verified</se-badge>
        <se-badge tone="warning">Expiring</se-badge>
        <se-badge tone="danger">Overdue</se-badge>
        <se-status kind="order" value="a_state_added_later" />
      </div>
    </div>
    <p class="ref-dont">
      <b>Not for:</b> counts (use a number), or a sentence. Do not pick a tone by hand for a
      domain state: use se-status so the mapping stays in one place.
    </p>

    <h3 class="ref-h3">Metric card</h3>
    <div class="ref-grid">
      <se-metric-card
        label="Sales today"
        [value]="1284500 | seMoney"
        [change]="12.4"
        changeLabel="vs yesterday"
        [trend]="sales"
        trendLabel="Sales over the last 14 days, rising"
      />
      <se-metric-card
        label="Profit this month"
        [value]="-218000 | seMoney"
        [change]="-8.1"
        changeLabel="vs last month"
        [trend]="profit"
        trendLabel="Profit over the last 14 days, falling"
      />
      <se-metric-card
        label="Low-stock items"
        value="7"
        [change]="-22.2"
        changeLabel="vs last week"
        goodDirection="down"
      />
      <se-metric-card label="Awaiting approval" value="3" hint="Oldest request: 2 days" />
    </div>
    <p class="ref-dont">
      <b>Not for:</b> more than one number, or a value with no comparison and no context. Where a
      fall is the good news (returns, costs, low stock), set goodDirection="down" so it is not
      shown in red.
    </p>

    <h3 class="ref-h3">Content card</h3>
    <div class="ref-grid">
      <se-card title="Production status">
        <button seButton size="sm" seCardActions>View all</button>
        <p class="se-type-body">Batch 0412 is at sewing. Two batches are waiting for quality check.</p>
        <ng-container seCardFooter>
          <button seButton>Cancel</button>
          <button seButton variant="primary">Start batch</button>
        </ng-container>
      </se-card>
      <se-card>
        <p class="se-type-body">A card with no header or footer is just a bordered surface.</p>
      </se-card>
    </div>
    <p class="ref-dont">
      <b>Not for:</b> wrapping every block on a page. A card groups related content that could
      stand alone; nested cards and cards around a single field are noise.
    </p>

    <h3 class="ref-h3">Money</h3>
    <div class="ref-panel">
      <div class="ref-row">
        <span class="ref-tag">seMoney</span>
        <span class="se-num">{{ 1284500 | seMoney }}</span>
        <span class="se-num">{{ 4999.5 | seMoney: 2 }}</span>
        <span class="se-num">{{ -1200 | seMoney }}</span>
        <button seButton size="sm" (click)="switchCurrency()">Switch configured currency</button>
      </div>
    </div>
    <p class="ref-dont">
      <b>Not for:</b> typing a currency symbol into a template. The symbol is configuration: it
      comes from the API and this pipe is the only place it is printed.
    </p>
  `,
})
export class DisplaySection {
  private readonly currency = inject(SeCurrencyService);
  readonly kinds = Object.keys(SE_STATUS) as SeStatusKind[];
  readonly sales = [62, 58, 71, 69, 80, 77, 85, 91, 88, 97, 104, 99, 112, 128];
  readonly profit = [40, 44, 39, 35, 37, 30, 28, 31, 24, 22, 25, 18, 15, 12];

  valuesOf(kind: SeStatusKind): string[] {
    // One badge per distinct wording: some states are aliases of each other.
    const seen = new Set<string>();
    return Object.keys(SE_STATUS[kind]).filter((key) => {
      const label = SE_STATUS[kind][key].label;
      return seen.has(label) ? false : !!seen.add(label);
    });
  }

  /** Demonstrates that the symbol is data: nothing in the templates changes. */
  switchCurrency(): void {
    const naira = this.currency.config()?.currencyCode === 'NGN';
    this.currency.config.set(
      naira
        ? { currencyCode: 'GHS', currencySymbol: 'GH₵', locale: 'en-GH' }
        : { currencyCode: 'NGN', currencySymbol: '₦', locale: 'en-NG' },
    );
  }
}
