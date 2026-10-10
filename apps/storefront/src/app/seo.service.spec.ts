import { TestBed } from '@angular/core/testing';
import { Meta, Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { SeoService } from './seo.service';

/**
 * A product link is often the first thing a shopper sees of the brand, so what a
 * share or a search result shows is the difference between a sale and a dead end.
 * These cover the properties that actually reach a crawler or an unfurl: the
 * title, the preview description and image, and the structured data.
 */
describe('SeoService', () => {
  let seo: SeoService;
  let title: Title;
  let meta: Meta;

  const content = (selector: string): string | null =>
    document.head.querySelector(selector)?.getAttribute('content') ?? null;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    seo = TestBed.inject(SeoService);
    title = TestBed.inject(Title);
    meta = TestBed.inject(Meta);
    document.head.querySelectorAll('script[type="application/ld+json"]').forEach((n) => n.remove());
  });

  it('gives each page its own title instead of one shared string', () => {
    seo.apply({ title: 'Harmattan Hoodie' });
    expect(title.getTitle()).toBe('Harmattan Hoodie — SEENTAIR');

    seo.apply({ title: 'Crewneck' });
    expect(title.getTitle()).toBe('Crewneck — SEENTAIR');
  });

  it('leaves the bare brand name undecorated', () => {
    seo.apply({ title: 'SEENTAIR' });
    expect(title.getTitle()).toBe('SEENTAIR');
  });

  it('falls back to a real description rather than leaving the previous page\'s', () => {
    seo.apply({ title: 'Hoodie', description: 'Heavyweight terry, raw-edge.' });
    expect(content('meta[name="description"]')).toBe('Heavyweight terry, raw-edge.');

    seo.apply({ title: 'Cap' });
    expect(content('meta[name="description"]')).toBeTruthy();
    expect(content('meta[name="description"]')).not.toBe('Heavyweight terry, raw-edge.');
  });

  it('resolves a storefront-relative image to an absolute URL for unfurls', () => {
    seo.apply({ title: 'Tote', image: 'assets/products/tote.png' });
    const image = content('meta[property="og:image"]');
    expect(image).toMatch(/^https?:\/\/.+\/assets\/products\/tote\.png$/);
  });

  it('leaves an already-absolute image alone', () => {
    seo.apply({ title: 'Tote', image: 'https://cdn.example.com/a.png' });
    expect(content('meta[property="og:image"]')).toBe('https://cdn.example.com/a.png');
  });

  it('asks for a large card only when there is an image to show', () => {
    seo.apply({ title: 'Tote', image: 'assets/a.png' });
    expect(content('meta[name="twitter:card"]')).toBe('summary_large_image');

    seo.apply({ title: 'Tote' });
    expect(content('meta[name="twitter:card"]')).toBe('summary');
  });

  it('sets a canonical link so a filtered listing has one address', () => {
    seo.apply({ title: 'Shop all' });
    const canonical = document.head.querySelector('link[rel="canonical"]');
    expect(canonical).not.toBeNull();
    expect(canonical?.getAttribute('href')).toContain(location.origin);
  });

  it('does not repeat the canonical link on repeated calls', () => {
    seo.apply({ title: 'Shop' });
    seo.apply({ title: 'Shop' });
    seo.apply({ title: 'Shop' });
    expect(document.head.querySelectorAll('link[rel="canonical"]').length).toBe(1);
  });

  describe('product structured data', () => {
    const jsonLd = (): Record<string, unknown> | null => {
      const node = document.head.querySelector('script[type="application/ld+json"]');
      return node ? (JSON.parse(node.textContent ?? '{}') as Record<string, unknown>) : null;
    };

    it('describes a product with the price and stock it was given', () => {
      seo.productJsonLd({
        name: 'Hoodie',
        description: 'Raw-edge terry.',
        image: 'assets/products/hoodie.png',
        price: 52000,
        currency: 'NGN',
        available: true,
      });

      const data = jsonLd();
      expect(data?.['@type']).toBe('Product');
      expect(data?.['name']).toBe('Hoodie');
      const offers = data?.['offers'] as Record<string, unknown>;
      expect(offers['price']).toBe(52000);
      expect(offers['priceCurrency']).toBe('NGN');
      expect(offers['availability']).toBe('https://schema.org/InStock');
    });

    it('replaces the previous product instead of describing two at once', () => {
      seo.productJsonLd({ name: 'Hoodie', price: 52000, currency: 'NGN', available: true });
      seo.productJsonLd({ name: 'Jogger', price: 38000, currency: 'NGN', available: true });

      expect(document.head.querySelectorAll('script[type="application/ld+json"]').length).toBe(1);
      expect(jsonLd()?.['name']).toBe('Jogger');
    });

    it('omits the offer entirely rather than inventing a price', () => {
      seo.productJsonLd({ name: 'Hoodie' });
      expect(jsonLd()?.['offers']).toBeUndefined();
      expect(jsonLd()?.['name']).toBe('Hoodie');
    });

    it('omits the image rather than emitting an empty string', () => {
      seo.productJsonLd({ name: 'Hoodie' });
      expect(jsonLd()?.['image']).toBeUndefined();
    });

    it('marks a sold-out product as such', () => {
      seo.productJsonLd({ name: 'Hoodie', price: 52000, currency: 'NGN', available: false });
      const offers = jsonLd()?.['offers'] as Record<string, unknown>;
      expect(offers['availability']).toBe('https://schema.org/OutOfStock');
    });
  });

  it('never emits a rating the API did not send', () => {
    // Aggregate rating is only ever meaningful with a real review count. Since
    // this service is not given one, it must not appear at all -- the same rule
    // the card and product page follow by showing an honest "unrated" state.
    seo.productJsonLd({ name: 'Hoodie', price: 52000, currency: 'NGN', available: true });
    const node = document.head.querySelector('script[type="application/ld+json"]');
    expect(node?.textContent ?? '').not.toContain('aggregateRating');
    expect(node?.textContent ?? '').not.toContain('reviewCount');
  });
});