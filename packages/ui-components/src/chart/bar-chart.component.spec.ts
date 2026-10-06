import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SeBarChartComponent } from './bar-chart.component';
import { settle } from './line-chart.component.spec';

@Component({
  imports: [SeBarChartComponent],
  template: `
    <div style="width: 480px">
      <se-bar-chart
        title="Monthly profit"
        [labels]="labels()"
        [values]="values()"
        [formatValue]="money"
        [loading]="loading()"
        height="sm"
      />
    </div>
  `,
})
class Host {
  readonly labels = signal(['Jan', 'Feb', 'Mar', 'Apr']);
  readonly values = signal([400, -200, 0, 800]);
  readonly loading = signal(false);
  readonly money = (n: number): string => `N${n.toFixed(0)}`;
}

/** The top and bottom edge of a drawn bar, from its path. */
const edges = (bar: Element): { top: number; bottom: number } => {
  const box = (bar as SVGGraphicsElement).getBBox();
  return { top: box.y, bottom: box.y + box.height };
};

describe('se-bar-chart', () => {
  const setup = async (change?: (host: Host) => void) => {
    const fixture = TestBed.createComponent(Host);
    change?.(fixture.componentInstance);
    await settle(fixture);
    return { fixture, el: fixture.nativeElement as HTMLElement, host: fixture.componentInstance };
  };

  it('draws one bar per value at the real width, with no legend', async () => {
    const { el } = await setup();
    expect(el.querySelector('svg')!.getAttribute('width')).toBe('480');
    expect(el.querySelectorAll('path.se-bar-chart__bar').length).toBe(4);
    expect(el.querySelector('.se-chart__legend')).toBeNull();
  });

  it('draws negative values downward from a visible zero line', async () => {
    const { el } = await setup();
    const zero = el.querySelector('line.se-chart__grid--zero')!;
    const zeroY = Number(zero.getAttribute('y1'));
    const bars = [...el.querySelectorAll('path.se-bar-chart__bar')];
    const [jan, feb] = bars.map(edges);
    expect(jan.bottom).toBeCloseTo(zeroY, 0);
    expect(jan.top).toBeLessThan(zeroY);
    expect(feb.top).toBeCloseTo(zeroY, 0);
    expect(feb.bottom).toBeGreaterThan(zeroY);
    expect(bars.map((b) => b.classList.contains('se-bar-chart__bar--negative'))).toEqual([
      false,
      true,
      false,
      false,
    ]);
    // Zero sits inside the plot, not on its bottom edge.
    const ys = [...el.querySelectorAll('line.se-chart__grid')].map((l) =>
      Number(l.getAttribute('y1')),
    );
    expect(Math.max(...ys)).toBeGreaterThan(zeroY);
  });

  it('gives a screen reader the data as a table, formatted like the chart', async () => {
    const { el } = await setup();
    const table = el.querySelector('table.se-sr-only')!;
    expect(table.querySelector('caption')!.textContent).toBe('Monthly profit');
    const rows = [...table.querySelectorAll('tbody tr')].map((tr) =>
      [...tr.children].map((c) => c.textContent!.trim()),
    );
    expect(rows).toEqual([
      ['Jan', 'N400'],
      ['Feb', 'N-200'],
      ['Mar', 'N0'],
      ['Apr', 'N800'],
    ]);
  });

  it('moves the active bar with the keyboard and announces its value', async () => {
    const { el, fixture } = await setup();
    const plot = el.querySelector<HTMLElement>('.se-chart__plot')!;
    const live = el.querySelector('[aria-live=polite]')!;
    const press = async (key: string) => {
      plot.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      await settle(fixture);
    };
    await press('ArrowLeft');
    expect(live.textContent).toBe('Apr: N800');
    await press('ArrowLeft');
    await press('ArrowLeft');
    expect(live.textContent).toBe('Feb: N-200');
    expect(el.querySelector('.se-chart__band')).not.toBeNull();
    expect(el.querySelector('.se-chart__tooltip')!.textContent).toContain('N-200');
    await press('Escape');
    expect(el.querySelector('.se-chart__band')).toBeNull();
    expect(live.textContent).toBe('');
  });

  it('keeps the same height while loading, when empty and when drawn', async () => {
    const { el, host, fixture } = await setup((h) => h.loading.set(true));
    const body = el.querySelector<HTMLElement>('.se-chart__body')!;
    expect(body.getAttribute('aria-busy')).toBe('true');
    expect(el.querySelector('.se-chart__skeleton')).not.toBeNull();
    expect(body.offsetHeight).toBe(160);

    host.loading.set(false);
    await settle(fixture);
    expect(el.querySelector('svg')).not.toBeNull();
    expect(body.offsetHeight).toBe(160);

    host.labels.set([]);
    host.values.set([]);
    await settle(fixture);
    expect(el.querySelector('.se-chart__empty')!.textContent).toContain('No data for this period');
    expect(el.querySelector('table')).toBeNull();
    expect(body.offsetHeight).toBe(160);
  });
});
