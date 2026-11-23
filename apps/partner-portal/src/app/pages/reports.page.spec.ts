import { ComponentFixture, TestBed } from '@angular/core/testing';
import { configurePortal, dashboard } from '../testing';
import { ReportsPage } from './reports.page';

describe('ReportsPage', () => {
  let fixture: ComponentFixture<ReportsPage>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  afterEach(() => fixture?.destroy());

  it('shows the ledger ratios from the dashboard', () => {
    configurePortal();
    fixture = TestBed.createComponent(ReportsPage);
    fixture.detectChanges();
    const metrics = el().querySelector('.metrics')!.textContent!;
    expect(metrics).toContain('91.0%');
    expect(metrics).toContain('9.0%');
  });

  it('draws the profit allocation covenant as bars', () => {
    configurePortal();
    fixture = TestBed.createComponent(ReportsPage);
    fixture.detectChanges();
    const covenant = el().querySelector('.covenant')!.textContent!;
    expect(covenant).toContain('Reinvestment');
    expect(covenant).toContain('Dividends');
    expect(covenant).toContain('Reserve');
  });

  it('lists income by ledger entry type when a breakdown is published', () => {
    configurePortal(
      dashboard({
        accountsReports: {
          income: { total: 3_000_000, byType: { sales: 2_000_000, wholesale: 1_000_000 } },
          profit: { income: 3_000_000, expenditure: 250_000, profit: 2_750_000, net: 2_750_000 },
        },
      }),
    );
    fixture = TestBed.createComponent(ReportsPage);
    fixture.detectChanges();
    const list = el().querySelector('.income-list')!.textContent!;
    expect(list).toContain('Sales');
    expect(list).toContain('₦2,000,000');
  });

  it('renders the document shelf with honest pending states', () => {
    configurePortal();
    fixture = TestBed.createComponent(ReportsPage);
    fixture.detectChanges();
    expect(el().textContent).toContain('Request a copy');
  });

  it('never shows a customer name, email or address', () => {
    configurePortal();
    fixture = TestBed.createComponent(ReportsPage);
    fixture.detectChanges();
    expect(el().textContent).not.toMatch(/@|customer|address/i);
  });
});
