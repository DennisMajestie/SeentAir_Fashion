import { Injectable, signal } from '@angular/core';

/**
 * Lets a page hand its title to the mobile header.
 *
 * The header is rendered by the shell, above the router outlet, so it has no
 * access to the page's data. Without this the only titles it could show are
 * route-wide constants, which is why the product page could never name the
 * product in the bar.
 *
 * A page sets the title when it loads and clears it when it is destroyed, so
 * the header falls back to its own route label rather than keeping a stale
 * name from the screen the shopper just left.
 */
@Injectable({ providedIn: 'root' })
export class PageTitleService {
  private readonly current = signal<string | null>(null);

  /** The title the current page supplied, or null if it did not. */
  readonly pageTitle = this.current.asReadonly();

  set(title: string | null): void {
    this.current.set(title && title.trim() ? title.trim() : null);
  }
}
