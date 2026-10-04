import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Product } from './api.service';
import { NO_REVIEWS_COPY, ProductCardComponent } from './product-card.component';
import { WishlistService } from './wishlist.service';

/**
 * The card is the only thing between a shopper and a product, and three of its
 * fields are only conditionally real: reviews, the "New" badge and (one day)
 * a compare-at price. These tests exist to catch the card inventing data --
 * five grey stars on a product nobody reviewed is a fabricated score, and a
 * "was" price with no markdown behind it is a fabricated discount.
 */
describe('ProductCardComponent', () => {
  let fixture: ComponentFixture<ProductCardComponent>;
  let element: HTMLElement;

  const variant = (over: Partial<Product['variants'][number]> = {}) => ({
    id: 'v1',
    sku: 'TEE-BLK-M',
    size: 'M',
    colour: 'black',
    priceOverride: null,
    imageUrl: 'https://cdn.example/tee.jpg',
    availabilityStatus: 'in_stock',
    ...over,
  });

  /** ISO timestamp `days` before right now -- the New rule reads the wall clock. */
  const daysAgo = (days: number): string =>
    new Date(Date.now() - days * 86_400_000).toISOString();

  const product = (over: Partial<Product> = {}): Product => ({
    id: 'p1',
    name: 'Harmattan Tee',
    description: null,
    category: 'tops',
    basePrice: 18500,
    collection: null,
    // 3 days old by default, so the default fixture is inside the New window.
    createdAt: daysAgo(3),
    variants: [variant()],
    ...over,
  });

  const mount = (p: Product, rating: { avg: number; count: number } | null = null) => {
    TestBed.configureTestingModule({
      imports: [ProductCardComponent],
      providers: [provideRouter([])],
    });
    fixture = TestBed.createComponent(ProductCardComponent);
    fixture.componentRef.setInput('product', p);
    fixture.componentRef.setInput('index', 0);
    fixture.componentRef.setInput('rating', rating);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  };

  const text = () => element.textContent ?? '';

  afterEach(() => {
    // WishlistService persists to localStorage and rehydrates on construction, so
    // without this a product favourited in one test arrives already favourited in
    // the next and the "un-pressed" assertion passes for the wrong reason.
    localStorage.removeItem('seentair.wishlist');
    TestBed.resetTestingModule();
  });

  describe('price row', () => {
    it('renders the single real price', () => {
      mount(product());
      expect(text()).toContain('18,500');
    });

    it('renders no strikethrough anywhere, because there is no compare-at field', () => {
      // products.base_price is the only price column in the schema, so there is
      // no real markdown to show. Rendering a "was" price here would be an
      // invented discount -- the bug this whole exercise was traced from.
      mount(product());
      expect(element.querySelector('s')).toBeNull();
      expect(element.querySelector('del')).toBeNull();
      expect(element.querySelector('.was')).toBeNull();
      expect(element.querySelector('.price s')).toBeNull();
      expect(getComputedStyle(element.querySelector('.price')!).textDecorationLine).not.toBe(
        'line-through',
      );
    });

    it('still renders no strike when the product is priced at zero', () => {
      // The edge case a naive `price !== originalPrice` check gets wrong.
      mount(product({ basePrice: 0 }));
      expect(element.querySelector('s, del')).toBeNull();
      expect(text()).toContain('0');
    });
  });

  describe('rating row', () => {
    it('draws stars and a count when real reviews exist', () => {
      mount(product(), { avg: 4.5, count: 12 });
      expect(element.querySelector('.stars-line')).not.toBeNull();
      expect(text()).toContain('4.5');
      expect(text()).toContain('(12)');
    });

    it('never shows a star score for a product with zero reviews', () => {
      // The failure mode this guards: rendering five empty stars, which reads
      // as "rated 0" or as a broken widget, for a product with no reviews at all.
      mount(product(), null);
      expect(element.querySelector('.stars-line')).toBeNull();
      expect(element.querySelector('.stars')).toBeNull();
      expect(text()).not.toContain('☆');
    });

    it('uses the same empty-state copy as the product page', () => {
      mount(product(), null);
      expect(text()).toContain(NO_REVIEWS_COPY);
      expect(NO_REVIEWS_COPY).toBe('No reviews yet: reviews open after delivery.');
    });

    it('does not show the empty state once there are reviews', () => {
      mount(product(), { avg: 3, count: 1 });
      expect(text()).not.toContain(NO_REVIEWS_COPY);
    });
  });

  describe('New badge', () => {
    it('badges a product created inside the existing 30-day window', () => {
      mount(product({ createdAt: daysAgo(29) }));
      expect(text()).toContain('New');
    });

    it('does not badge a product older than the window', () => {
      mount(product({ createdAt: daysAgo(31) }));
      expect(text()).not.toContain('New');
    });

    it('still prefers Sold out over New, so a dead product is not advertised as new', () => {
      mount(
        product({
          variants: [variant({ availabilityStatus: 'out_of_stock' })],
        }),
      );
      const badge = element.querySelector('.badge')!;
      expect(badge.textContent).toContain('Sold out');
      expect(badge.textContent).not.toContain('New');
    });
  });

  describe('colorway swatches', () => {
    it('renders one swatch per real colour variant, from the variant data', () => {
      mount(
        product({
          variants: [
            variant({ id: 'v1', colour: 'black' }),
            variant({ id: 'v2', colour: 'bone' }),
            variant({ id: 'v3', colour: 'indigo' }),
          ],
        }),
      );
      expect(element.querySelectorAll('.dots .swatch').length).toBe(3);
      expect(text()).toContain('3 colours');
    });

    it('de-duplicates colours that repeat across sizes', () => {
      mount(
        product({
          variants: [
            variant({ id: 'v1', size: 'S', colour: 'black' }),
            variant({ id: 'v2', size: 'M', colour: 'black' }),
            variant({ id: 'v3', size: 'L', colour: 'bone' }),
          ],
        }),
      );
      expect(element.querySelectorAll('.dots .swatch').length).toBe(2);
      expect(text()).toContain('2 colours');
    });

    it('shows a single-colour product with no count label', () => {
      // Singular carries no number: "1 colours" is the tell that a count is
      // being printed rather than derived.
      mount(product());
      expect(element.querySelectorAll('.dots .swatch').length).toBe(1);
      expect(text()).not.toContain('1 colours');
      expect(text()).not.toContain('colour');
    });

    it('renders no swatch and no crash when variants carry no colour', () => {
      mount(
        product({
          variants: [variant({ colour: null })],
        }),
      );
      expect(element.querySelectorAll('.dots .swatch').length).toBe(0);
      expect(text()).not.toContain('colours');
    });
  });

  describe('favorite control', () => {
    it('exposes a pressed state that reflects the real wishlist', () => {
      // mount() first: the wishlist is a root singleton, so injecting before
      // TestBed is configured throws rather than handing back the test instance.
      mount(product());
      const wishlist = TestBed.inject(WishlistService);

      const heart = element.querySelector('.heart-btn')!;
      expect(heart.getAttribute('aria-pressed')).toBe('false');

      wishlist.toggle(product());
      fixture.detectChanges();
      expect(element.querySelector('.heart-btn')!.getAttribute('aria-pressed')).toBe('true');
    });

    it('names the product in its accessible label, in both directions', () => {
      mount(product());
      const heart = element.querySelector('.heart-btn')!;
      expect(heart.getAttribute('aria-label')).toBe('Add Harmattan Tee to wishlist');

      TestBed.inject(WishlistService).toggle(product());
      fixture.detectChanges();
      expect(element.querySelector('.heart-btn')!.getAttribute('aria-label')).toBe(
        'Remove Harmattan Tee from wishlist',
      );
    });
  });
});