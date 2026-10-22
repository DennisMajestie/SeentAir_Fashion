import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SeChartSeries } from './chart-base';
import { SeLineChartComponent } from './line-chart.component';

@Component({
  imports: [SeLineChartComponent],
  template: `
    <div style="width: 600px">
      <se-line-chart
        title="Revenue by channel"
        [labels]="labels()"
        [series]="series()"
        [formatValue]="money"
        [area]="area()"
        [loading]="loading()"
      />
    </div>
  `,
})
class Host {
  readonly labels = signal(['Mon', 'Tue', 'Wed', 'Thu']);
  readonly series = signal<SeChartSeries[]>([
    { name: 'Retail', values: [1200, 1800, 1500, 2100] },
    { name: 'Wholesale', values: [900, null, 2400, 1700] },
  ]);
  readonly area = signal(false);
  readonly loading = signal(false);
  readonly money = (n: number): string => `N${n.toFixed(0)}`;
}

/** The chart draws at its measured width, and a ResizeObserver reports that asynchronously. */
export async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 3; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((done) => requestAnimationFrame(() => done(null)));
  }
  fixture.detectChanges();
}

describe('se-line-chart', () => {
  const setup = async (change?: (host: Host) => void) => {
    const fixture = TestBed.createComponent(Host);
    change?.(fixture.componentInstance);
    await settle(fixture);
    const el = fixture.nativeElement as HTMLElement;
    const press = async (key: string) => {
      el.querySelector('.se-chart__plot')!.dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true }),
      );
      await settle(fixture);
    };
    return { fixture, el, press, host: fixture.componentInstance };
  };

  it('draws at the real width of its container, hidden from assistive technology', async () => {
    const { el } = await setup();
    const svg = el.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('600');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.hasAttribute('preserveAspectRatio')).toBeFalse();
  });

  it('draws one line per series, each in its own colour, and breaks a line at a gap', async () => {
    const { el } = await setup();
    const lines = [...el.querySelectorAll('path.se-line-chart__line')];
    expect(lines.length).toBe(2);
    expect(lines[0].classList).toContain('se-chart__series--1');
    expect(lines[1].classList).toContain('se-chart__series--2');
    expect(lines[0].getAttribute('d')!.match(/M/g)!.length).toBe(1);
    // Wholesale has no Tuesday: one point, a gap, then a run of two.
    expect(lines[1].getAttribute('d')!.match(/M/g)!.length).toBe(2);
    expect(el.querySelector('.se-line-chart__area')).toBeNull();
  });

  it('gives a screen reader the data as a table, formatted like the chart', async () => {
    const { el } = await setup();
    const table = el.querySelector('table.se-sr-only')!;
    expect(table.querySelector('caption')!.textContent).toBe('Revenue by channel');
    const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(heads).toEqual(['Retail', 'Wholesale']);
    const rows = [...table.querySelectorAll('tbody tr')].map((tr) =>
      [...tr.children].map((c) => c.textContent!.trim()),
    );
    expect(rows).toEqual([
      ['Mon', 'N1200', 'N900'],
      ['Tue', 'N1800', 'No data'],
      ['Wed', 'N1500', 'N2400'],
      ['Thu', 'N2100', 'N1700'],
    ]);
  });

  it('labels the value axis with the formatter', async () => {
    const { el } = await setup();
    const ticks = [...el.querySelectorAll('text[text-anchor=end]')].map((t) =>
      t.textContent!.trim(),
    );
    expect(ticks).toEqual(['N500', 'N1000', 'N1500', 'N2000', 'N2500']);
  });

  it('shows a legend only when there is more than one series', async () => {
    const { el, host, fixture } = await setup();
    expect([...el.querySelectorAll('.se-chart__key')].map((k) => k.textContent!.trim())).toEqual([
      'Retail',
      'Wholesale',
    ]);
    host.series.set([{ name: 'Retail', values: [1200, 1800, 1500, 2100] }]);
    await settle(fixture);
    expect(el.querySelector('.se-chart__legend')).toBeNull();
  });

  it('fills under a single series and measures it from zero', async () => {
    const { el } = await setup((h) => {
      h.area.set(true);
      h.series.set([{ name: 'Retail', values: [1200, 1800, 1500, 2100] }]);
    });
    expect(el.querySelector('.se-line-chart__area')).not.toBeNull();
    expect(el.querySelector('text[text-anchor=end]')!.textContent!.trim()).toBe('N0');
  });

  it('moves the active position with the keyboard and announces it', async () => {
    const { el, press } = await setup();
    const plot = el.querySelector<HTMLElement>('.se-chart__plot')!;
    const live = el.querySelector('[aria-live=polite]')!;
    expect(plot.tabIndex).toBe(0);
    expect(plot.classList).toContain('se-focusable');
    expect(plot.getAttribute('aria-label')).toBe('Revenue by channel');
    expect(live.textContent).toBe('');
    expect(el.querySelector('.se-chart__tooltip')).toBeNull();

    await press('ArrowRight');
    expect(live.textContent).toBe('Mon: Retail N1200, Wholesale N900');
    await press('ArrowRight');
    expect(live.textContent).toBe('Tue: Retail N1800, Wholesale No data');
    const tip = el.querySelector('.se-chart__tooltip')!;
    expect(tip.textContent).toContain('Tue');
    expect(tip.textContent).toContain('Retail');
    expect(tip.textContent).toContain('N1800');
    // A gap has no point to mark.
    expect(el.querySelectorAll('.se-line-chart__dot').length).toBe(1);

    await press('End');
    expect(live.textContent).toContain('Thu');
    await press('ArrowRight');
    expect(live.textContent).toContain('Thu');
    await press('Home');
    expect(live.textContent).toContain('Mon');
    await press('ArrowLeft');
    expect(live.textContent).toContain('Mon');

    await press('Escape');
    expect(live.textContent).toBe('');
    expect(el.querySelector('.se-chart__tooltip')).toBeNull();
    expect(el.querySelector('.se-chart__guide')).toBeNull();
  });

  it('follows the pointer to the nearest position and keeps the tooltip inside', async () => {
    const { el, fixture } = await setup();
    const plot = el.querySelector<HTMLElement>('.se-chart__plot')!;
    const box = plot.getBoundingClientRect();
    plot.dispatchEvent(new PointerEvent('pointermove', { clientX: box.left + 590, bubbles: true }));
    await settle(fixture);
    const tip = el.querySelector<HTMLElement>('.se-chart__tooltip')!;
    expect(tip.textContent).toContain('Thu');
    const inside = tip.getBoundingClientRect();
    expect(inside.right).toBeLessThanOrEqual(box.right);
    expect(inside.left).toBeGreaterThanOrEqual(box.left);

    plot.dispatchEvent(new PointerEvent('pointerleave'));
    await settle(fixture);
    expect(el.querySelector('.se-chart__tooltip')).toBeNull();
  });

  it('keeps the same height while loading, when empty and when drawn', async () => {
    const { el, host, fixture } = await setup((h) => h.loading.set(true));
    const body = el.querySelector<HTMLElement>('.se-chart__body')!;
    expect(body.getAttribute('aria-busy')).toBe('true');
    expect(el.querySelector('.se-chart__skeleton')).not.toBeNull();
    expect(el.querySelector('svg')).toBeNull();
    expect(el.querySelector('table')).toBeNull();
    const loading = body.offsetHeight;
    expect(loading).toBe(240);

    host.loading.set(false);
    await settle(fixture);
    expect(body.hasAttribute('aria-busy')).toBeFalse();
    expect(el.querySelector('svg')).not.toBeNull();
    expect(body.offsetHeight).toBe(loading);

    host.series.set([{ name: 'Retail', values: [null, null, null, null] }]);
    await settle(fixture);
    expect(el.querySelector('.se-chart__empty')!.textContent).toContain('No data for this period');
    expect(el.querySelector('svg')).toBeNull();
    expect(body.offsetHeight).toBe(loading);
  });
});
