import { ComponentFixture, TestBed } from '@angular/core/testing';
import { configurePortal, dashboard } from '../testing';
import { ProfitSharingPage } from './profit-sharing.page';

describe('ProfitSharingPage', () => {
  let fixture: ComponentFixture<ProfitSharingPage>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  afterEach(() => fixture?.destroy());

  it('shows the latest distribution figures from the dashboard', () => {
    configurePortal();
    fixture = TestBed.createComponent(ProfitSharingPage);
    fixture.detectChanges();
    const metrics = el().querySelector('.se-metric-grid')!.textContent!;
    expect(metrics).toContain('₦1,000,000');
    expect(metrics).toContain('₦400,000');
    expect(metrics).toContain('₦100,000');
  });

  it('breaks the pool down by the 40/40/20 covenant', () => {
    configurePortal();
    fixture = TestBed.createComponent(ProfitSharingPage);
    fixture.detectChanges();
    const detail = el().querySelector('.se-detail')!.textContent!;
    expect(detail).toContain('Capital reinvestment (40%)');
    expect(detail).toContain('₦400,000');
    expect(detail).toContain('Strategic reserve (20%)');
    expect(detail).toContain('₦200,000');
  });

  it('lists declared periods in the payout ledger', () => {
    configurePortal();
    fixture = TestBed.createComponent(ProfitSharingPage);
    fixture.detectChanges();
    const table = el().querySelector('se-table')!.textContent!;
    expect(table).toContain('2026-Q3');
    expect(table).toContain('Declared');
  });

  it('shows an honest empty state when no distributions are declared', () => {
    configurePortal(dashboard({ profitSharing: [] }));
    fixture = TestBed.createComponent(ProfitSharingPage);
    fixture.detectChanges();
    expect(el().textContent).toContain('No distributions yet');
  });

  it('never shows a customer name, email or address', () => {
    configurePortal();
    fixture = TestBed.createComponent(ProfitSharingPage);
    fixture.detectChanges();
    expect(el().textContent).not.toMatch(/@|customer|address/i);
  });
});
