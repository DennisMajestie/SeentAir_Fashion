import { ComponentFixture, TestBed } from '@angular/core/testing';
import { configurePortal } from '../testing';
import { InvestmentPage } from './investment.page';

describe('InvestmentPage', () => {
  let fixture: ComponentFixture<InvestmentPage>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  afterEach(() => fixture?.destroy());

  it('shows the registry headline figures from the dashboard', () => {
    configurePortal();
    fixture = TestBed.createComponent(InvestmentPage);
    fixture.detectChanges();
    expect(el().querySelector('.hero h2, .hero')!.textContent).toContain('Total Invested Position');
    const hero = el().querySelector('.hero')!.textContent!;
    expect(hero).toContain('₦2,000,000');
    expect(hero).toContain('250,000');
    expect(hero).toContain('1,000,000');
    expect(hero).toContain('25% equity ownership');
  });

  it('derives the other-partners slice from the partners share minus this holding', () => {
    configurePortal();
    fixture = TestBed.createComponent(InvestmentPage);
    fixture.detectChanges();
    const table = el().querySelector('.cap-table')!.textContent!;
    expect(table).toContain('Founder & executive team');
    expect(table).toContain('Other strategic partners');
    expect(table).toContain('600,000');
    expect(table).toContain('150,000');
  });

  it('renders an equity split chart from configuration', () => {
    configurePortal();
    fixture = TestBed.createComponent(InvestmentPage);
    fixture.detectChanges();
    const chart = el().querySelector('.equity-split')!;
    expect(chart.textContent).toContain('Founder & executive team');
    expect(chart.textContent).toContain('Other strategic partners');
    expect(chart.textContent).toContain('Your holding (Test)');
  });

  it('never shows a customer name, email or address', () => {
    configurePortal();
    fixture = TestBed.createComponent(InvestmentPage);
    fixture.detectChanges();
    expect(el().textContent).not.toMatch(/@|customer|address/i);
  });
});
