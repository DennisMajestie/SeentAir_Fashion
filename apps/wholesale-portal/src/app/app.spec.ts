import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ApiService } from './api.service';
import { App } from './app';

/**
 * The sign-in shell.
 *
 * The login header is a real header: it must not scroll away with the form, or
 * the wordmark and the "Secured connection" line disappear at exactly the point
 * a buyer is part-way through typing a password. That is easy to break by
 * editing one line of CSS and impossible to notice in a unit test that only
 * checks the element exists, so these read the computed style.
 */
describe('App sign-in shell', () => {
  let fixture: ComponentFixture<App>;

  async function boot(): Promise<void> {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  // backdrop-filter is unprefixed in every browser this suite runs, but the
  // stylesheet ships a -webkit- fallback for older Safari, so the tests read
  // both. The prefixed property is absent from the TS DOM lib, hence the cast.
  function backdropBlur(style: CSSStyleDeclaration): string {
    const legacy = (style as CSSStyleDeclaration & { webkitBackdropFilter?: string })
      .webkitBackdropFilter;
    return style.backdropFilter || legacy || '';
  }

  beforeEach(async () => {
    // The access token lives only in memory and starts null, so the shell
    // renders logged out without touching TokenStore — which also cannot be
    // injected before the test module is configured.
    await boot();
  });

  it('renders its own header while logged out, not the site chrome', () => {
    expect(el().querySelector('.ws-header')).toBeTruthy();
    expect(el().querySelector('.site-header')).toBeNull();
  });

  it('keeps the header out of the scroll flow', () => {
    const header = el().querySelector('.ws-header') as HTMLElement;
    expect(getComputedStyle(header).position).toBe('sticky');
  });

  it('pins the header to the top of the viewport', () => {
    const header = el().querySelector('.ws-header') as HTMLElement;
    expect(getComputedStyle(header).top).toBe('0px');
  });

  it('never lets the form show through the header: solid, or frosted and blurred', () => {
    // A *bare* translucent sticky header is the trap here: it looks right until
    // something scrolls behind it, then the password field shows through the
    // wordmark. The header is now a frosted wash over the sign-in photograph,
    // which is only safe because backdrop-filter blurs whatever sits behind it.
    // So translucency is acceptable if and only if the blur is really there.
    const header = el().querySelector('.ws-header') as HTMLElement;
    const style = getComputedStyle(header);
    const bg = style.backgroundColor;

    expect(style.opacity).toBe('1');
    expect(bg).not.toBe('transparent');
    expect(bg).not.toBe('rgba(0, 0, 0, 0)');

    // rgb() has no alpha slot, so only rgba() needs its alpha inspected.
    const rgba = /^rgba\(([^)]+)\)$/.exec(bg);
    const alpha = rgba ? parseFloat(rgba[1].split(',').map((part) => part.trim())[3]) : 1;
    expect(Number.isNaN(alpha)).toBe(false);

    const blur = backdropBlur(style);
    const isBlurred = blur !== '' && blur !== 'none';

    expect(alpha === 1 || isBlurred).toBe(true);
  });

  it('frosts the card rather than hiding the photograph behind it', () => {
    // The whole point of this treatment: the photo still reads through the
    // form. A solid card would technically satisfy the tests above while
    // quietly reverting the design.
    const card = el().querySelector('.auth-card') as HTMLElement;
    const style = getComputedStyle(card);
    const rgba = /^rgba\(([^)]+)\)$/.exec(style.backgroundColor);

    expect(rgba).not.toBeNull();
    expect(parseFloat(rgba![1].split(',').map((part) => part.trim())[3])).toBeLessThan(1);

    const blur = backdropBlur(style);
    expect(blur).not.toBe('');
    expect(blur).not.toBe('none');
  });

  it('bleeds the photograph to both window edges without a sideways scrollbar', () => {
    // The photo reaches the window edges by escaping its 620px column with a
    // negative inline margin. That trick is the classic way to accidentally
    // create a horizontal scrollbar, which is what body { overflow-x: clip }
    // exists to prevent here. Worth a regression test: if the clip is ever
    // changed to `hidden`, position: sticky on the header breaks too.
    const doc = document.documentElement;
    expect(doc.scrollWidth).toBeLessThanOrEqual(doc.clientWidth);
  });

  it('sits above the auth card it is pinned over', () => {
    const header = el().querySelector('.ws-header') as HTMLElement;
    const card = el().querySelector('.auth-card') as HTMLElement;
    expect(Number(getComputedStyle(header).zIndex)).toBeGreaterThan(0);
    // The card must not create a stacking context above the header.
    expect(getComputedStyle(card).zIndex).not.toBe(getComputedStyle(header).zIndex);
  });
});
