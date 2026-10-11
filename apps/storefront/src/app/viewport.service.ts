import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';

/**
 * The single desktop/mobile switch for the whole storefront.
 *
 * The project has no runtime viewport signal -- every existing breakpoint is a
 * `max-width` media query in styles.scss, and there is no `BreakpointObserver`
 * anywhere. That is not enough here: hiding a component with `display: none`
 * still lets the browser download its images, so a CSS-only rule would pull
 * ~640 kB of banner JPEGs onto every mobile page load for something nobody can
 * see. Gating on a signal means the markup is never created, so the requests
 * are never made.
 *
 * The value matches the largest existing `max-width` breakpoint in the stylesheet
 * (899px on .auth-screen), so the two never disagree about which layout is live.
 */
export const DESKTOP_MIN_WIDTH = 900;

@Injectable({ providedIn: 'root' })
export class ViewportService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /**
   * Server-side rendering has no viewport to measure, and `matchMedia` does not
   * exist there. Server renders the mobile shell -- the safe default, since that
   * is what the app shipped as.
   */
  private readonly query = signal(
    this.isBrowser
      ? window.matchMedia(`(min-width: ${DESKTOP_MIN_WIDTH}px)`)
      : null,
  );

  /**
   * `matches` is not itself reactive, so it is mirrored into a signal. When there
   * is no matchMedia (server) this stays false.
   */
  readonly isDesktop = signal(false);

  readonly desktop = computed(() => this.isDesktop());

  constructor() {
    if (!this.isBrowser) return;
    const mql = this.query();
    if (!mql) return;

    const sync = (): void => this.isDesktop.set(mql.matches);
    sync();

    // addEventListener rather than addListener: the deprecated signature is the
    // one Safari and older Chrome do not accept.
    mql.addEventListener('change', sync);

    // No teardown hook exists for matchMedia, and this listener lives for the
    // lifetime of the document anyway -- the injector is a singleton that is
    // never destroyed.
  }
}