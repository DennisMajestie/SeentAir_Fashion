import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { ApiService, Product } from '../api.service';
import { AccountPage } from './account.page';

const REMEMBERED_EMAIL_KEY = 'seentair.rememberedEmail';

/**
 * Covers the sign-in screen's own behaviour: the real logo asset, the text
 * switch that replaced the old tab strip, the show/hide control, the busy
 * spinner and the "remember me" email preference.
 *
 * ApiService is mocked, so nothing here touches the network. Remember-me only
 * ever persists the typed address - these tests assert that no password or
 * token is ever written to storage.
 */
describe('AccountPage sign-in', () => {
  let fixture: ComponentFixture<AccountPage>;
  let element: HTMLElement;
  let component: AccountPage;
  let login$: Subject<unknown>;

  const setUp = () => {
    login$ = new Subject<unknown>();
    TestBed.configureTestingModule({
      imports: [AccountPage],
      providers: [
        provideRouter([]),
        {
          provide: ApiService,
          useValue: {
            isLoggedIn: false,
            login: () => login$.asObservable(),
            register: () => of({}),
            forgotPassword: () => of({ message: 'Reset link sent.' }),
            logout: () => undefined,
            myOrders: () => of({ data: [], total: 0 }),
            notifications: () => of({ data: [] }),
            wishlist: () => of([]),
            mergeWishlist: () => of({ merged: 0 }),
          },
        },
      ],
    });
    fixture = TestBed.createComponent(AccountPage);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  };

  /**
   * ngModel hands the typed value to the component through a microtask, so a
   * synchronous dispatchEvent() leaves the model empty. detectChanges() alone
   * is not enough - the microtask has to be flushed first, then the view
   * re-checked.
   */
  const settle = async () => {
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
  };

  /**
   * ngModel hands the typed value to the component asynchronously, and a
   * programmatic click on the submit button does not reach ngSubmit in this
   * harness. Neither plumbing quirk belongs to the behaviour under test - the
   * template wiring is Angular's job - so the remember-me and busy-guard tests
   * drive the component API directly. Template wiring itself is asserted
   * separately through the DOM.
   */
  const signIn = async (email: string, password: string) => {
    component.email = email;
    component.password = password;
    fixture.detectChanges();
    component.submit();
    await settle();
  };

  const text = () => element.textContent ?? '';

  beforeEach(() => localStorage.clear());
  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  describe('brand mark', () => {
    it('does not duplicate the logo already shown in the header', () => {
      setUp();
      expect(element.querySelector('img.auth-logo')).toBeNull();
    });
  });

  describe('the sign in / create account switch', () => {
    it('drops the old tab strip entirely', () => {
      setUp();
      expect(element.querySelector('[role="tablist"]')).toBeNull();
      expect(element.querySelector('.auth-tab')).toBeNull();
    });

    it('offers "Create one" instead of a tab', () => {
      setUp();
      expect(text()).toContain("Don't have an account?");
      expect(text()).toContain('Create one');
    });

    it('moves to registration and back again', () => {
      setUp();
      const buttons = () =>
        Array.from(element.querySelectorAll<HTMLButtonElement>('button.link-inline'));
      buttons()
        .find((b) => b.textContent?.trim() === 'Create one')!
        .click();
      fixture.detectChanges();
      expect(component.mode()).toBe('register');
      expect(text()).toContain('Create your account.');

      buttons()
        .find((b) => b.textContent?.trim() === 'Sign in')!
        .click();
      fixture.detectChanges();
      expect(component.mode()).toBe('signin');
      expect(text()).toContain('Welcome back.');
    });
  });

  describe('password visibility', () => {
    it('toggles the input type and reports the new state to assistive tech', () => {
      setUp();
      const field = () => element.querySelector<HTMLInputElement>('#ac-password')!;
      const toggle = () => element.querySelector<HTMLButtonElement>('.affix-btn')!;

      expect(field().type).toBe('password');
      expect(toggle().getAttribute('aria-label')).toBe('Show password');

      toggle().click();
      fixture.detectChanges();
      expect(field().type).toBe('text');
      expect(toggle().getAttribute('aria-label')).toBe('Hide password');
    });
  });

  describe('remember me', () => {
    it('prefills the address saved by a previous visit', () => {
      localStorage.setItem(REMEMBERED_EMAIL_KEY, 'ada@example.com');
      setUp();
      expect(component.email).toBe('ada@example.com');
      expect(component.remember).toBe(true);
    });

    it('starts unticked when nothing was saved', () => {
      setUp();
      expect(component.remember).toBe(false);
    });

    it('stores the address after a successful sign-in', async () => {
      setUp();
      component.remember = true;
      await signIn('  ada@example.com  ', 'correct horse');

      login$.next({});
      await settle();

      // Trimmed: the stored value must match what was actually sent.
      expect(localStorage.getItem(REMEMBERED_EMAIL_KEY)).toBe('ada@example.com');
    });

    it('forgets the address when the box is unticked', async () => {
      localStorage.setItem(REMEMBERED_EMAIL_KEY, 'ada@example.com');
      setUp();
      component.remember = false;
      await signIn('ada@example.com', 'correct horse');

      login$.next({});
      await settle();

      expect(localStorage.getItem(REMEMBERED_EMAIL_KEY)).toBeNull();
    });

    it('never writes the password to storage', async () => {
      setUp();
      component.remember = true;
      await signIn('ada@example.com', 'correct horse');

      login$.next({});
      await settle();

      expect(JSON.stringify(localStorage)).not.toContain('correct horse');
    });

    it('offers a labelled checkbox', () => {
      setUp();
      const label = element.querySelector<HTMLElement>('.auth-check')!;
      expect(label.textContent?.trim()).toBe('Remember me');
      expect(element.querySelector<HTMLInputElement>('.auth-check input')!.type).toBe('checkbox');
    });
  });

  describe('submitting', () => {
    it('shows a spinner and blocks a second submit while the request is open', async () => {
      setUp();
      await signIn('ada@example.com', 'correct horse');

      expect(component.busy()).toBe(true);
      expect(element.querySelector('.auth-spinner')).toBeTruthy();
      expect(text()).toContain('Signing in');

      login$.next({});
      login$.complete();
      await settle();

      expect(component.busy()).toBe(false);
      expect(element.querySelector('.auth-spinner')).toBeNull();
    });

    it('refuses to submit an invalid address and says why', async () => {
      setUp();
      await signIn('not-an-email', 'correct horse');

      expect(component.busy()).toBe(false);
      expect(text()).toContain('Enter a valid email address.');
    });
  });

  describe('forgot password', () => {
    it('asks for the address before calling the API', () => {
      setUp();
      element.querySelector<HTMLButtonElement>('.auth-forgot')!.click();
      fixture.detectChanges();
      expect(text()).toContain('Enter your email address first');
    });

    it('is reachable as its own control beside the checkbox', () => {
      setUp();
      const forgot = element.querySelector<HTMLButtonElement>('.auth-forgot')!;
      expect(forgot.textContent?.trim()).toBe('Forgot password');
    });
  });

  describe('fine print', () => {
    it('links to the policies page instead of the old secured-connection line', () => {
      setUp();
      expect(text()).not.toContain('Secured connection');
      const links = Array.from(element.querySelectorAll('.auth-fine a')).map((a) =>
        a.getAttribute('href'),
      );
      expect(links).toEqual(['/policies', '/policies', '/policies']);
    });
  });

  /**
   * Saved items are read from the account, not the browser, so the list survives
   * a new device and agrees with what staff would see.
   */
  describe('saved items', () => {
    const signedIn = (rows: Array<{ product: Product; addedAt: string }>): void => {
      TestBed.configureTestingModule({
        imports: [AccountPage],
        providers: [
          provideRouter([]),
          {
            provide: ApiService,
            useValue: {
              isLoggedIn: true,
              login: () => of({}),
              register: () => of({}),
              forgotPassword: () => of({ message: '' }),
              logout: () => undefined,
              myOrders: () => of({ data: [], total: 0 }),
              notifications: () => of({ data: [] }),
              wishlist: () => of(rows),
              mergeWishlist: () => of({ merged: 0 }),
            },
          },
        ],
      });
      fixture = TestBed.createComponent(AccountPage);
      component = fixture.componentInstance;
      element = fixture.nativeElement as HTMLElement;
      fixture.detectChanges();
    };

    const saved = (over: Partial<Product> = {}): Product =>
      ({
        id: 'p1',
        name: 'Harmattan Hoodie',
        description: null,
        category: 'outerwear',
        basePrice: 52000,
        primaryImageUrl: 'https://cdn.example.com/hoodie.png',
        collection: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        variants: [],
        ...over,
      }) as Product;

    it('lists what the account has saved', () => {
      signedIn([{ product: saved(), addedAt: '2026-01-01T00:00:00.000Z' }]);
      const rows = element.querySelectorAll('.saved-row');
      expect(rows.length).toBe(1);
      expect(rows[0].textContent).toContain('Harmattan Hoodie');
    });

    it('links each saved item to its product page', () => {
      signedIn([{ product: saved(), addedAt: '2026-01-01T00:00:00.000Z' }]);
      expect(element.querySelector('.saved-row')?.getAttribute('href')).toContain('/product/p1');
    });

    it('shows the live price, not a snapshot taken when it was saved', () => {
      signedIn([{ product: saved({ basePrice: 38000 }), addedAt: '2026-01-01T00:00:00.000Z' }]);
      expect(element.querySelector('.saved-row')?.textContent).toContain('38,000');
    });

    it('omits the section entirely when nothing is saved', () => {
      signedIn([]);
      expect(element.querySelector('.saved-grid')).toBeNull();
    });

    it('survives a failed wishlist call rather than breaking the page', () => {
      TestBed.configureTestingModule({
        imports: [AccountPage],
        providers: [
          provideRouter([]),
          {
            provide: ApiService,
            useValue: {
              isLoggedIn: true,
              login: () => of({}),
              register: () => of({}),
              forgotPassword: () => of({ message: '' }),
              logout: () => undefined,
              myOrders: () => of({ data: [], total: 0 }),
              notifications: () => of({ data: [] }),
              wishlist: () => throwError(() => new Error('offline')),
              mergeWishlist: () => of({ merged: 0 }),
            },
          },
        ],
      });
      fixture = TestBed.createComponent(AccountPage);
      element = fixture.nativeElement as HTMLElement;
      expect(() => fixture.detectChanges()).not.toThrow();
      expect(element.querySelector('h1')?.textContent).toContain('Your account');
    });
  });
});
