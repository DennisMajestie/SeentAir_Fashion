import { Injectable, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

/**
 * Which routes are "immersive": the browsing surfaces that drop the site chrome
 * and stand on their own with a back link instead.
 *
 * Today that is the product page and the shop grid. Both are places a shopper is
 * looking at products rather than navigating the site, and on both the universal
 * header, the hero carousel and the promises row were competing with the thing
 * the shopper actually came for. The landing, cart, checkout, account, order and
 * policy screens keep the full chrome, because those are the pages where a
 * shopper needs the nav.
 *
 * The set is route data rather than a hardcoded path list, so a page opts in by
 * declaring `immersive: true` in its route and nothing here has to be edited to
 * add another one.
 */
@Injectable({ providedIn: 'root' })
export class ChromeService {
  private readonly router = inject(Router);

  /** Primary outlet path currently showing. */
  private readonly url = signal(this.router.url);

  readonly immersive = computed(() => this.isImmersive(this.url()));

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.url.set(e.urlAfterRedirects));
  }

  /**
   * Reads `data.immersive` off the deepest activated route. Query strings and
   * fragments (the shop is filtered with `?category=`) are ignored, so changing
   * a filter never flips the page in or out of immersive.
   */
  private isImmersive(_url: string): boolean {
    let route = this.router.routerState.snapshot.root;
    while (route.firstChild) route = route.firstChild;
    return route.data['immersive'] === true;
  }
}