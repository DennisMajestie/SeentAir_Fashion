import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService, Product } from './api.service';
import { offerFor } from './pricing';

/** Rows of results shown at once; matches the approved mobile reference. */
export const SEARCH_RESULT_LIMIT = 8;

/**
 * Catalogue search, shared by the mobile and desktop headers.
 *
 * This is the behaviour that used to live inline in `MobileHeaderComponent`, so
 * the desktop header cannot drift from the mobile one: one fetch of the
 * catalogue, filtered client-side on every keystroke. Extracting it means the
 * "SHOP NOW" banner and the mobile search return identical results for identical
 * input, which is what a shopper switching between them would expect.
 */
@Injectable({ providedIn: 'root' })
export class CatalogueSearchService {
  private readonly api = inject(ApiService);

  readonly term = signal('');
  /** The whole catalogue, fetched at most once per session. */
  readonly catalogue = signal<Product[]>([]);
  readonly loaded = signal(false);

  readonly results = computed(() => {
    const q = this.term().trim().toLowerCase();
    if (!q) return [];
    return this.catalogue()
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description ?? '').toLowerCase().includes(q) ||
          (p.category ?? '').toLowerCase().includes(q),
      )
      .slice(0, SEARCH_RESULT_LIMIT);
  });

  /** True once a search has been attempted, so "no matches" is not shown pre-emptively. */
  readonly searched = computed(() => this.term().trim().length > 0 && this.loaded());

  search(value: string): void {
    this.term.set(value);
    this.ensureCatalogueLoaded();
  }

  close(): void {
    this.term.set('');
  }

  /** One fetch, reused for every later keystroke. */
  ensureCatalogueLoaded(): void {
    if (this.loaded() || this.catalogue().length > 0) return;
    this.api.products().subscribe((r) => {
      this.catalogue.set(r.data);
      this.loaded.set(true);
    });
  }

  /** What a result costs right now, sale included. */
  priceOf(p: Product): number {
    return offerFor(p).price;
  }
}