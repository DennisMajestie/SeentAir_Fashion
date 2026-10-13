import { Injectable, computed, inject, signal } from '@angular/core';
import { ActivatedRouteSnapshot, NavigationEnd, Router } from '@angular/router';
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

  /**
   * Whether this route wants the campaign carousel.
   *
   * Opt-in per route, and today only the landing page claims it. The carousel
   * was previously part of the shell, which put a four-slide promo band above
   * the cart, checkout, account, order-tracking and policy screens -- pages
   * where a shopper is part-way through something and a moving banner is noise
   * that costs them a scroll.
   *
   * A getter rather than a computed on purpose: `routerState.snapshot` is not
   * reactive, so a computed would only re-evaluate when the url signal actually
   * changed -- and on the landing page it never does ('/' to '/'), leaving the
   * carousel permanently switched off there.
   */
  hero(): boolean {
    return this.routeFlag('hero');
  }

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.url.set(e.urlAfterRedirects));
  }

  /** The deepest activated route. */
  private get leaf(): ActivatedRouteSnapshot {
    let route = this.router.routerState.snapshot.root;
    while (route.firstChild) route = route.firstChild;
    return route;
  }

  /** True when the current route declares `data[name] === true`. */
  private routeFlag(name: string): boolean {
    return this.leaf.data[name] === true;
  }

  private isImmersive(_url: string): boolean {
    return this.routeFlag('immersive');
  }
}