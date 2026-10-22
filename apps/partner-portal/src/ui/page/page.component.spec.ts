import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SeActivityComponent, SeKvDirective, SeKvItemComponent } from '../detail/detail.component';
import { formatDate } from '../format/format';
import { SePageComponent } from './page.component';

describe('se-page', () => {
  @Component({
    imports: [SePageComponent],
    template: `
      <se-page title="Order SE-48210" [breadcrumbs]="crumbs" description="A retail order.">
        <span sePageStatus class="status">Paid</span>
        <button sePageActions class="action">Print invoice</button>
        <p sePageMeta class="meta">Placed 6 Oct 2026</p>
        <p class="content">Body</p>
      </se-page>
      <se-page title="Orders"><p>List</p></se-page>
    `,
  })
  class Host {
    crumbs = [{ label: 'Orders', link: '/orders' }, { label: 'SE-48210' }];
  }

  const setup = () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('se-page')];
  };

  it('puts each part in its fixed place: trail, title with status, actions, meta, then content', () => {
    const [detail] = setup();
    const order = [
      'se-breadcrumbs',
      '.se-page__title',
      '.status',
      '.action',
      '.meta',
      '.content',
    ].map((sel) => detail.querySelector(sel)!);
    for (const part of order) expect(part).not.toBeNull();
    for (let i = 1; i < order.length; i++) {
      // Each part comes after the one before it in the document.
      expect(
        order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    expect(detail.querySelector('.se-page__heading .status')).not.toBeNull();
    expect(detail.querySelector('.se-page__actions .action')).not.toBeNull();
  });

  it('has exactly one h1, the page title', () => {
    const [detail] = setup();
    const h1 = detail.querySelectorAll('h1');
    expect(h1.length).toBe(1);
    expect(h1[0].textContent).toBe('Order SE-48210');
  });

  it('shows no breadcrumb on a top-level page', () => {
    const [, list] = setup();
    expect(list.querySelector('se-breadcrumbs')).toBeNull();
  });
});

describe('detail pieces', () => {
  @Component({
    imports: [SeKvDirective, SeKvItemComponent, SeActivityComponent],
    template: `
      <dl seKv>
        <div seKvItem label="Customer">Adaeze O.</div>
        <div seKvItem label="Total" numeric>5,000</div>
      </dl>
      <se-activity [entries]="entries" />
      <se-activity [entries]="[]" emptyText="Nothing has happened yet." />
    `,
  })
  class Host {
    entries = [
      {
        at: '2026-10-06T14:20:00',
        text: 'Payment received',
        actor: 'Paystack',
        tone: 'success' as const,
      },
      { at: '2026-10-06T14:05:00', text: 'Order placed' },
    ];
  }

  const el = (): HTMLElement => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('renders facts as a real description list', () => {
    const dl = el().querySelector('dl')!;
    expect([...dl.querySelectorAll('dt')].map((d) => d.textContent)).toEqual(['Customer', 'Total']);
    expect(dl.querySelectorAll('dd')[1].classList).toContain('se-num');
    expect(dl.querySelectorAll('dd')[0].classList).not.toContain('se-num');
  });

  it('lists activity in the order given, with who and when', () => {
    const entries = [...el().querySelectorAll('.se-activity__entry')];
    expect(entries.length).toBe(2);
    expect(entries[0].textContent).toContain('Payment received');
    expect(entries[0].textContent).toContain('Paystack');
    expect(entries[0].textContent).toContain('6 Oct 2026');
    expect(entries[0].classList).toContain('se-activity__entry--success');
  });

  it('says so when there is no activity', () => {
    expect(el().querySelector('.se-activity__empty')!.textContent).toBe(
      'Nothing has happened yet.',
    );
  });
});

describe('formatDate', () => {
  it('writes a date one way everywhere', () => {
    expect(formatDate('2026-10-06T14:20:00')).toBe('6 Oct 2026');
    expect(formatDate('2026-10-06T14:20:00', 'datetime')).toBe('6 Oct 2026, 14:20');
    expect(formatDate(new Date(2026, 0, 3, 9, 5), 'time')).toBe('09:05');
  });

  it('keeps a bare calendar date on its own day in every time zone', () => {
    expect(formatDate('2026-10-02')).toBe('2 Oct 2026');
    expect(formatDate('2026-01-01')).toBe('1 Jan 2026');
  });

  it('prints a dash for a missing or unreadable date', () => {
    expect(formatDate(null)).toBe('–');
    expect(formatDate('')).toBe('–');
    expect(formatDate('not a date')).toBe('–');
  });
});
