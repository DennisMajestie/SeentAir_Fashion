import { ComponentFixture, TestBed } from '@angular/core/testing';
import { configurePortal, dashboard } from '../testing';
import { OverviewPage } from './overview.page';

describe('OverviewPage', () => {
  let fixture: ComponentFixture<OverviewPage>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  afterEach(() => fixture?.destroy());

  it('shows the headline figures and the latest distribution as money from configuration', () => {
    configurePortal();
    fixture = TestBed.createComponent(OverviewPage);
    fixture.detectChanges();
    expect(el().querySelector('h1')!.textContent).toBe('Welcome back, Test');
    const metrics = el().querySelector('.se-metric-grid')!.textContent!;
    expect(metrics).toContain('₦2,777,000');
    expect(metrics).toContain('91.0% margin');
    expect(metrics).toContain('1,148');
    expect(el().textContent).toContain('₦100,000');
    expect(el().textContent).toContain('250,000 of 1,000,000');
  });

  it('says plainly when there is no distribution and too little history for a chart', () => {
    configurePortal(dashboard({ profitSharing: [] }));
    fixture = TestBed.createComponent(OverviewPage);
    fixture.detectChanges();
    expect(el().textContent).toContain('No distributions yet');
    expect(el().querySelector('se-bar-chart')).toBeNull();
  });

  it('never shows a customer name, email or address', () => {
    configurePortal();
    fixture = TestBed.createComponent(OverviewPage);
    fixture.detectChanges();
    expect(el().textContent).not.toMatch(/@|customer|address/i);
  });
});
