import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SeFilter, SeFilterBarComponent, SeFilterValue } from './filter-bar.component';

@Component({
  imports: [SeFilterBarComponent],
  template: `
    <se-filter-bar
      searchLabel="Search suppliers"
      [(query)]="query"
      [filters]="filters"
      [(value)]="value"
      summary="8 suppliers"
    />
  `,
})
class Host {
  readonly query = signal('');
  readonly value = signal<SeFilterValue>({});
  readonly filters: SeFilter[] = [
    { key: 'status', label: 'Status', options: [{ value: 'active', label: 'Active' }] },
    {
      key: 'category',
      label: 'Category',
      anyLabel: 'All categories',
      options: [{ value: 'fabric', label: 'Fabric' }],
    },
  ];
}

describe('se-filter-bar', () => {
  const setup = () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const chips = (): string[] =>
      [...el.querySelectorAll('.se-filter-bar__chip')].map((c) => c.textContent!.trim());
    const choose = (index: number, value: string): void => {
      const select = el.querySelectorAll<HTMLSelectElement>('select')[index];
      select.value = value;
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
    };
    return { fixture, host: fixture.componentInstance, el, chips, choose };
  };

  it('names every control and words the "no filter" choice', () => {
    const { el } = setup();
    const selects = [...el.querySelectorAll<HTMLSelectElement>('select')];
    expect(selects.map((s) => s.getAttribute('aria-label'))).toEqual([
      'Filter by status',
      'Filter by category',
    ]);
    expect(selects[0].options[0].textContent).toBe('Any status');
    expect(selects[1].options[0].textContent).toBe('All categories');
    expect(el.querySelector('input[type=search]')!.getAttribute('aria-label')).toBe(
      'Search suppliers',
    );
    expect(el.querySelector('.se-filter-bar__summary')!.textContent).toBe('8 suppliers');
  });

  it('shows nothing applied until something is', () => {
    const { el } = setup();
    expect(el.querySelector('.se-filter-bar__chips')).toBeNull();
  });

  it('reports a chosen filter and shows it as a removable chip', () => {
    const { host, chips, choose, el } = setup();
    choose(0, 'active');
    expect(host.value()).toEqual({ status: 'active' });
    expect(chips()).toEqual(['Status: Active']);
    expect(el.querySelector('.se-filter-bar__chip')!.getAttribute('aria-label')).toBe(
      'Remove filter Status: Active',
    );
  });

  it('removes one filter from its chip and leaves the others', () => {
    const { host, chips, choose, el, fixture } = setup();
    choose(0, 'active');
    choose(1, 'fabric');
    el.querySelector<HTMLButtonElement>('.se-filter-bar__chip')!.click();
    fixture.detectChanges();
    expect(host.value()).toEqual({ category: 'fabric' });
    expect(chips()).toEqual(['Category: Fabric']);
  });

  it('counts the search as an applied filter', () => {
    const { host, chips, fixture } = setup();
    host.query.set('aba');
    fixture.detectChanges();
    expect(chips()).toEqual(['Search: aba']);
  });

  it('clears the search and every filter with one action', () => {
    const { host, choose, el, fixture } = setup();
    host.query.set('aba');
    choose(0, 'active');
    const clear = [...el.querySelectorAll('button')].find((b) =>
      b.textContent!.includes('Clear all'),
    )!;
    clear.click();
    fixture.detectChanges();
    expect(host.query()).toBe('');
    expect(host.value()).toEqual({});
    expect(el.querySelector('.se-filter-bar__chips')).toBeNull();
  });
});
