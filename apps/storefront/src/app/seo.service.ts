import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { Router } from '@angular/router';

/**
 * Search and link-preview metadata for a page.
 *
 * The routes each declared one static title, so every product shared the string
 * "Seentair: Product" and nothing described any page. For a brand whose traffic
 * arrives from an Instagram bio or a WhatsApp forward, the preview a link
 * produces is the difference between a sale and a dead end -- the title,
 * description and image are the only parts of the page a stranger sees.
 *
 * Applied from components rather than a resolver because the data these describe
 * (product name, price, photo) only exists once the page has fetched it.
 */
export interface PageMeta {
  title: string;
  /** Falls back to the site default when a page has nothing of its own to say. */
  description?: string;
  /** Absolute URL of the preview image. */
  image?: string | null;
  /** 'website' for a listing, 'product' for a buyable page. */
  type?: 'website' | 'product';
  /** Rendered as the price in a Product structured-data block, when present. */
  price?: number | null;
  currency?: string;
  /** Emitted as availability; only 'InStock' is claimed, never a guess. */
  available?: boolean;
}

const DEFAULT_DESCRIPTION =
  'Seentair Limited — Nigerian streetwear, cut and finished in our own factory.';

/** Appends the brand the way a shopper expects to see it in a search result. */
function withBrand(title: string): string {
  return title === 'SEENTAIR' ? title : `${title} — SEENTAIR`;
}

@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly router = inject(Router);
  private readonly doc = inject(DOCUMENT);

  /** Absolute origin of the deployed storefront, for canonical and og:url. */
  private origin(): string {
    return this.doc.location?.origin ?? '';
  }

  private absolute(url: string | null | undefined): string | null {
    if (!url) return null;
    if (/^https?:\/\//i.test(url)) return url;
    // Seed assets are storefront-relative ("assets/products/…"), uploaded media
    // is already absolute. Both resolve against the storefront origin.
    return `${this.origin()}/${url.replace(/^\//, '')}`;
  }

  private setLink(rel: string, href: string): void {
    const head = this.doc.head;
    if (!head) return;
    let link = head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
    if (!link) {
      link = this.doc.createElement('link');
      link.setAttribute('rel', rel);
      head.appendChild(link);
    }
    link.setAttribute('href', href);
  }

  apply(meta: PageMeta): void {
    const full = withBrand(meta.title);
    this.title.setTitle(full);

    const description = meta.description ?? DEFAULT_DESCRIPTION;
    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ property: 'og:title', content: full });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:type', content: meta.type ?? 'website' });
    this.meta.updateTag({ property: 'og:site_name', content: 'SEENTAIR' });

    const url = this.router.url.split('?')[0].split('#')[0];
    const canonical = `${this.origin()}${url}`;
    this.meta.updateTag({ property: 'og:url', content: canonical });
    this.setLink('canonical', canonical);

    const image = this.absolute(meta.image);
    this.meta.updateTag({ property: 'og:image', content: image ?? '' });
    // Twitter/X reads its own tags; without these a shared link renders as a
    // bare title, which is most of the traffic for this kind of brand.
    this.meta.updateTag({ name: 'twitter:card', content: image ? 'summary_large_image' : 'summary' });
    this.meta.updateTag({ name: 'twitter:title', content: full });
    this.meta.updateTag({ name: 'twitter:description', content: description });
    if (image) this.meta.updateTag({ name: 'twitter:image', content: image });
  }

  /**
   * Product structured data, so a product link can render as a price card in a
   * search result rather than plain text.
   *
   * Only fields the API actually returned are emitted. A made-up rating or an
   * assumed availability would be a false claim in a search snippet, which is
   * worse than the snippet simply omitting them -- the same reason the storefront
   * never shows an invented star average.
   */
  productJsonLd(product: {
    name: string;
    description?: string | null;
    image?: string | null;
    price?: number | null;
    currency?: string;
    available?: boolean;
  }): void {
    this.clearJsonLd();
    const image = this.absolute(product.image);
    const data: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.name,
    };
    if (product.description) data['description'] = product.description;
    if (image) data['image'] = image;
    if (typeof product.price === 'number' && product.currency) {
      data['offers'] = {
        '@type': 'Offer',
        price: product.price,
        priceCurrency: product.currency,
        availability: product.available
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock',
      };
    }
    this.appendJsonLd(data);
  }

  private appendJsonLd(data: Record<string, unknown>): void {
    const script = this.doc.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(data);
    this.doc.head.appendChild(script);
  }

  /**
   * Removes any structured data this service added.
   *
   * Called before each product is described so navigating between two products
   * does not leave the first one's markup in the page -- two Product blocks would
   * make the page describe a product it is not selling.
   */
  private clearJsonLd(): void {
    const head = this.doc.head;
    if (!head) return;
    head.querySelectorAll('script[type="application/ld+json"]').forEach((n) => n.remove());
  }
}