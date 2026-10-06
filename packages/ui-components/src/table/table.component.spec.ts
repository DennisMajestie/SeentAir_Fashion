import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  SeCellDirective,
  SeColumn,
  SeRowAction,
  SeRowId,
  SeSort,
  SeTableComponent,
  compareValues,
} from './table.component';

interface Row {
  id: string;
  name: string;
  qty: number | null;
  status: string;
}
const ROWS: Row[] = [
  { id: 'a', name: 'Box Tee', qty: 12, status: 'in_stock' },
  { id: 'b', name: 'Cargo', qty: 3, status: 'low_stock' },
  { id: 'c', name: 'Hoodie', qty: 40, status: 'in_stock' },
  { id: 'd', name: 'Jogger', qty: null, status: 'made_to_order' },
  { id: 'e', name: 'Cap', qty: 7, status: 'in_stock' },
];

@Component({
  imports: [SeTableComponent, SeCellDirective],
  template: `
    <se-table
      caption="Stock"
      [columns]="columns"
      [rows]="rows()"
      [loading]="loading()"
      [error]="error()"
      (retry)="retried = retried + 1"
      selectable
      [(selection)]="selection"
      [(sort)]="sort"
      [(page)]="page"
      [pageSize]="pageSize()"
      [actions]="actions"
      activatable
      (rowActivate)="opened = $event.id"
      emptyHeading="No stock yet"
      emptyText="Finished batches add stock here."
      emptyActionLabel="Start a batch"
      (emptyAction)="emptyClicked = true"
    >
      <ng-template seCell="status" let-row let-value="value">
        <b class="custom">{{ value }}!</b>
      </ng-template>
    </se-table>
  `,
})
class Host {
  readonly rows = signal<Row[]>(ROWS);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly pageSize = signal(0);
  readonly selection = signal<readonly SeRowId[]>([]);
  readonly sort = signal<SeSort | null>(null);
  readonly page = signal(1);
  retried = 0;
  opened = '';
  emptyClicked = false;
  removed = '';
  readonly columns: SeColumn<Row>[] = [
    { key: 'name', header: 'Product', sortable: true },
    { key: 'qty', header: 'On hand', numeric: true, sortable: true },
    { key: 'status', header: 'Status' },
  ];
  readonly actions: SeRowAction<Row>[] = [
    { label: 'Remove', danger: true, run: (r) => (this.removed = r.id), disabled: (r) => r.id === 'a' },
  ];
}

describe('se-table', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  let el: HTMLElement;

  const render = (): void => {
    fixture.detectChanges();
  };
  const bodyRows = (): HTMLTableRowElement[] => [...el.querySelectorAll<HTMLTableRowElement>('tbody tr')];
  const names = (): string[] =>
    bodyRows().map((r) => r.querySelector('.se-table__rowlink')!.textContent!.trim());
  const sortButton = (label: string): HTMLButtonElement =>
    [...el.querySelectorAll<HTMLButtonElement>('.se-table__sort')].find((b) =>
      b.textContent!.includes(label),
    )!;
  const header = (label: string): HTMLElement =>
    [...el.querySelectorAll<HTMLElement>('thead th')].find((h) => h.textContent!.includes(label))!;

  beforeEach(() => {
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    el = fixture.nativeElement as HTMLElement;
    render();
  });

  describe('structure', () => {
    it('is a real table with a caption and column headers', () => {
      expect(el.querySelector('table caption')!.textContent!.trim()).toBe('Stock');
      const heads = [...el.querySelectorAll('thead th[scope=col]')];
      expect(heads.length).toBe(5); // select + 3 columns + actions
    });

    it('right-aligns a numeric column with tabular figures, header and cells alike', () => {
      expect(header('On hand').classList).toContain('se-num');
      expect(bodyRows()[0].querySelectorAll('td')[2].classList).toContain('se-num');
    });

    it('prints a dash for an empty value', () => {
      expect(bodyRows()[3].querySelectorAll('td')[2].textContent!.trim()).toBe('–');
    });

    it('renders a custom cell template with the row and the value', () => {
      const custom = bodyRows()[1].querySelector('.custom')!;
      expect(custom.textContent).toBe('low_stock!');
    });
  });

  describe('sorting', () => {
    it('cycles ascending, descending, then back to the original order', () => {
      sortButton('On hand').click();
      render();
      expect(header('On hand').getAttribute('aria-sort')).toBe('ascending');
      // Empty quantity sorts last, not first.
      expect(names()).toEqual(['Cargo', 'Cap', 'Box Tee', 'Hoodie', 'Jogger']);

      sortButton('On hand').click();
      render();
      expect(header('On hand').getAttribute('aria-sort')).toBe('descending');
      expect(names()[0]).toBe('Jogger');
      expect(names()[1]).toBe('Hoodie');

      sortButton('On hand').click();
      render();
      expect(header('On hand').getAttribute('aria-sort')).toBe('none');
      expect(names()).toEqual(ROWS.map((r) => r.name));
    });

    it('sorts text alphabetically and reports the sort to the caller', () => {
      sortButton('Product').click();
      render();
      expect(names()).toEqual(['Box Tee', 'Cap', 'Cargo', 'Hoodie', 'Jogger']);
      expect(host.sort()).toEqual({ key: 'name', direction: 'asc' });
    });

    it('gives a column that cannot be sorted no button and no aria-sort', () => {
      expect(header('Status').querySelector('button')).toBeNull();
      expect(header('Status').hasAttribute('aria-sort')).toBeFalse();
    });
  });

  describe('selection', () => {
    const boxes = (): HTMLInputElement[] => [
      ...el.querySelectorAll<HTMLInputElement>('tbody input[type=checkbox]'),
    ];
    const all = (): HTMLInputElement => el.querySelector<HTMLInputElement>('thead input[type=checkbox]')!;

    it('selects a row and names the checkbox after it', () => {
      expect(boxes()[1].closest('label')!.textContent).toContain('Select Cargo');
      boxes()[1].click();
      render();
      expect(host.selection()).toEqual(['b']);
      expect(bodyRows()[1].classList).toContain('se-table__row--selected');
      expect(el.querySelector('.se-table__selected')!.textContent).toContain('1 selected');
    });

    it('shows the header box as mixed when only some rows are selected', () => {
      boxes()[0].click();
      render();
      expect(all().indeterminate).toBeTrue();
      expect(all().checked).toBeFalse();
    });

    it('selects and clears the whole page from the header', () => {
      all().click();
      render();
      expect(host.selection().length).toBe(5);
      expect(all().checked).toBeTrue();
      all().click();
      render();
      expect(host.selection()).toEqual([]);
    });
  });

  describe('paging', () => {
    beforeEach(() => {
      host.pageSize.set(2);
      render();
    });

    it('shows one page and says where it is', () => {
      expect(bodyRows().length).toBe(2);
      expect(el.querySelector('.se-table__range')!.textContent).toBe('1–2 of 5');
      expect(el.querySelector('.se-table__page')!.textContent).toBe('Page 1 of 3');
    });

    it('moves forward and back, and stops at the ends', () => {
      const [prev, next] = [
        el.querySelector<HTMLButtonElement>('[aria-label="Previous page"]')!,
        el.querySelector<HTMLButtonElement>('[aria-label="Next page"]')!,
      ];
      expect(prev.disabled).toBeTrue();
      next.click();
      render();
      next.click();
      render();
      expect(names()).toEqual(['Cap']);
      expect(el.querySelector('.se-table__range')!.textContent).toBe('5–5 of 5');
      expect(next.disabled).toBeTrue();
    });

    it('keeps the page inside the pages that exist when rows are removed', () => {
      host.page.set(3);
      host.rows.set(ROWS.slice(0, 2));
      render();
      expect(names()).toEqual(['Box Tee', 'Cargo']);
    });

    it('selecting all only takes the rows on this page', () => {
      el.querySelector<HTMLInputElement>('thead input[type=checkbox]')!.click();
      render();
      expect(host.selection()).toEqual(['a', 'b']);
    });
  });

  describe('rows and actions', () => {
    it('opens a row from its first cell, which is a real button', () => {
      const link = bodyRows()[2].querySelector<HTMLButtonElement>('button.se-table__rowlink')!;
      link.click();
      expect(host.opened).toBe('c');
    });

    it('also opens a row on a click anywhere that is not a control', () => {
      bodyRows()[1].querySelectorAll('td')[2].click();
      expect(host.opened).toBe('b');
      host.opened = '';
      bodyRows()[1].querySelector<HTMLInputElement>('input[type=checkbox]')!.click();
      expect(host.opened).toBe('');
    });

    it('runs a row action, labelled with the row it acts on', () => {
      const action = bodyRows()[1].querySelector<HTMLButtonElement>('.se-table__actions button')!;
      expect(action.getAttribute('aria-label')).toBe('Remove: Cargo');
      action.click();
      expect(host.removed).toBe('b');
    });

    it('disables an action for a row it does not apply to', () => {
      const action = bodyRows()[0].querySelector<HTMLButtonElement>('.se-table__actions button')!;
      expect(action.disabled).toBeTrue();
    });
  });

  describe('density', () => {
    it('toggles compact rows from the toolbar', () => {
      const toggle = el.querySelector<HTMLButtonElement>('[aria-label="Compact rows"]')!;
      expect(toggle.getAttribute('aria-pressed')).toBe('false');
      toggle.click();
      render();
      expect(el.querySelector('se-table')!.classList).toContain('se-table--compact');
      expect(toggle.getAttribute('aria-pressed')).toBe('true');
    });
  });

  describe('states', () => {
    it('shows skeleton rows in the table shape while loading', () => {
      host.loading.set(true);
      render();
      expect(el.querySelector('table')!.getAttribute('aria-busy')).toBe('true');
      expect(el.querySelectorAll('tr.se-table__skeleton').length).toBe(5);
      expect(el.querySelector('.se-table__rowlink')).toBeNull();
      expect(el.querySelector('.se-table__footer')).toBeNull();
    });

    it('shows the empty state with its one action', () => {
      host.rows.set([]);
      render();
      expect(el.querySelector('.se-empty__heading')!.textContent).toBe('No stock yet');
      el.querySelector<HTMLButtonElement>('.se-empty button')!.click();
      expect(host.emptyClicked).toBeTrue();
    });

    it('shows the error as an alert with a retry, instead of an empty table', () => {
      host.error.set('The server did not respond.');
      render();
      const banner = el.querySelector('.se-banner--danger')!;
      expect(banner.getAttribute('role')).toBe('alert');
      expect(banner.textContent).toContain('Stock could not be loaded');
      expect(banner.textContent).toContain('The server did not respond.');
      expect(el.querySelector('.se-empty')).toBeNull();
      banner.querySelector('button')!.click();
      expect(host.retried).toBe(1);
    });
  });

  describe('compareValues', () => {
    it('orders numbers by size, text naturally, and empties last', () => {
      expect([10, 9, 100].sort(compareValues)).toEqual([9, 10, 100]);
      expect(['SE-10', 'SE-9', 'se-100'].sort(compareValues)).toEqual(['SE-9', 'SE-10', 'se-100']);
      expect([null, 3, undefined, 1].sort(compareValues)).toEqual([1, 3, null, undefined]);
    });
  });
});
