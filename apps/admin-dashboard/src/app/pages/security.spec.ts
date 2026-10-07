import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SeConfirmService } from '@seentair/ui';
import { of, throwError } from 'rxjs';
import { ApiService } from '../api.service';
import { SecurityPage } from './security.page';

describe('SecurityPage', () => {
  let fixture: ComponentFixture<SecurityPage>;
  let api: jasmine.SpyObj<ApiService>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const mount = (me: unknown): void => {
    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'me',
      'setup2fa',
      'enable2fa',
      'disable2fa',
    ]);
    api.me.and.returnValue(me as never);
    api.disable2fa.and.returnValue(of({ enabled: false }));
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: ApiService, useValue: api }],
    });
    fixture = TestBed.createComponent(SecurityPage);
    fixture.detectChanges();
  };
  afterEach(() => fixture?.destroy());

  it('shows the account and offers to turn two-factor on when it is off', () => {
    mount(of({ name: 'Chidi N.', role: 'sales', totpEnabled: false }));
    expect(el().querySelector('h1')!.textContent).toBe('Security');
    expect(el().textContent).toContain('Chidi N.');
    expect(el().textContent).toContain('Turn on two-factor');
    expect(el().textContent).not.toContain('Turn off two-factor');
  });

  it('shows a failed profile load as an error, not as an empty page', () => {
    mount(throwError(() => ({ error: { message: 'Database is unreachable.' } })));
    expect(el().querySelector('.se-banner--danger')!.textContent).toContain(
      'Your account could not be loaded',
    );
  });

  it('validates the code under the field before anything is sent', async () => {
    mount(of({ name: 'Chidi N.', role: 'sales', totpEnabled: true }));
    fixture.componentInstance.code = '12';
    await fixture.componentInstance.disable();
    expect(fixture.componentInstance.codeError()).toContain('six-digit code');
    expect(api.disable2fa).not.toHaveBeenCalled();
  });

  it('asks before turning two-factor off, saying every session is signed out, and does nothing when declined', async () => {
    mount(of({ name: 'Chidi N.', role: 'sales', totpEnabled: true }));
    const ask = spyOn(TestBed.inject(SeConfirmService), 'ask').and.resolveTo(false);
    fixture.componentInstance.code = '123456';
    await fixture.componentInstance.disable();
    expect(ask.calls.mostRecent().args[0].title).toBe('Turn off two-factor sign-in?');
    expect(ask.calls.mostRecent().args[0].consequence).toContain('signed out');
    expect(ask.calls.mostRecent().args[0].danger).toBeTrue();
    expect(api.disable2fa).not.toHaveBeenCalled();
  });
});
