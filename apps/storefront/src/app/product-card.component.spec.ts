import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Product } from './api.service';
import { CartService } from './cart.service';
import { NO_REVIEWS_COPY, ProductCardComponent } from './product-card.component';
import { WishlistService } from './wishlist.service';

/**
 * Three cards in a real CSS grid, at the column counts and widths the app
 * actually uses: 5-up above 980px, 3-up between 620 and 980px, 2-up below
 * 620px. The layout tests below compare measured heights, so the cards have to
 * be laid out by the same grid rules the shop and home rails use -- measuring a
 * card in isolation, or at a width the app never renders, would let a stretched
 * row do the work and prove nothing.
 */
@Component({
  selector: 'app-card-grid-host',
  imports: [ProductCardComponent],
  template: `
<div
        class="host-grid"
        [class.c2]="cols === 2"
        [class.c3]="cols === 3"
        [class.c5]="cols === 5"
        [style.width.px]="width"
      >
        @for (p of products; track p.id) {
          <app-product-card [product]="p" [index]="$index" [rating]="ratingOf(p)" />
        }
      </div>
    `,
    styles: [
      `
      .host-grid {
        display: grid;
        gap: 14px;
      }
      .host-grid.c2 {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .host-grid.c3 {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .host-grid.c5 {
        grid-template-columns: repeat(5, minmax(0, 1fr));
      }
    `,
  ],
})
class CardGridHostComponent {
  /** Grid width in CSS px, and the column count the app uses at that width. */
  width = 375;
  cols = 2;

  /**
   * Short, long and medium names, from the brief's own examples.
   *
   * Order matters: the grid is 2-up on a phone, so the short and long names have
   * to be the first two cards to share a row with each other. That pair is the
   * one the brief cares about -- same length of name against the opposite
   * extreme -- and the rated card sits on the second row to be compared by row
   * height rather than by position.
   */
  readonly products: Product[] = [
    {
      id: 'p1',
      name: 'Men Underwear',
      description: null,
      category: 'tops',
      basePrice: 18500,
      collection: null,
      // Outside the New window: no badge, so the photo has no overlay to displace.
      createdAt: new Date(Date.now() - 90 * 86_400_000).toISOString(),
      variants: [
        {
          id: 'v1',
          sku: 'U-M',
          size: 'M',
          colour: 'black',
          priceOverride: null,
          imageUrl: 'https://cdn.example/a.jpg',
          availabilityStatus: 'in_stock',
        },
      ],
      soldCount: 4,
    },
    {
      id: 'p2',
      name: "Premium Men's 2-Piece Cotton Underwear Set With Comfortable Elastic Waistband For Everyday Use",
      description: null,
      category: 'tops',
      basePrice: 25000,
      collection: null,
      // Badged, unrated and multi-variant: the other three conditions at once.
      createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      variants: [
        {
          id: 'v3',
          sku: 'U-S',
          size: 'S',
          colour: 'bone',
          priceOverride: null,
          imageUrl: 'https://cdn.example/b.jpg',
          availabilityStatus: 'in_stock',
        },
        {
          id: 'v4',
          sku: 'U-L',
          size: 'L',
          colour: 'olive',
          priceOverride: null,
          imageUrl: null,
          availabilityStatus: 'in_stock',
        },
      ],
      soldCount: 0,
    },
    {
      id: 'p3',
      name: 'Men 2-Piece Set',
      description: null,
      category: 'tops',
      basePrice: 32000,
      collection: null,
      createdAt: new Date(Date.now() - 90 * 86_400_000).toISOString(),
      variants: [
        {
          id: 'v2',
          sku: 'S-M',
          size: 'M',
          colour: 'clay',
          priceOverride: null,
          imageUrl: 'https://cdn.example/c.jpg',
          availabilityStatus: 'in_stock',
        },
      ],
      soldCount: 12,
    },
  ];

  /** Only the last card is rated, so the rating row is compared across states. */
  ratingOf(p: Product): { avg: number; count: number } | null {
    return p.id === 'p3' ? { avg: 4.3, count: 124 } : null;
  }
}

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
    // Reset first so a test can mount twice to compare two states. Without this
    // the second configureTestingModule throws "test module has already been
    // instantiated" -- a comparison test would have to be split for no reason.
    TestBed.resetTestingModule();
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

    it('renders no strikethrough anywhere when the product is not on sale', () => {
      // A "was" price is only ever shown for a real timed sale (salePercent +
      // saleEndsAt on the product). Rendering one without a sale behind it
      // would be an invented discount -- the bug this card was once traced to.
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
    it('draws the real star rating when reviews exist', () => {
      mount(product(), { avg: 4.3, count: 12 });
      expect(element.querySelector('.stars-line')).not.toBeNull();
      expect(element.querySelector('.stars')?.textContent?.trim()).toBe('★★★★☆');
    });

    it('shows the number of orders after the stars, from the real soldCount', () => {
      mount(product({ soldCount: 42 }), { avg: 4.3, count: 12 });
      expect(element.querySelector('.stars-sold')?.textContent?.trim()).toBe('(42)');
      // The buyer count reads after the stars, so it must come after them in
      // reading order as well as visually.
      const spans = [...element.querySelectorAll('.stars-line span')].map((s) =>
        s.textContent?.trim(),
      );
      expect(spans).toEqual(['★★★★☆', '(42)']);
    });

    it('prints no bought count when nothing has sold', () => {
      mount(product({ soldCount: 0 }), { avg: 4.3, count: 12 });
      expect(element.querySelector('.stars-sold')).toBeNull();
    });

    it('keeps the real bought count after the unrated stars', () => {
      // Zero reviews but real orders: the count must still show, and the five
      // stars must stay muted -- nothing here is a fabricated score.
      mount(product({ soldCount: 7 }), null);
      expect(element.querySelector('.stars-sold')?.textContent?.trim()).toBe('(7)');
      expect(element.querySelector('.no-reviews-stars')).not.toBeNull();
    });

    it('announces rating details without printing an invented caption', () => {
      // The visible row is stars + buyers. The review depth lives only in the
      // accessible name, so a sighted reader gets the compact card and a screen
      // reader still hears "from 12 reviews".
      mount(product({ soldCount: 3 }), { avg: 4.3, count: 12 });
      expect(element.querySelector('.stars-line')!.getAttribute('aria-label')).toBe(
        '3 bought. 4.3 out of 5 from 12 reviews.',
      );
    });

    it('shows five muted stars and no caption when there are zero reviews', () => {
      mount(product(), null);
      const stars = element.querySelector('.stars-line .no-reviews-stars')!;
      expect(stars.textContent?.trim()).toBe('☆☆☆☆☆');
      // The caption is deliberately gone from the card.
      expect(text()).not.toContain(NO_REVIEWS_COPY);
    });

    it('keeps the unrated stars out of the gold that means "rated"', () => {
      // The whole point of the muted colour: --primary-fill is what .stars uses
      // for a real score, so an unrated row must not wear it. Read the colour
      // out before remounting -- after resetTestingModule the old node is
      // detached and getComputedStyle would return nothing useful.
      mount(product(), null);
      const unratedColor = getComputedStyle(
        element.querySelector('.no-reviews-stars')!,
      ).color;

      mount(product(), { avg: 5, count: 1 });
      const ratedColor = getComputedStyle(element.querySelector('.stars')!).color;

      expect(unratedColor).not.toBe(ratedColor);
    });

    it('still announces the unrated state to assistive tech', () => {
      // Five glyphs carry no meaning as text. Without role="img" + a label, the
      // card would tell a screen reader nothing at all and "unrated" would be
      // silently dropped -- so the shared copy is the accessible name.
      mount(product(), null);
      const row = element.querySelector('.stars-line')!;
      expect(row.getAttribute('role')).toBe('img');
      expect(row.getAttribute('aria-label')).toBe(NO_REVIEWS_COPY);
      expect(NO_REVIEWS_COPY).toBe('No reviews yet: reviews open after delivery.');
    });

    it('hides the decorative glyphs from assistive tech', () => {
      // aria-hidden on the glyphs, label on the parent: read as one image rather
      // than as five separate stars.
      mount(product(), null);
      const stars = element.querySelector('.no-reviews-stars')!;
      expect(stars.getAttribute('aria-hidden')).toBe('true');
    });

    it('drops the unrated treatment once there are reviews', () => {
      // Asserts on the class, not on text(): the copy now lives in an aria-label,
      // so a text assertion would pass for both branches and prove nothing.
      mount(product(), null);
      expect(element.querySelector('.no-reviews-stars')).not.toBeNull();

      mount(product(), { avg: 3, count: 1 });
      expect(element.querySelector('.no-reviews-stars')).toBeNull();
      expect(element.querySelector('.stars-line')!.getAttribute('role')).toBeNull();
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

  describe('Bestseller badge', () => {
    it('badges a product the seller flagged', () => {
      mount(product({ isBestseller: true }));
      const badge = element.querySelector('.badge')!;
      expect(badge.textContent).toContain('Bestseller');
    });

    it('does not badge an unflagged product however many it sells', () => {
      mount(product({ soldCount: 500, isBestseller: false }));
      expect(element.querySelector('.badge')?.textContent).not.toContain('Bestseller');
    });

    it('outranks the time-window "New" default, so a fresh bestseller is not mislabelled', () => {
      mount(product({ createdAt: daysAgo(1), isBestseller: true }));
      const badge = element.querySelector('.badge')!;
      expect(badge.textContent).toContain('Bestseller');
      expect(badge.textContent).not.toContain('New');
    });

    it('still prefers Sold out over Bestseller, so a dead product is not advertised', () => {
      mount(
        product({
          isBestseller: true,
          variants: [variant({ availabilityStatus: 'out_of_stock' })],
        }),
      );
      const badge = element.querySelector('.badge')!;
      expect(badge.textContent).toContain('Sold out');
      expect(badge.textContent).not.toContain('Bestseller');
    });

    it('still prefers Made to order, because the bespoke wait is a real commitment', () => {
      mount(
        product({
          isBestseller: true,
          variants: [variant({ availabilityStatus: 'made_to_order' })],
        }),
      );
      const badge = element.querySelector('.badge')!;
      expect(badge.textContent).toContain('Made to order');
      expect(badge.textContent).not.toContain('Bestseller');
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

  describe('timed sale', () => {
    const HOUR = 3_600_000;
    /** 20% off for another three hours, as the API would send it. */
    const onSale = (over: Partial<Product> = {}): Product =>
      product({
        basePrice: 5000,
        salePercent: 20,
        salePrice: 4000,
        saleEndsAt: new Date(Date.now() + 3 * HOUR).toISOString(),
        ...over,
      });
    const text = (sel: string): string =>
      (element.querySelector(sel)?.textContent ?? '').replace(/\s+/g, ' ').trim();

    it('shows the sale price, with the normal price struck through beside the clock', () => {
      mount(onSale());
      expect(text('.price')).toBe('₦4,000');
      expect(element.querySelector('.price')!.classList).toContain('price--sale');
      expect(text('.sale-line s.sale-was')).toBe('₦5,000');
    });

    it('counts down to the real end of the sale', () => {
      mount(onSale());
      // Three hours out: a ticking hh:mm:ss just under 03:00:00.
      expect(text('.sale-clock')).toMatch(/^02:59:\d{2}$/);
    });

    it('shows days and hours when the sale ends more than a day away', () => {
      mount(onSale({ saleEndsAt: new Date(Date.now() + 50 * HOUR).toISOString() }));
      expect(text('.sale-clock')).toMatch(/^2d 0[12]h$/);
    });

    it('badges the card with the discount', () => {
      mount(onSale());
      expect(text('.badge')).toBe('−20%');
    });

    it('states the sale once in words for a screen reader and hides the ticking clock', () => {
      mount(onSale());
      expect(text('.sale-line .sr-only')).toContain('On sale: was ₦5,000, 20% off, until');
      expect(element.querySelector('.sale-ends')!.getAttribute('aria-hidden')).toBe('true');
      expect(element.querySelector('.sale-was')!.getAttribute('aria-hidden')).toBe('true');
    });

    it('shows nothing of a sale on a product that is not on sale', () => {
      mount(product({ basePrice: 5000 }));
      expect(text('.price')).toBe('₦5,000');
      expect(element.querySelector('.sale-was')).toBeNull();
      expect(element.querySelector('app-sale-countdown')).toBeNull();
    });

    it('ignores a sale whose end time has passed, even if the payload still carries it', () => {
      // A page left open past the end, or a cached response.
      mount(onSale({ saleEndsAt: new Date(Date.now() - HOUR).toISOString() }));
      expect(text('.price')).toBe('₦5,000');
      expect(element.querySelector('.sale-was')).toBeNull();
    });

    it('ignores a discount the server did not mark as live', () => {
      // salePrice is the server's "running now" flag: without it there is no sale.
      mount(onSale({ salePrice: null }));
      expect(text('.price')).toBe('₦5,000');
      expect(element.querySelector('.sale-was')).toBeNull();
    });

    it('keeps the sale line the same height with or without a sale, so rows stay level', () => {
      mount(onSale());
      const withSale = element.querySelector<HTMLElement>('.sale-line')!.offsetHeight;
      const info = element.querySelector<HTMLElement>('.product-info')!.offsetHeight;
      fixture.destroy();
      mount(product({ basePrice: 5000 }));
      expect(element.querySelector<HTMLElement>('.sale-line')!.offsetHeight).toBe(withSale);
      expect(element.querySelector<HTMLElement>('.product-info')!.offsetHeight).toBe(info);
    });
  });

  /**
   * The floating cart button has two honest outcomes: add the one variant that
   * is unambiguous, or send the shopper to the product page to choose. The bug
   * these cover is the third option -- a real size range silently doing nothing.
   */
  describe('cart button', () => {
    let cart: { add: jasmine.Spy };
    let router: Router;

    const mountCard = (p: Product) => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [ProductCardComponent],
        providers: [provideRouter([])],
      });
      cart = { add: jasmine.createSpy('add') };
      TestBed.overrideProvider(CartService, { useValue: cart });
      router = TestBed.inject(Router);
      spyOn(router, 'navigate').and.resolveTo(true);
      fixture = TestBed.createComponent(ProductCardComponent);
      fixture.componentRef.setInput('product', p);
      fixture.componentRef.setInput('index', 0);
      element = fixture.nativeElement as HTMLElement;
      fixture.detectChanges();
    };

    const tap = (): void => {
      (element.querySelector('.cartbtn') as HTMLButtonElement).click();
      fixture.detectChanges();
    };

    it('adds directly when one-size is in stock', () => {
      mountCard(product({ variants: [variant({ size: 'OS' })] }));
      tap();
      expect(cart.add).toHaveBeenCalledTimes(1);
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('sends the shopper to the product page when a size must be chosen', () => {
      mountCard(
        product({
          variants: [
            variant({ id: 'v1', size: 'S' }),
            variant({ id: 'v2', size: 'M' }),
            variant({ id: 'v3', size: 'L' }),
          ],
        }),
      );
      tap();
      expect(cart.add).not.toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['/product', 'p1']);
    });

    it('says which of the two things the button will do', () => {
      mountCard(product({ variants: [variant({ size: 'OS' })] }));
      expect(element.querySelector('.cartbtn')!.getAttribute('aria-label')).toBe(
        'Add Harmattan Tee to cart',
      );

      mountCard(product({ variants: [variant({ size: 'S' }), variant({ id: 'v2', size: 'M' })] }));
      expect(element.querySelector('.cartbtn')!.getAttribute('aria-label')).toBe(
        'Choose size and colour for Harmattan Tee',
      );
    });

    it('is omitted entirely for a sold-out product', () => {
      mountCard(product({ variants: [variant({ availabilityStatus: 'out_of_stock' })] }));
      expect(element.querySelector('.cartbtn')).toBeNull();
      // The price row still renders, so a sold-out card keeps the same height.
      expect(element.querySelector('.price-row')).not.toBeNull();
    });
  });

  /**
   * Layout contract, measured rather than asserted from the stylesheet.
   *
   * These run in a real browser with the app's global stylesheet loaded, so the
   * geometry below is what a shopper would actually see. The point is the three
   * failures this refinement exists to stop: a long name making its card taller,
   * the price drifting out of alignment, and the cart button riding up and down
   * with the name.
   */
  describe('layout stability', () => {
    let hostFixture: ComponentFixture<CardGridHostComponent>;

    /** The short and long names the brief calls out. */
    const shortName = 'Men Underwear';
    const longName =
      "Premium Men's 2-Piece Cotton Underwear Set With Comfortable Elastic Waistband For Everyday Use";

    /** Mounted at the phone size the brief specifies: 375px, 2-up. */
    const mountGrid = (): HTMLElement[] => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [CardGridHostComponent],
        providers: [provideRouter([])],
      });
      hostFixture = TestBed.createComponent(CardGridHostComponent);
      const el = hostFixture.nativeElement as HTMLElement;
      hostFixture.detectChanges();
      // Real fonts and images resolve asynchronously; layout must settle before
      // heights are compared or these numbers measure a mid-load state.
      return Array.from(el.querySelectorAll<HTMLElement>('.card'));
    };

    /** Same three cards at another of the app's real breakpoints. */
    const remountAt = (width: number, cols: number): HTMLElement[] => {
      const cards = mountGrid();
      hostFixture.componentInstance.width = width;
      hostFixture.componentInstance.cols = cols;
      hostFixture.detectChanges();
      return cards;
    };

    /** Largest minus smallest, which is the number that has to stay at zero. */
    const spread = (values: number[]): number =>
      Math.max(...values) - Math.min(...values);

    /**
     * The cards that share the first grid row.
     *
     * Comparing a card's top against a card on the *next* row would measure the
     * row gap, not the layout, so anything asserting a shared vertical position
     * has to be limited to one row. Three cards in a 2-up grid are two rows.
     */
    const inOneRow = (cards: HTMLElement[]): HTMLElement[] =>
      cards.slice(0, hostFixture.componentInstance.cols);

    const topsOf = (cards: HTMLElement[], sel: string): number[] =>
      cards.map((c) => c.querySelector<HTMLElement>(sel)!.getBoundingClientRect().top);

    it('renders three cards side by side in a real grid, not a stack', () => {
      const cards = mountGrid();
      expect(cards.length).toBe(3);
      // Two distinct horizontal positions and two rows. If this fails, every
      // "aligned across the row" assertion below is measuring something else.
      const row = inOneRow(cards);
      expect(row.length).toBe(2);
      expect(
        spread(row.map((c) => c.querySelector<HTMLElement>('.thumb')!.getBoundingClientRect().left)),
      ).toBeGreaterThan(0);
      // The third card wrapped to the second row, not off the end.
      expect(
        cards[2].querySelector<HTMLElement>('.thumb')!.getBoundingClientRect().top,
      ).toBeGreaterThan(cards[1].querySelector<HTMLElement>('.thumb')!.getBoundingClientRect().top);
    });

    it('gives short and long names the same card height', () => {
      const row = inOneRow(mountGrid());
      // Grid stretches the row and each card fills its host, so one number for
      // both. A 1px tolerance absorbs sub-pixel rounding only.
      expect(spread(row.map((c) => c.offsetHeight))).toBeLessThanOrEqual(1);
    });

    it('gives every card the same height, whatever its name or its rating', () => {
      const cards = mountGrid();
      // Card height is a function of the column width and the fixed content rows,
      // never of the text in the name or the state of the rating.
      expect(spread(cards.map((c) => c.offsetHeight))).toBeLessThanOrEqual(1);
    });

    it('sizes the name to its own text, not a fixed two-line lane', () => {
      const cards = mountGrid();
      const short = cards[0].querySelector<HTMLElement>('.product-name')!;
      const long = cards[1].querySelector<HTMLElement>('.product-name')!;
      // A one-line name takes one line; only a long one reaches the 2-line clamp.
      expect(long.offsetHeight).toBeGreaterThan(short.offsetHeight);
      // The short name is not cut off; the reserved second line is gone, so the
      // rating below it can move up with the text.
      expect(short.scrollHeight).toBeLessThanOrEqual(short.offsetHeight + 1);
    });

    it('actually clamps the long name instead of letting it wrap away', () => {
      const cards = mountGrid();
      const long = cards[1].querySelector<HTMLElement>('.product-name')!;
      // scrollHeight exceeds the box only when the text overflows, which is what
      // proves the 2-line clamp is engaged and the ellipsis is honest.
      expect(long.scrollHeight).toBeGreaterThan(long.offsetHeight);
    });

    it('sits the rating directly under the name, on short names too', () => {
      const cards = mountGrid();
      const short = cards[0].querySelector<HTMLElement>('.product-name')!;
      const stars = cards[0].querySelector<HTMLElement>('.stars-line')!;
      const gap = stars.getBoundingClientRect().top - short.getBoundingClientRect().bottom;
      // The rating hugs the name -- only the .stars-line margin plus rounding --
      // rather than hovering a blank reserved line below it.
      expect(gap).toBeLessThanOrEqual(6);
    });

    it('keeps the long name readable in full via its tooltip', () => {
      const cards = mountGrid();
      expect(cards[1].querySelector('.product-name')!.getAttribute('title')).toBe(longName);
    });

    it('lines the price row up across the row, whatever the name length', () => {
      expect(spread(topsOf(inOneRow(mountGrid()), '.price-row'))).toBeLessThanOrEqual(1);
    });

    it('lets the rating follow its own name rather than a shared row baseline', () => {
      const row = inOneRow(mountGrid());
      const stars = topsOf(row, '.stars-line');
      // p1 ("Men Underwear") is one line and p2's name clamps to two, so the
      // short card's rating sits higher -- the point of dropping the reserved
      // second line. The names themselves still start on the same line.
      expect(stars[0]).toBeLessThan(stars[1]);
      expect(spread(topsOf(row, '.product-name'))).toBeLessThanOrEqual(1);
    });

    it('keeps the rating row one line tall whether or not there are reviews', () => {
      const cards = mountGrid();
      // The regression this guards: a rating row wrapping onto a second line
      // makes the rated card taller than the unrated one beside it and knocks
      // both rows below it out of alignment. Compared by height, not by
      // position, so it holds at any column count. The p1 fixture is unrated
      // with sales and p3 is rated with sales, so both "(N)" + stars rows
      // are under the same one-line contract.
      const rows = cards.map((c) => c.querySelector<HTMLElement>('.stars-line')!);
      expect(spread(rows.map((r) => r.offsetHeight))).toBeLessThanOrEqual(1);
      // scrollHeight would exceed the box if the row wrapped.
      for (const r of rows) {
        expect(r.scrollHeight).toBeLessThanOrEqual(r.offsetHeight + 1);
      }
    });

    it('holds the same height at every column count the grid really uses', () => {
      // 2-up under 620px, 3-up under 980px, 5-up above. A layout that only holds
      // at one width passes a single-width test and fails on a real screen.
      for (const [width, cols] of [
        [375, 2],
        [900, 3],
        [1440, 5],
      ] as [number, number][]) {
        const cards = remountAt(width, cols);
        const row = inOneRow(cards);
        expect(row.length).toBe(Math.min(cards.length, cols));
        // Real columns, so a shared top really does mean "same row".
        expect(
          spread(row.map((c) => c.querySelector<HTMLElement>('.thumb')!.getBoundingClientRect().left)),
        ).toBeGreaterThan(0);
        expect(spread(row.map((c) => c.offsetHeight))).toBeLessThanOrEqual(1);
        expect(spread(topsOf(row, '.price-row'))).toBeLessThanOrEqual(1);
        const rows = cards.map((c) => c.querySelector<HTMLElement>('.stars-line')!);
        expect(spread(rows.map((r) => r.offsetHeight))).toBeLessThanOrEqual(1);
      }
    });

    it('gives every card the same photo height, so the image drives nothing', () => {
      const cards = mountGrid();
      const thumbs = cards.map((c) => c.querySelector<HTMLElement>('.thumb')!);
      expect(spread(thumbs.map((t) => t.offsetHeight))).toBeLessThanOrEqual(1);
    });

    it('keeps the photo square and the same width across cards', () => {
      const thumbs = mountGrid().map((c) => c.querySelector<HTMLElement>('.thumb')!);
      const first = thumbs[0].getBoundingClientRect();
      expect(Math.abs(first.width - first.height)).toBeLessThanOrEqual(1);
      for (const t of thumbs) {
        expect(Math.abs(t.getBoundingClientRect().width - first.width)).toBeLessThanOrEqual(1);
      }
    });

    it('keeps the cart button clear of the price instead of overlapping it', () => {
      for (const c of mountGrid()) {
        const price = c.querySelector<HTMLElement>('.price')!.getBoundingClientRect();
        const btn = c.querySelector<HTMLElement>('.cartbtn')!.getBoundingClientRect();
        // Non-overlap on the inline axis: the price must end before the button starts.
        expect(price.right).toBeLessThanOrEqual(btn.left + 0.5);
      }
    });

    it('floats the cart button across the image/body boundary, bottom-right of the photo', () => {
      // The approved placement, and the one that regressed to an inline button
      // beside the price: the tile straddles the bottom edge of the photo, at
      // its right-hand corner.
      for (const c of mountGrid()) {
        const thumb = c.querySelector<HTMLElement>('.thumb')!.getBoundingClientRect();
        const btn = c.querySelector<HTMLElement>('.cartbtn')!.getBoundingClientRect();
        // Centred on the boundary: half over the photo, half over the body.
        expect(Math.abs((btn.top + btn.bottom) / 2 - thumb.bottom)).toBeLessThanOrEqual(1);
        // In the right-hand corner, and not hanging outside the photo.
        expect(btn.right).toBeLessThanOrEqual(thumb.right + 0.5);
        expect(btn.left).toBeGreaterThan((thumb.left + thumb.right) / 2);
      }
    });

    it('keeps the cart button out of the price row', () => {
      for (const c of mountGrid()) {
        expect(c.querySelector('.price-row .cartbtn')).toBeNull();
      }
    });

    it('gives the cart button the same spot on every card', () => {
      // Measured relative to each card, because grid columns sit side by side.
      const offsets = mountGrid().map((c) => {
        const card = c.getBoundingClientRect();
        const btn = c.querySelector<HTMLElement>('.cartbtn')!.getBoundingClientRect();
        return { x: btn.left - card.left, y: btn.top - card.top };
      });
      expect(spread(offsets.map((o) => o.x))).toBeLessThanOrEqual(1);
      expect(spread(offsets.map((o) => o.y))).toBeLessThanOrEqual(1);
    });

    it('keeps the cart button inside the card, not clipped by its overflow', () => {
      for (const c of mountGrid()) {
        const card = c.getBoundingClientRect();
        const btn = c.querySelector<HTMLElement>('.cartbtn')!.getBoundingClientRect();
        expect(btn.bottom).toBeLessThanOrEqual(card.bottom + 0.5);
        expect(btn.right).toBeLessThanOrEqual(card.right + 0.5);
      }
    });

    it('does not let the quick-add confirmation change the card height', () => {
      const cards = mountGrid();
      const before = cards.map((c) => c.offsetHeight);
      // Fire a real add so the confirmation renders, then re-measure.
      (cards[0].querySelector('.cartbtn') as HTMLButtonElement).click();
      hostFixture.detectChanges();
      expect(cards[0].querySelector('.qa-added')).not.toBeNull();
      expect(cards.map((c) => c.offsetHeight)).toEqual(before);
    });

    it('puts the badge and the heart over the photo, out of the flow', () => {
      // The second fixture is the badged one; the others are deliberately older
      // than the New window, so there is no badge on them to measure.
      const card = mountGrid()[1];
      const thumb = card.querySelector<HTMLElement>('.thumb')!.getBoundingClientRect();
      const badge = card.querySelector<HTMLElement>('.badge')!.getBoundingClientRect();
      const heart = card.querySelector<HTMLElement>('.heart-btn')!.getBoundingClientRect();
      // Contained by the photo, so neither can displace the image.
      expect(badge.top).toBeGreaterThanOrEqual(thumb.top - 0.5);
      expect(heart.bottom).toBeLessThanOrEqual(thumb.bottom + 0.5);
      // Badge left, heart right: the reference arrangement.
      expect(badge.left).toBeLessThan(heart.left);
    });

    it('never nests a button inside a link', () => {
      // A <button> inside an <a> is invalid HTML and its click handling is
      // unreliable on mobile Safari, which is why the info area uses a stretched
      // link and the heart is a sibling of the photo link rather than a child.
      for (const c of mountGrid()) {
        expect(c.querySelector('a .cartbtn')).toBeNull();
        expect(c.querySelector('a .heart-btn')).toBeNull();
      }
    });

    it('keeps the heart in the same top-right spot now it is out of the photo link', () => {
      for (const c of mountGrid()) {
        const thumb = c.querySelector<HTMLElement>('.thumb')!.getBoundingClientRect();
        const heart = c.querySelector<HTMLElement>('.heart-btn')!.getBoundingClientRect();
        // Same anchoring as before the refactor, to within a pixel.
        expect(heart.right).toBeLessThanOrEqual(thumb.right + 0.5);
        expect(heart.top).toBeGreaterThanOrEqual(thumb.top - 0.5);
      }
    });

    it('still links the photo to the product', () => {
      const link = mountGrid()[0].querySelector<HTMLAnchorElement>('a.thumb')!;
      expect(link.getAttribute('href')).toContain('/product/p1');
    });

    it('gives the info area one navigable link that names the product', () => {
      const link = mountGrid()[0].querySelector<HTMLAnchorElement>('.product-info__link')!;
      expect(link.getAttribute('href')).toContain('/product/p1');
      expect(link.getAttribute('aria-label')).toBe(shortName);
      // Two links to the same product is pre-existing (thumb + info). Neither
      // button may be swallowed by the stretched link.
      expect(link.querySelector('button')).toBeNull();
    });
  });
});