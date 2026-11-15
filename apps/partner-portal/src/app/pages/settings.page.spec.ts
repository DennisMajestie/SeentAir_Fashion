import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrandAlertService } from '../brand-alert.service';
import { PortalStore } from '../portal.store';
import { configurePortal, dashboard } from '../testing';
import { SettingsPage } from './settings.page';

describe('SettingsPage', () => {
  let fixture: ComponentFixture<SettingsPage>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const alerts = jasmine.createSpyObj<BrandAlertService>('BrandAlertService', ['toast']);
  afterEach(() => {
    fixture?.destroy();
    alerts.toast.calls.reset();
  });

  function create(): void {
    fixture = TestBed.createComponent(SettingsPage);
    fixture.detectChanges();
  }

  it('shows the read-only profile record for this account', () => {
    configurePortal(dashboard(), [{ provide: BrandAlertService, useValue: alerts }]);
    create();
    const profile = el().querySelector('.profile-card')!.textContent!;
    expect(profile).toContain('Test Partner');
    expect(profile).toContain('partner@seentair.test');
    expect(profile).toContain('Partner / Investor');
    expect(profile).toContain('25% equity');
  });

  it('offers two-step verification enrolment when not yet enrolled', () => {
    configurePortal(dashboard(), [{ provide: BrandAlertService, useValue: alerts }]);
    create();
    expect(el().textContent).toContain('Not enrolled');
    expect(el().textContent).toContain('Begin enrolment');
  });

  it('offers a live code to disable when already enrolled', () => {
    configurePortal(dashboard(), [{ provide: BrandAlertService, useValue: alerts }]);
    TestBed.inject(PortalStore).me.set({
      id: 'p1',
      email: 'partner@seentair.test',
      name: 'Test Partner',
      role: 'partner_investor',
      totpEnabled: true,
    });
    create();
    expect(el().textContent).toContain('Enabled');
    expect(el().textContent).toContain('Disable two-step verification');
  });

  it('exposes the terminal theme toggle', () => {
    configurePortal(dashboard(), [{ provide: BrandAlertService, useValue: alerts }]);
    create();
    expect(el().textContent).toMatch(/Switch to (light|dark) mode/);
  });

  it('signs out through the real logout flow', () => {
    configurePortal(dashboard(), [{ provide: BrandAlertService, useValue: alerts }]);
    create();
    const btn = Array.from(el().querySelectorAll('button')).find((b) => b.textContent!.includes('Sign Out'))!;
    btn.click();
    expect(alerts.toast).toHaveBeenCalled();
  });
});
