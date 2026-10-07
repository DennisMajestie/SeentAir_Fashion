import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { API_BASE } from './api.service';
import { App } from './app';

/**
 * The sign-in card doubling as the application form.
 *
 * A first-time bulk buyer has no account, so requiring them to sign in before
 * applying dead-ends at the login screen. The old "Apply for Wholesale Access"
 * button did exactly that -- it set an info string telling the visitor to sign
 * in and come back -- which is why these tests care about the toggle reaching a
 * real POST as well as about the form rendering.
 */
describe('App wholesale application form', () => {
  let fixture: ComponentFixture<App>;
  let http: HttpTestingController;

  async function boot(): Promise<void> {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    fixture = TestBed.createComponent(App);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function click(selector: string): void {
    (el().querySelector(selector) as HTMLElement).click();
    fixture.detectChanges();
  }

  /** Fill every required control through the component, as typing would. */
  function fillRequired(): void {
    const cmp = fixture.componentInstance;
    cmp.apply.name = 'Ada Okeke';
    cmp.apply.businessName = 'Okeke Fashion Boutique';
    cmp.email = 'ada@boutique.test';
    cmp.password = 'correct-horse';
    cmp.apply.city = 'Aba';
    cmp.apply.state = 'Abia';
  }

  beforeEach(async () => {
    await boot();
  });

  it('opens the application form from the B2B panel instead of printing an instruction', () => {
    // The regression: the CTA used to call info.set(...) with "Sign in above,
    // then use Apply ... in the catalogue". Nothing was submitted and no form
    // appeared, so the only path to an application started with an account the
    // visitor did not have.
    click('.apply-panel .cta.outline');

    expect(el().querySelector('#ap-business')).toBeTruthy();
    expect(el().querySelector('.auth-error, .auth-info')).toBeNull();
    expect(el().textContent).not.toContain('then use');
  });

  it('keeps the sign-in form out of the way while applying', () => {
    click('.apply-panel .cta.outline');

    expect(el().querySelector('#ws-password')).toBeNull();
    expect(el().textContent).toContain('Apply for wholesale access.');
  });

  it('returns to sign in without losing the typed application', () => {
    click('.apply-panel .cta.outline');
    fixture.componentInstance.apply.businessName = 'Okeke Fashion Boutique';
    fixture.detectChanges();

    click('.apply-back .link-inline');

    expect(el().querySelector('#ws-email')).toBeTruthy();
    expect(fixture.componentInstance.apply.businessName).toBe('Okeke Fashion Boutique');
  });

  it('posts the application to the public endpoint with the business details', () => {
    click('.apply-panel .cta.outline');
    fillRequired();
    fixture.componentInstance.submitApplication();
    fixture.detectChanges();

    const req = http.expectOne(`${API_BASE}/wholesale/apply`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      name: 'Ada Okeke',
      email: 'ada@boutique.test',
      password: 'correct-horse',
      businessName: 'Okeke Fashion Boutique',
      buyerType: 'retailer',
      businessPhone: undefined,
      city: 'Aba',
      state: 'Abia',
      openingVolume: undefined,
    });
    req.flush({ id: 'a1', status: 'pending' });
  });

  it('blocks submission and names the missing field rather than posting a blank application', () => {
    click('.apply-panel .cta.outline');
    fixture.componentInstance.submitApplication();
    fixture.detectChanges();

    http.expectNone(`${API_BASE}/wholesale/apply`);
    expect(el().querySelector('.auth-error')?.textContent).toContain('full name');
  });

  it('accepts a short volume estimate, because MOQ is checked at order time', () => {
    // Guarding the form against the 20-unit minimum would hide exactly the
    // demand the tier criteria are meant to be written against.
    click('.apply-panel .cta.outline');
    fillRequired();
    fixture.componentInstance.apply.openingVolume = '5';
    expect(fixture.componentInstance.applyError()).toBeNull();
  });

  it('confirms receipt and holds the password out of the DOM', () => {
    click('.apply-panel .cta.outline');
    fillRequired();
    fixture.componentInstance.submitApplication();
    fixture.detectChanges();
    http.expectOne(`${API_BASE}/wholesale/apply`).flush({ id: 'a1', status: 'pending' });
    fixture.detectChanges();

    expect(el().textContent).toContain('Application received');
    expect(fixture.componentInstance.password).toBe('');
    expect(el().querySelector('#ap-password')).toBeNull();
  });

  it('surfaces the API message when the email is already registered', () => {
    click('.apply-panel .cta.outline');
    fillRequired();
    fixture.componentInstance.submitApplication();
    fixture.detectChanges();

    http
      .expectOne(`${API_BASE}/wholesale/apply`)
      .flush(
        { message: 'That email is already registered.' },
        { status: 409, statusText: 'Conflict' },
      );
    fixture.detectChanges();

    // The server routes a known email to the catalogue flow, so the buyer has
    // to be told that rather than shown a generic failure.
    expect(el().querySelector('.auth-error')?.textContent).toContain('already registered');
  });
});
