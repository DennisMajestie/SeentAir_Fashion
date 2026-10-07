import { ComponentFixture, TestBed } from '@angular/core/testing';
import { configurePortal, dashboard } from '../testing';
import { PerformancePage } from './performance.page';

describe('PerformancePage', () => {
  let fixture: ComponentFixture<PerformancePage>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  afterEach(() => fixture?.destroy());

  it('shows the ledger headline figures as money from configuration', () => {
    configurePortal();
    fixture = TestBed.createComponent(PerformancePage);
    fixture.detectChanges();
    expect(el().querySelector('h1')!.textContent).toContain('Operational & financial performance');
    const metrics = el().querySelector('.se-metric-grid')!.textContent!;
    expect(metrics).toContain('₦2,777,000');
    expect(metrics).toContain('₦250,000');
    expect(metrics).toContain('91.0%');
  });

  it('lists income by ledger entry type when the ledger reports a breakdown', () => {
    configurePortal(
      dashboard({
        accountsReports: {
          income: { total: 3_000_000, byType: { sales: 2_000_000, wholesale: 1_000_000 } },
          profit: { income: 3_000_000, expenditure: 250_000, profit: 2_750_000, net: 2_750_000 },
        },
      }),
    );
    fixture = TestBed.createComponent(PerformancePage);
    fixture.detectChanges();
    const table = el().querySelector('se-table')!.textContent!;
    expect(table).toContain('Sales');
    expect(table).toContain('₦2,000,000');
    expect(table).toContain('Wholesale');
  });

  it('renders an honest empty state when there is no income breakdown', () => {
    configurePortal();
    fixture = TestBed.createComponent(PerformancePage);
    fixture.detectChanges();
    expect(el().querySelector('se-empty-state')).not.toBeNull();
    expect(el().textContent).toContain('Not yet published');
  });

  it('never shows a name, email or address', () => {
    configurePortal();
    fixture = TestBed.createComponent(PerformancePage);
    fixture.detectChanges();
    expect(el().textContent).not.toMatch(/@|customer|address/i);
  });
});
