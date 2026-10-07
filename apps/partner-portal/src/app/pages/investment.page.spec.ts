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
    expect(el().querySelector('h1')!.textContent).toContain('My Investment & Equity Structure');
    const metrics = el().querySelector('.se-metric-grid')!.textContent!;
    expect(metrics).toContain('₦2,000,000');
    expect(metrics).toContain('250,000 shares');
    expect(metrics).toContain('25%');
  });

  it('derives the other-partners slice from the partners share minus this holding', () => {
    configurePortal();
    fixture = TestBed.createComponent(InvestmentPage);
    fixture.detectChanges();
    const table = el().querySelector('se-table')!.textContent!;
    expect(table).toContain('Founder & executive team');
    expect(table).toContain('Other strategic partners');
    expect(table).toContain('600,000');
    expect(table).toContain('150,000');
  });

  it('renders an equity split chart from configuration', () => {
    configurePortal();
    fixture = TestBed.createComponent(InvestmentPage);
    fixture.detectChanges();
    const chart = el().querySelector('se-bar-chart')!;
    expect(chart.textContent).toContain('Founder & executive team');
    expect(chart.textContent).toContain('Other strategic partners');
  });

  it('never shows a customer name, email or address', () => {
    configurePortal();
    fixture = TestBed.createComponent(InvestmentPage);
    fixture.detectChanges();
    expect(el().textContent).not.toMatch(/@|customer|address/i);
  });
});
