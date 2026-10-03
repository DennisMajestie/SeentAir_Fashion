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

  it('backs the header opaquely, so the form cannot show through it', () => {
    // A translucent sticky header is the trap here: it looks right until
    // something scrolls behind it, then the password field shows through the
    // wordmark. The colour must be solid.
    const header = el().querySelector('.ws-header') as HTMLElement;
    const style = getComputedStyle(header);
    const bg = style.backgroundColor;

    expect(style.opacity).toBe('1');
    expect(bg).not.toBe('transparent');
    expect(bg).not.toBe('rgba(0, 0, 0, 0)');

    // rgb() has no alpha slot, so only rgba() needs its alpha inspected.
    const rgba = /^rgba\(([^)]+)\)$/.exec(bg);
    if (rgba) {
      const parts = rgba[1].split(',').map((part) => part.trim());
      expect(parts.length).toBe(4);
      expect(parseFloat(parts[3])).toBe(1);
    }
  });

  it('sits above the auth card it is pinned over', () => {
    const header = el().querySelector('.ws-header') as HTMLElement;
    const card = el().querySelector('.auth-card') as HTMLElement;
    expect(Number(getComputedStyle(header).zIndex)).toBeGreaterThan(0);
    // The card must not create a stacking context above the header.
    expect(getComputedStyle(card).zIndex).not.toBe(getComputedStyle(header).zIndex);
  });
});
