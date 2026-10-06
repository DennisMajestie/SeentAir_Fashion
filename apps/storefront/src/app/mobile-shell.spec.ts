import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ApiService, Product } from './api.service';
import { CartService } from './cart.service';
import { App } from './app';
import { MobileBottomNavComponent } from './mobile-bottom-nav.component';
import { MobileHeaderComponent } from './mobile-header.component';

/**
 * Phase 1 shell tests. The point of these is that the shell cannot lie: no
 * fabricated badge counts, no invented unread number, no duplicate
 * notification/cart destinations, and the header keeps the real catalogue
 * search rather than becoming a decorative pill.
 */
describe('Phase 1 mobile shell', () => {
  describe('MobileHeaderComponent', () => {
    let fixture: ComponentFixture<MobileHeaderComponent>;
    let element: HTMLElement;
    let products: Product[];

    const product = (over: Partial<Product> = {}): Product =>
      ({
        id: 'p1',
        name: 'Harmattan Tee',
        description: null,
        category: 'tops',
        basePrice: 18500,
        collection: null,
        createdAt: new Date().toISOString(),
        variants: [],
        ...over,
      }) as Product;

    beforeEach(async () => {
      products = [product(), product({ id: 'p2', name: 'Aba Jogger', category: 'bottoms' })];
      TestBed.configureTestingModule({
        imports: [MobileHeaderComponent],
        providers: [
          provideRouter([]),
          { provide: ApiService, useValue: { products: () => of({ data: products, total: 2 }) } },
          { provide: CartService, useValue: { count: 0 } },
        ],
      });
      fixture = TestBed.createComponent(MobileHeaderComponent);
      element = fixture.nativeElement as HTMLElement;
      fixture.detectChanges();
    });

    it('renders the service copy, with no unverifiable support-hours claim', () => {
      // The store promises render at the top of <main> (one shared row above
      // every routed page), so the assertion mounts the app shell rather than
      // the header alone.
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [App],
        providers: [
          provideRouter([]),
          { provide: ApiService, useValue: { products: () => of({ data: [], total: 0 }) } },
          { provide: CartService, useValue: { count: 0 } },
        ],
      });
      const app = TestBed.createComponent(App);
      app.detectChanges();
      const labels = [
        ...(app.nativeElement as HTMLElement).querySelectorAll('.m-svc__label'),
      ].map((n) => n.textContent?.trim());
      expect(labels).toEqual(['Fast Delivery', 'Quality Products', 'Easy Returns', 'Customer Care']);
    });

    it('uses the exact search placeholder from the reference', () => {
      const input = element.querySelector('.m-search__input') as HTMLInputElement;
      expect(input.placeholder).toBe('Search for clothes, underwear, kids wear…');
    });

    it('keeps the search a pill, not a full-screen block', () => {
      // Regression: the lead glyph is the <svg> itself while the camera glyph
      // is a <span> wrapping one. Sizing only the nested svg left the lead at
      // the browser's default replaced-element size, which grew the pill to
      // ~694px tall and buried the whole page under one white box.
      const search = element.querySelector('.m-search') as HTMLElement;
      const lead = element.querySelector('.m-search__lead') as SVGElement;
      const cam = element.querySelector('.m-search__cam svg') as SVGElement;
      expect(search.getBoundingClientRect().height).toBeLessThan(60);
      for (const glyph of [lead, cam]) {
        const r = glyph.getBoundingClientRect();
        expect(r.width).toBeLessThanOrEqual(16);
        expect(r.height).toBeLessThanOrEqual(16);
      }
      // The input has to get real width back, not the 19px the giant glyph left it.
      const input = element.querySelector('.m-search__input') as HTMLInputElement;
      expect(input.getBoundingClientRect().width).toBeGreaterThan(100);
    });

    it('uses the client logo asset, un-inverted on the dark header', () => {
      // Regression: logo-v1.png is a light-on-dark lockup (opaque #0e0e0e plate
      // with near-white glyphs), so inverting it rendered a near-white block over
      // the dark header. `screen` dissolves the black plate instead.
      const mark = element.querySelector('.m-brand__mark') as HTMLImageElement;
      expect(mark.getAttribute('src')).toBe('assets/logo-v1.png');

      const headerStyle = getComputedStyle(mark);
      expect(headerStyle.filter).not.toContain('invert');
      expect(headerStyle.mixBlendMode).toBe('screen');

      // Same asset on the white drawer needs the opposite treatment.
      const drawerMark = element.querySelector('.m-drawer__mark') as HTMLImageElement;
      expect(drawerMark.getAttribute('src')).toBe('assets/logo-v1.png');
      expect(getComputedStyle(drawerMark).filter).toContain('invert');
    });

    it('links search and cart to one destination each', () => {
      const cartLinks = [...element.querySelectorAll('.m-iconbtn')].filter((a) =>
        (a as HTMLAnchorElement).getAttribute('href')?.includes('/cart'),
      );
      expect(cartLinks.length).toBe(1);
      // The bell must not double as a second cart link.
      const hrefs = [...element.querySelectorAll('.m-iconbtn')].map((a) =>
        (a as HTMLAnchorElement).getAttribute('href'),
      );
      expect(hrefs.filter((h) => h?.includes('/cart')).length).toBe(1);
    });

    it('shows no notification badge while there is no unread count', () => {
      // The reference draws a red "3" on the bell, but nothing in the app can
      // know what is unread, so a badge here would be fabricated.
      expect(fixture.componentInstance.unreadCount()).toBe(0);
      expect(element.querySelectorAll('.m-iconbtn .m-badge').length).toBe(0);
    });

    it('shows a cart badge only when the cart holds something', () => {
      (TestBed.inject(CartService) as unknown as { count: number }).count = 2;
      fixture.detectChanges();
      const badges = [...element.querySelectorAll('.m-iconbtn .m-badge')].map((n) =>
        n.textContent?.trim(),
      );
      expect(badges).toEqual(['2']);
    });

    it('draws the bell and cart at the larger header size', () => {
      // Bell and cart are the two primary destinations in the header, so they
      // carry the oversized glyph; the magnifier and the PLP back chevron stay
      // at the smaller size. A plain `width: 26px` somewhere else would not
      // size these two, so assert on the class that selects them.
      const iconOf = (match: string) => {
        const link = [...element.querySelectorAll('.m-icons a')].find((a) =>
          (a as HTMLAnchorElement).getAttribute('href')?.includes(match),
        );
        return link!.querySelector('svg.m-ic')!;
      };

      for (const icon of [iconOf('notifications'), iconOf('/cart')]) {
        expect(icon.classList).toContain('m-ic--lg');
        // 26px, matching the bottom-nav glyph above it.
        expect(icon.getBoundingClientRect().width).toBe(26);
        expect(icon.getBoundingClientRect().height).toBe(26);
      }

      // A bigger glyph must not cost the tap target: the 44px floor still holds.
      for (const link of [...element.querySelectorAll('.m-icons a')]) {
        expect(link.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
        expect(link.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
      }

      // And the secondary icon, when this route renders one, stays the old size.
      const small = [...element.querySelectorAll('.m-icons .m-ic:not(.m-ic--lg)')];
      for (const icon of small) {
        expect(icon.getBoundingClientRect().width).toBe(21);
      }
    });

    it('keeps the drawer out of the tab order while closed', () => {
      const drawer = element.querySelector('#m-drawer') as HTMLElement;
      expect(drawer.hasAttribute('inert')).toBe(true);
      fixture.componentInstance.menuOpen.set(true);
      fixture.detectChanges();
      expect(drawer.hasAttribute('inert')).toBe(false);
    });

    it('searches the real catalogue, client-side', () => {
      const input = element.querySelector('.m-search__input') as HTMLInputElement;
      input.value = 'aba';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      expect(fixture.componentInstance.searchProducts().length).toBe(2);
      expect(fixture.componentInstance.searchResults().map((p) => p.id)).toEqual(['p2']);
    });

    it('caps a long result list at 8 rows', () => {
      // Separate setup: ensureCatalogueLoaded fetches once, so the cap has to be
      // exercised against a catalogue that already holds more than 8 matches.
      TestBed.resetTestingModule();
      const many = Array.from({ length: 20 }, (_, i) =>
        product({ id: `x${i}`, name: `match ${i}` }),
      );
      TestBed.configureTestingModule({
        imports: [MobileHeaderComponent],
        providers: [
          provideRouter([]),
          { provide: ApiService, useValue: { products: () => of({ data: many, total: 20 }) } },
          { provide: CartService, useValue: { count: 0 } },
        ],
      });
      const f2 = TestBed.createComponent(MobileHeaderComponent);
      f2.detectChanges();
      (f2.nativeElement as HTMLElement)
        .querySelector('.m-search__input')!
        .dispatchEvent(new Event('focus'));
      f2.detectChanges();
      f2.componentInstance.searchTerm.set('match');
      f2.detectChanges();
      expect(f2.componentInstance.searchResults().length).toBe(8);
    });
  });

  describe('MobileBottomNavComponent', () => {
    let fixture: ComponentFixture<MobileBottomNavComponent>;
    let element: HTMLElement;
    let router: Router;

    const mount = async (url: string) => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [MobileBottomNavComponent],
        providers: [
          provideRouter([
            { path: '', component: MobileBottomNavComponent },
            { path: 'cart', component: MobileBottomNavComponent },
            { path: 'orders', component: MobileBottomNavComponent },
            { path: 'orders/:id', component: MobileBottomNavComponent },
            { path: 'shop', component: MobileBottomNavComponent },
            { path: 'account', component: MobileBottomNavComponent },
            { path: '**', component: MobileBottomNavComponent },
          ]),
          { provide: CartService, useValue: { count: 0 } },
        ],
      });
      fixture = TestBed.createComponent(MobileBottomNavComponent);
      element = fixture.nativeElement as HTMLElement;
      router = TestBed.inject(Router);
      // Navigation is async: without awaiting, the component still reads the
      // initial URL and every active-tab assertion silently sees "Home".
      await router.navigateByUrl(url);
      fixture.detectChanges();
      return fixture;
    };

    it('renders the five tabs in reference order', async () => {
      await mount('/');
      const labels = [...element.querySelectorAll('.m-tab__label')].map((n) => n.textContent?.trim());
      expect(labels).toEqual(['Home', 'Categories', 'Cart', 'Orders', 'Profile']);
    });

    it('marks the tab matching the current route', async () => {
      await mount('/cart');
      const on = [...element.querySelectorAll('.m-tab.on .m-tab__label')].map((n) =>
        n.textContent?.trim(),
      );
      expect(on).toEqual(['Cart']);
    });

    it('keeps Orders on the real order list, since /orders/:id is a single order', async () => {
      await mount('/');
      const orders = [...element.querySelectorAll('.m-tab')].find(
        (a) => a.textContent?.includes('Orders'),
      ) as HTMLAnchorElement;
      expect(orders.getAttribute('href')).toContain('/account');
    });

    it('lights Orders on an order tracking page', async () => {
      await mount('/orders');
      const on = [...element.querySelectorAll('.m-tab.on .m-tab__label')].map((n) =>
        n.textContent?.trim(),
      );
      expect(on).toEqual(['Orders']);
    });
  });

  /**
   * The header varies by screen the way the reference does: Home carries the
   * full search pill, other screens get a compact magnifier, and the
   * product/category list gets the light header with a real category title.
   */
  describe('route-aware header', () => {
    let fixture: ComponentFixture<MobileHeaderComponent>;
    let element: HTMLElement;
    let router: Router;

    const mount = async (url: string): Promise<void> => {
      TestBed.configureTestingModule({
        imports: [MobileHeaderComponent],
        providers: [
          provideRouter([
            { path: 'shop', children: [] },
            { path: 'cart', children: [] },
          ]),
          { provide: ApiService, useValue: { products: () => of({ data: [], total: 0 }) } },
          { provide: CartService, useValue: { count: 0 } },
        ],
      });
      router = TestBed.inject(Router);
      await router.navigateByUrl(url);
      fixture = TestBed.createComponent(MobileHeaderComponent);
      element = fixture.nativeElement as HTMLElement;
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };

    it('shows the search pill inline on Home, with no magnifier', async () => {
      await mount('/');
      expect(element.querySelector('.m-search')).not.toBeNull();
      expect(element.querySelector('.m-iconbtn--btn')).toBeNull();
    });

    it('replaces the pill with a magnifier on other screens', async () => {
      await mount('/cart');
      expect(element.querySelector('.m-search')).toBeNull();
      const magnifier = element.querySelector('.m-iconbtn--btn') as HTMLButtonElement;
      expect(magnifier).not.toBeNull();
      expect(magnifier.getAttribute('aria-controls')).toBe('m-search-region');
    });

    it('reveals the same real search field when the magnifier is tapped', async () => {
      await mount('/cart');
      (element.querySelector('.m-iconbtn--btn') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(element.querySelector('.m-search__input')).not.toBeNull();
    });

    it('gives the product list the light header and a real category title', async () => {
      await mount('/shop?category=bottoms');
      const header = element.querySelector('.m-header') as HTMLElement;
      expect(header.classList).toContain('m-header--light');
      expect((element.querySelector('.m-plp__title') as HTMLElement).textContent?.trim()).toBe(
        'Bottoms',
      );
      // The reference's list header carries search and cart only, no bell.
      expect(element.querySelector('.m-back')).not.toBeNull();
      expect(element.querySelector('[aria-label="Notifications"]')).toBeNull();
    });
  });
});