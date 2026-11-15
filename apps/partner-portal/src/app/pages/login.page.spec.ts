import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { ApiService, LoginResult } from '../api.service';
import { BrandAlertService } from '../brand-alert.service';
import { LoginPage } from './login.page';

describe('LoginPage', () => {
  let fixture: ComponentFixture<LoginPage>;
  let api: jasmine.SpyObj<ApiService>;
  let alerts: jasmine.SpyObj<BrandAlertService>;
  let router: Router;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const button = (text: string): HTMLButtonElement => {
    const b = Array.from(el().querySelectorAll('button')).find((x) =>
      x.textContent!.trim().startsWith(text),
    );
    if (!b) throw new Error(`No button "${text}"`);
    return b;
  };
  const type = (input: HTMLInputElement, value: string): void => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };
  /** Flush the synchronous API subscription behind each action. */
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 3; i++) await Promise.resolve();
    fixture.detectChanges();
  };

  const mount = (login: LoginResult): void => {
    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'login',
      'verify2fa',
      'forgotPassword',
    ]);
    api.login.and.returnValue(of(login));
    api.verify2fa.and.returnValue(of({ accessToken: 'st' }));
    api.forgotPassword.and.returnValue(of({ message: 'sent' }));
    alerts = jasmine.createSpyObj<BrandAlertService>('BrandAlertService', ['toast']);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ApiService, useValue: api },
        { provide: BrandAlertService, useValue: alerts },
      ],
    });
    router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl');
    fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
  };
  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  it('renders the security enclave shell and the access form', () => {
    mount({ accessToken: 'st' });
    expect(el().querySelector('header')!.textContent).toContain('Partner Portal Security Enclave');
    expect(el().querySelector('header')!.textContent).toContain('EQUITY REGISTRY');
    expect(el().querySelector('h1')!.textContent).toContain('SEENTAIR PARTNERS');
    expect(button('Proceed to 2FA Challenge')).toBeTruthy();
  });

  it('sends the credentials to the API and enters the portal without 2FA', async () => {
    mount({ accessToken: 'st' });
    fixture.componentInstance.email = 'p@seentair.test';
    fixture.componentInstance.password = 'key-123';
    button('Proceed to 2FA Challenge').click();
    await settle();
    expect(api.login).toHaveBeenCalledOnceWith('p@seentair.test', 'key-123');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/overview');
    expect(alerts.toast).toHaveBeenCalled();
  });

  it('switches to the challenge phase only when the API demands 2FA', async () => {
    mount({ requires2fa: true, challengeToken: 'tok' });
    fixture.componentInstance.email = 'p@seentair.test';
    fixture.componentInstance.password = 'key-123';
    button('Proceed to 2FA Challenge').click();
    await settle();
    expect(el().querySelector('header')!.textContent).toContain('MFA CHALLENGE');
    expect(el().querySelector('h1')!.textContent).toContain('Security Challenge Active');
    expect(el().querySelectorAll('input[maxlength="1"]').length).toBe(6);
  });

  it('shows the auth failure banner without navigating', async () => {
    mount({ accessToken: 'st' });
    api.login.and.returnValue(throwError(() => new Error('denied')));
    button('Proceed to 2FA Challenge').click();
    await settle();
    expect(el().querySelector('[role="alert"]')!.textContent).toContain('Authorization failed');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('verifies the six-digit code and enters the portal', async () => {
    mount({ requires2fa: true, challengeToken: 'tok' });
    fixture.componentInstance.email = 'p@seentair.test';
    fixture.componentInstance.password = 'key-123';
    button('Proceed to 2FA Challenge').click();
    await settle();

    const cells = el().querySelectorAll<HTMLInputElement>('input[maxlength="1"]');
    '849130'.split('').forEach((ch, i) => type(cells[i], ch));
    fixture.detectChanges();
    const verify = button('Verify & Enter Portal');
    expect((verify as HTMLButtonElement).disabled).toBeFalse();
    verify.click();
    await settle();
    expect(api.verify2fa).toHaveBeenCalledOnceWith('tok', '849130');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/overview');
  });

  it('keeps the verify button disabled until six digits are present', async () => {
    mount({ requires2fa: true, challengeToken: 'tok' });
    fixture.componentInstance.email = 'p@seentair.test';
    fixture.componentInstance.password = 'key-123';
    button('Proceed to 2FA Challenge').click();
    await settle();
    expect((button('Verify & Enter Portal') as HTMLButtonElement).disabled).toBeTrue();
  });

  it('answers the password reset door with a status note', async () => {
    mount({ accessToken: 'st' });
    fixture.componentInstance.email = 'p@seentair.test';
    button('Forgot key?').click();
    await settle();
    expect(el().querySelector('[role="status"]')!.textContent).toContain('reset link has been sent');
    expect(api.forgotPassword).toHaveBeenCalledOnceWith('p@seentair.test');
  });
});
