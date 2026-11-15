import { ComponentFixture, TestBed } from '@angular/core/testing';
import { configurePortal, dashboard } from '../testing';
import { ProfitSharingPage } from './profit-sharing.page';

describe('ProfitSharingPage', () => {
  let fixture: ComponentFixture<ProfitSharingPage>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  afterEach(() => fixture?.destroy());

  it('breaks the pool down by the 40/40/20 covenant', () => {
    configurePortal();
    fixture = TestBed.createComponent(ProfitSharingPage);
    fixture.detectChanges();
    const legend = el().querySelector('.covenant-legend')!.textContent!;
    expect(legend).toContain('40% Reinvest');
    expect(legend).toContain('40% Dividend');
    expect(legend).toContain('20% Reserve');
  });

  it('lists declared periods with pool and entitlement figures', () => {
    configurePortal();
    fixture = TestBed.createComponent(ProfitSharingPage);
    fixture.detectChanges();
    const card = el().querySelector('.payout-card')!.textContent!;
    expect(card).toContain('2026-Q3');
    expect(card).toContain('Declared');
    expect(card).toContain('₦400,000');
    expect(card).toContain('₦100,000');
    expect(card).toContain('₦1,000,000');
  });

  it('shows an honest empty state when no distributions are declared', () => {
    configurePortal(dashboard({ profitSharing: [] }));
    fixture = TestBed.createComponent(ProfitSharingPage);
    fixture.detectChanges();
    expect(el().textContent).toContain('No distributions yet');
  });

  it('shows cumulative realized yield against invested capital', () => {
    configurePortal();
    fixture = TestBed.createComponent(ProfitSharingPage);
    fixture.detectChanges();
    const yieldCard = Array.from(el().querySelectorAll('section')).find((s) => s.textContent!.includes('Cumulative realized yield'))!;
    expect(yieldCard.textContent).toContain('₦100,000');
    expect(yieldCard.textContent).toContain('5.0% cash-on-cash');
  });

  it('never shows a customer name, email or address', () => {
    configurePortal();
    fixture = TestBed.createComponent(ProfitSharingPage);
    fixture.detectChanges();
    expect(el().textContent).not.toMatch(/@|customer|address/i);
  });
});
