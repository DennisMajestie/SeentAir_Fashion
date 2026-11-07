import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ApiService, Product } from '../api.service';
import { AccountPage } from './account.page';

/**
 * Covers the unauthenticated favourites view. The `/account` route is intentionally
 * a public saved-products surface: guests see their local wishlist and we do not
 * render an authentication form for them.
 */
describe('AccountPage favourites', () => {
  let fixture: ComponentFixture<AccountPage>;
  let element: HTMLElement;

  const makeApi = (overrides: Partial<ApiService> = {}) =>
    ({
      isLoggedIn: false,
      login: () => of({}),
      logout: () => undefined,
      myOrders: () => of({ data: [], total: 0 }),
      notifications: () => of({ data: [] }),
      wishlist: () => of([]),
      ...overrides,
    }) as unknown as ApiService;

  const savedProduct = (over: Partial<Product> = {}): Product =>
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

  const setUp = (api: Partial<ApiService> = {}) => {
    TestBed.configureTestingModule({
      imports: [AccountPage],
      providers: [provideRouter([]), { provide: ApiService, useValue: makeApi(api) }],
    });
    fixture = TestBed.createComponent(AccountPage);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  };

  beforeEach(() => localStorage.clear());

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('shows guest wishlist items without rendering auth controls', () => {
    localStorage.setItem(
      'seentair.wishlist',
      JSON.stringify([
        {
          productId: 'p1',
          productName: 'Harmattan Hoodie',
          imageUrl: 'https://cdn.example.com/hoodie.png',
          price: 52000,
        },
      ]),
    );

    setUp();

    expect(element.querySelector('h1')?.textContent).toContain('Saved');
    expect(element.querySelectorAll('.saved-row').length).toBe(1);
    expect(element.textContent).toContain('Harmattan Hoodie');
    expect(element.querySelector('.auth-screen')).toBeNull();
    expect(element.querySelector('.auth-form')).toBeNull();
  });

  it('shows an empty favourite page when the guest has nothing saved', () => {
    setUp();

    expect(element.querySelector('h1')?.textContent).toContain('Saved');
    expect(element.querySelector('.saved-grid')).toBeNull();
    expect(element.querySelector('.auth-form')).toBeNull();
  });

  it('lists an authenticated account wishlist instead of the local one', () => {
    localStorage.setItem(
      'seentair.wishlist',
      JSON.stringify([
        {
          productId: 'local',
          productName: 'Local Jacket',
          imageUrl: null,
          price: 18000,
        },
      ]),
    );

    setUp({
      isLoggedIn: true,
      wishlist: () => of([{ product: savedProduct(), addedAt: '2026-01-01T00:00:00.000Z' }]),
    });

    expect(element.textContent).toContain('Harmattan Hoodie');
    expect(element.textContent).not.toContain('Local Jacket');
  });

  it('links saved items to their product pages', () => {
    localStorage.setItem(
      'seentair.wishlist',
      JSON.stringify([
        {
          productId: 'p1',
          productName: 'Harmattan Hoodie',
          imageUrl: null,
          price: 52000,
        },
      ]),
    );

    setUp();

    expect(element.querySelector('.saved-row')?.getAttribute('href')).toContain('/product/p1');
  });

  it('keeps the page usable when an authenticated wishlist request fails', () => {
    setUp({
      isLoggedIn: true,
      wishlist: () => throwError(() => new Error('offline')),
    });

    expect(element.querySelector('h1')?.textContent).toContain('Your account');
    expect(element.querySelector('.saved-grid')).toBeNull();
  });
});
