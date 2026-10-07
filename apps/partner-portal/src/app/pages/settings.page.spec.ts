import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PortalStore } from '../portal.store';
import { configurePortal } from '../testing';
import { SettingsPage } from './settings.page';

describe('SettingsPage', () => {
  let fixture: ComponentFixture<SettingsPage>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  afterEach(() => fixture?.destroy());

  it('shows the read-only profile record for this account', () => {
    configurePortal();
    fixture = TestBed.createComponent(SettingsPage);
    fixture.detectChanges();
    const profile = el().querySelector('se-card')!.textContent!;
    expect(profile).toContain('Test Partner');
    expect(profile).toContain('partner@seentair.test');
    expect(profile).toContain('Partner / Investor');
  });

  it('offers two-step verification enrolment when not yet enrolled', () => {
    configurePortal();
    fixture = TestBed.createComponent(SettingsPage);
    fixture.detectChanges();
    expect(el().textContent).toContain('Not enrolled');
    expect(el().textContent).toContain('Begin enrolment');
  });

  it('offers a live code to disable when already enrolled', () => {
    configurePortal();
    TestBed.inject(PortalStore).me.set({
      id: 'p1',
      email: 'partner@seentair.test',
      name: 'Test Partner',
      role: 'partner_investor',
      totpEnabled: true,
    });
    fixture = TestBed.createComponent(SettingsPage);
    fixture.detectChanges();
    expect(el().textContent).toContain('Enrolled');
    expect(el().textContent).toContain('Disable two-step verification');
  });

  it('exposes the terminal theme toggle', () => {
    configurePortal();
    fixture = TestBed.createComponent(SettingsPage);
    fixture.detectChanges();
    expect(el().textContent).toMatch(/Switch to (light|dark) mode/);
  });
});
