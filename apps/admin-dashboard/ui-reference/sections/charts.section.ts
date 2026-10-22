import { Component } from '@angular/core';
import {
  SeBarChartComponent,
  SeChartSeries,
  SeLineChartComponent,
  SeSparklineComponent,
} from '@seentair/ui';

const naira = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 0,
});
const nairaShort = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  notation: 'compact',
  maximumFractionDigits: 1,
});

@Component({
  selector: 'ref-charts',
  imports: [SeSparklineComponent, SeLineChartComponent, SeBarChartComponent],
  template: `
    <p class="ref-lede">
      Three charts on one scale: the same axes, grid, type and colours wherever they appear. Move
      the pointer over a chart, or focus it and use the arrow keys, to read exact values. Every
      chart also carries its data as a table for screen readers. The app passes its own money
      formatter; the charts never assume a currency.
    </p>

    <h3 class="ref-h3">Sparkline</h3>
    <div class="ref-grid">
      <div class="ref-panel">
        <span class="se-type-caption">Sales, last 30 days</span>
        <div class="se-type-display">{{ money(monthTotal) }}</div>
        <se-sparkline [values]="daily" label="Sales over the last 30 days, rising" />
      </div>
    </div>

    <h3 class="ref-h3">Line chart, one series with area</h3>
    <div class="ref-panel">
      <se-line-chart
        title="Daily sales, September"
        [labels]="days"
        [series]="dailySeries"
        [formatValue]="money"
        area
      />
    </div>

    <h3 class="ref-h3">Line chart, three series</h3>
    <div class="ref-panel">
      <se-line-chart
        title="Weekly revenue by channel"
        [labels]="weeks"
        [series]="channels"
        [formatValue]="moneyShort"
      />
    </div>

    <h3 class="ref-h3">Bar chart, with negative values</h3>
    <div class="ref-panel">
      <se-bar-chart
        title="Monthly profit"
        [labels]="months"
        [values]="profit"
        [formatValue]="moneyShort"
      />
    </div>

    <h3 class="ref-h3">In a card, loading and empty</h3>
    <div class="ref-grid">
      <div class="ref-panel">
        <se-bar-chart
          title="Units produced per week"
          [labels]="weeks"
          [values]="units"
          height="sm"
        />
      </div>
      <div class="ref-panel">
        <se-line-chart title="Daily sales" [labels]="[]" [series]="[]" height="sm" loading />
      </div>
      <div class="ref-panel">
        <se-bar-chart title="Stock by category" [labels]="[]" [values]="[]" height="sm" />
      </div>
    </div>

    <p class="ref-dont">
      <b>Not for:</b> a sparkline where the reader needs a value (it has no axis: put the number
      beside it). A line chart for more than five series, for categories with no order (use bars),
      or for two measures on different scales (use two charts, never two axes). A bar chart for
      parts of a whole, for more than one series, or for more than about 24 bars. Any chart where
      people need to look up exact figures: that is a table.
    </p>
  `,
})
export class ChartsSection {
  readonly money = (n: number): string => naira.format(n);
  readonly moneyShort = (n: number): string => nairaShort.format(n);

  readonly days = Array.from({ length: 30 }, (_, i) => `${i + 1} Sep`);
  /** A month of daily sales: a weekly rhythm on a rising trend, quiet on Sundays. */
  readonly daily = this.days.map((_, i) =>
    Math.round((310 + i * 6 + Math.sin(i * 0.9) * 70 - (i % 7 === 6 ? 150 : 0)) * 1000),
  );
  readonly monthTotal = this.daily.reduce((sum, v) => sum + v, 0);
  readonly dailySeries: SeChartSeries[] = [{ name: 'Sales', values: this.daily }];

  readonly weeks = ['7 Jul', '14 Jul', '21 Jul', '28 Jul', '4 Aug', '11 Aug', '18 Aug', '25 Aug'];
  readonly channels: SeChartSeries[] = [
    {
      name: 'Retail',
      values: [
        1_840_000, 2_010_000, 1_920_000, 2_260_000, 2_480_000, 2_390_000, 2_710_000, 2_950_000,
      ],
    },
    {
      name: 'Wholesale',
      values: [
        2_400_000, 1_650_000, 2_900_000, 2_150_000, 1_980_000, 3_200_000, 2_640_000, 3_050_000,
      ],
    },
    // The shop was closed for refitting in the week of 28 July: a gap, not a zero.
    {
      name: 'In-store',
      values: [620_000, 580_000, 710_000, null, 540_000, 690_000, 760_000, 820_000],
    },
  ];
  readonly units = [1240, 1310, 980, 1420, 1510, 1380, 1620, 1570];

  readonly months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  readonly profit = [
    -420_000, -180_000, 240_000, 610_000, 380_000, -95_000, 720_000, 1_150_000, 940_000, 1_320_000,
    1_680_000, 2_240_000,
  ];
}
