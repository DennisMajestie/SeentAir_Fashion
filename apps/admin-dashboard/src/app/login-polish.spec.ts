import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { ThemeService } from './theme.service';

/** WCAG 2.1 relative luminance from a computed "rgb(r, g, b)" string. */
function luminance(rgb: string): number {
  const [r, g, b] = rgb
    .replace(/rgba?\(/, '')
    .replace(')', '')
    .split(',')
    .map((v) => parseFloat(v) / 255);
  const lin = (c: number): number =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Contrast ratio between two computed colour strings. */
function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Parses "rgb(r, g, b)" / "rgba(r, g, b, a)" into a comparable string. */
function rgb(value: string): string {
  const m = value.match(/rgba?\(([^)]+)\)/);
  if (!m) return value;
  const parts = m[1].split(',').map((v) => parseFloat(v).toFixed(0));
  return `rgb(${parts[0]}, ${parts[1]}, ${parts[2]})`;
}

/**
 * Reads backdrop-filter in either spelling. The styleshipped -webkit- fallback
 * is absent from the TS DOM lib, hence the cast; the admin header blurs with
 * both, matching the storefront bar.
 */
function backdropBlur(style: CSSStyleDeclaration): string {
  const legacy = (style as CSSStyleDeclaration & { webkitBackdropFilter?: string })
    .webkitBackdropFilter;
  return style.backdropFilter || legacy || '';
}

describe('ops login photo overlay', () => {
  let fixture: ComponentFixture<App>;

  const el = <T extends Element>(sel: string): T => fixture.nativeElement.querySelector(sel) as T;

  const styleOf = (sel: string, pseudo?: string): CSSStyleDeclaration =>
    getComputedStyle(el(sel), pseudo ?? null);

  /** Custom property value on the overlay root, which is where tokens live. */
  const token = (name: string): string =>
    getComputedStyle(el('.auth-screen')).getPropertyValue(name).trim();

  const build = (theme: 'light' | 'dark'): void => {
    localStorage.clear();
    localStorage.setItem('seentair.theme', theme);
    fixture = TestBed.createComponent(App);
    fixture.detectChanges();
  };

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideRouter([])],
    }).compileComponents();
  });

  afterEach(() => fixture?.destroy());

  // ---- the photo backdrop ------------------------------------------------
  describe('photo backdrop', () => {
    it('runs the background full bleed, not inside a capped frame', () => {
      build('light');
      const s = styleOf('.auth-screen');
      // No max-width cap: the whole point is that the photo reaches both edges.
      expect(s.maxWidth).toBe('none');
      expect(s.backgroundImage).toContain('form-bg.jpg');
      expect(s.backgroundSize).toBe('cover');
    });

    it('spans the full window width with no side inset', () => {
      build('light');
      const s = styleOf('.auth-screen');
      // A block-level element fills its parent, so assert the rendered width
      // reaches the viewport rather than checking for a computed 'auto'.
      const viewport = document.documentElement.clientWidth;
      expect(Math.round(parseFloat(s.width))).toBeGreaterThanOrEqual(viewport - 2);
      expect(s.marginLeft).toBe('0px');
      expect(s.marginRight).toBe('0px');
      expect(s.isolation).toBe('isolate');
    });

    it('drops the old two-column split shell', () => {
      build('light');
      expect(el('.login-shell')).toBeNull();
      expect(el('.brand-panel')).toBeNull();
    });
  });

  // ---- no card, no panel -------------------------------------------------
  describe('the form is not a panel', () => {
    it('leaves the card background transparent so the photo reads through', () => {
      build('dark');
      // rgba(0,0,0,0) is the computed form of `transparent`.
      expect(styleOf('.auth-card').backgroundColor).toBe('rgba(0, 0, 0, 0)');
    });

    it('frames it with a hairline border instead', () => {
      build('dark');
      const card = styleOf('.auth-card');
      expect(card.borderTopWidth).toBe('1px');
      expect(card.borderTopStyle).toBe('solid');
    });
  });

  // ---- left-hand column on desktop, re-centred on narrow -----------------
  describe('column placement', () => {
    it('places the column at the start of the grid, not centred', () => {
      build('light');
      expect(styleOf('.auth-screen').justifyItems).toBe('start');
    });

    it('keeps the column at a readable max width', () => {
      build('light');
      expect(parseFloat(styleOf('.auth-col').maxWidth)).toBeLessThanOrEqual(420);
    });

    it('hangs the column off the same measure the wordmark bar uses', () => {
      build('light');
      // The bar centres itself with max-width; the column has to reach the
      // same line, so it splits the leftover space above --wrap-max instead of
      // sitting at a fixed inset from the window edge. max()/clamp() can
      // serialise unresolved and the result is viewport-dependent, so this
      // only pins that the offset is declared at all.
      expect(styleOf('.auth-col').marginInlineStart).not.toBe('');
      expect(styleOf('.auth-col').marginInlineStart).not.toBe('0px');
    });
  });

  // ---- the wordmark header ------------------------------------------------

  describe('wordmark header', () => {
    it('brands the sign-in screen, which the logged-out shell otherwise has none of', () => {
      build('dark');
      // The ops header is behind api.isLoggedIn, so without this bar the page
      // renders a bare form on a photograph with no wordmark anywhere.
      expect(el('.auth-head')).toBeTruthy();
      expect(el('.auth-logo')).toBeTruthy();
      expect(el('.auth-screen .site-header')).toBeNull();
    });

    it('keeps the wordmark on screen instead of scrolling it away', () => {
      build('dark');
      const head = styleOf('.auth-head');
      expect(head.position).toBe('sticky');
      expect(head.top).toBe('0px');
    });

    it('sits above the form column, which centres in the row beneath it', () => {
      build('dark');
      expect(styleOf('.auth-col').alignSelf).toBe('center');
      // Row 1 takes the bar, row 2 the flexible remainder.
      expect(styleOf('.auth-screen').gridTemplateRows).not.toBe('');
    });

    it('caps the bar at the account page measure instead of spanning the window', () => {
      build('light');
      const inner = styleOf('.auth-head-inner');
      // .wrap-col on the storefront: 1280px cap, centred.
      expect(parseFloat(inner.maxWidth)).toBe(1280);
      expect(parseFloat(inner.paddingLeft)).toBeGreaterThan(0);
      // The screen therefore no longer pads inline, or the gutter would double
      // and push the wordmark past the account page's line.
      expect(parseFloat(styleOf('.auth-screen').paddingLeft)).toBe(0);
    });

    it('leaves the photograph unbroken behind the bar until something scrolls', () => {
      build('dark');
      expect(styleOf('.auth-head').backgroundColor).toBe('rgba(0, 0, 0, 0)');
    });

    it('inverts the near-black wordmark on the dark photo so it can be seen', () => {
      build('dark');
      // logo.png measures mean luminance 0.005 - on --photo-base #14110e the
      // unfiltered mark is invisible, so the dark theme flips it to light.
      expect(styleOf('.auth-logo').filter).toContain('invert');
    });

    it('restores the original ink in the light theme, which washes to ivory', () => {
      build('light');
      expect(styleOf('.auth-logo').filter).not.toContain('invert');
    });

    it('carries the storefront account-page bar verbatim', () => {
      build('dark');
      const head = styleOf('.auth-head');
      // Ported from the storefront's .site-header. z-index 20 is the value that
      // actually changed: the login bar used to sit at 6, which would have let
      // the form column overlap it once the bar gained the storefront's height.
      expect(head.zIndex).toBe('20');
      expect(head.display).toBe('block');
      expect(head.borderBottomWidth).toBe('1px');
      expect(head.borderBottomStyle).toBe('solid');
      // Transparent at rest so the photograph runs unbroken behind it.
      expect(head.backgroundColor).toBe('rgba(0, 0, 0, 0)');

      // The mark takes the storefront's 60px, not the login bar's old 32px.
      expect(styleOf('.auth-logo').height).toBe('60px');

      // And the inner wrapper is the storefront's flex row.
      const inner = styleOf('.auth-head-inner');
      expect(inner.display).toBe('flex');
      expect(inner.alignItems).toBe('center');
      expect(inner.justifyContent).toBe('flex-start');
    });

    it('keeps the bar clear of the ops sidebar it does not have', () => {
      build('dark');
      // The logged-in .site-header offsets itself past the 224px sidebar with a
      // calc() width and a margin-left. Copying that verbatim would have shoved
      // the sign-in bar off-centre, so the port must not carry it.
      const head = styleOf('.auth-head');
      expect(head.marginLeft).toBe('0px');
      expect(head.maxWidth).toBe('none');
      expect(head.width).not.toContain('224px');
    });

    it('washes and draws a hairline in only once something scrolls', () => {
      build('dark');
      const head = el<HTMLElement>('.auth-head');
      expect(getComputedStyle(head).borderBottomColor).toBe('rgba(0, 0, 0, 0)');

      // The bar transitions border-color and background over 0.3s, and
      // getComputedStyle reports a transition's value at t=0, so the toggle
      // would still read as the resting state. Suppress it for the assertion.
      head.style.transition = 'none';
      head.classList.add('scrolled');
      const scrolled = getComputedStyle(head);
      // --hairline in the dark theme, and the wash has arrived.
      expect(scrolled.borderBottomColor).toBe('rgb(43, 38, 33)');
      expect(scrolled.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
      expect(backdropBlur(scrolled)).toContain('blur');
    });
  });

  // ---- the scrim guarantees AA over an unknown photograph ---------------
  describe('scrim contrast', () => {
    it('darkens the photo in the default (dark) theme', () => {
      build('dark');
      expect(token('--photo-wash')).toBe('10 8 7');
    });

    it('washes with ivory in the light theme, so dark type reads', () => {
      build('light');
      expect(token('--photo-wash')).toBe('252 249 243');
      expect(luminance(rgb(styleOf('.auth-card h1').color))).toBeLessThan(0.2);
    });

    it('paints the scrim behind the content, not over it', () => {
      build('dark');
      const before = getComputedStyle(el('.auth-screen'), '::before');
      expect(before.zIndex).toBe('-1');
      expect(before.backgroundImage).toContain('linear-gradient');
      expect(before.pointerEvents).toBe('none');
    });

    it('carries a horizontal wash under the column plus a radial and vertical pass', () => {
      build('dark');
      const bg = getComputedStyle(el('.auth-screen'), '::before').backgroundImage;
      // Sass emits `180deg` as the default `to bottom`, so the vertical pass is
      // asserted by its layer count and the horizontal one by its explicit angle.
      expect(bg).toContain('90deg');
      expect(bg).toContain('radial-gradient');
      expect(bg.split('gradient(').length - 1).toBe(3);
    });
  });

  // ---- inputs are legible on the photograph ------------------------------
  describe('field legibility', () => {
    it('meets WCAG AA for the password placeholder against its own field', () => {
      build('light');
      const input = '.auth-card input[name="password"]';
      const placeholder = styleOf(input, '::placeholder').getPropertyValue('color');
      expect(
        contrast(rgb(placeholder), rgb(styleOf(input).backgroundColor)),
      ).toBeGreaterThanOrEqual(4.5);
    });

    it('meets WCAG AA for the placeholder in dark mode too', () => {
      build('dark');
      const input = '.auth-card input[name="password"]';
      const placeholder = styleOf(input, '::placeholder').getPropertyValue('color');
      expect(
        contrast(rgb(placeholder), rgb(styleOf(input).backgroundColor)),
      ).toBeGreaterThanOrEqual(4.5);
    });

    it('gives fields a 44px-plus hit target', () => {
      build('light');
      expect(
        parseFloat(styleOf('.auth-card input[name="password"]').minHeight),
      ).toBeGreaterThanOrEqual(44);
    });

    it('draws a visible focus ring', () => {
      build('light');
      const input = el<HTMLInputElement>('.auth-card input[name="password"]');
      input.focus();
      fixture.detectChanges();
      // Focusing a text input matches :focus-visible in Chrome, so the ring is
      // readable from the element's own computed style rather than the pseudo.
      const s = getComputedStyle(input);
      expect(s.outlineWidth).toBe('2px');
      expect(s.outlineStyle).toBe('solid');
    });
  });

  // ---- inline actions match ----------------------------------------------
  describe('"Forgot?" and "Show" match', () => {
    it('renders both in the same colour', () => {
      build('light');
      expect(rgb(styleOf('.forgot').color)).toBe(rgb(styleOf('.pw-toggle').color));
    });

    it('uses the brand accent, not the dimmed body ink', () => {
      build('light');
      expect(styleOf('.forgot').color).not.toBe(styleOf('.field-label').color);
    });

    it('shares weight, tracking and casing', () => {
      build('light');
      const a = styleOf('.forgot');
      const b = styleOf('.pw-toggle');
      expect(a.fontWeight).toBe(b.fontWeight);
      expect(a.letterSpacing).toBe(b.letterSpacing);
      expect(a.textTransform).toBe(b.textTransform);
    });
  });

  // ---- theme toggle ------------------------------------------------------
  describe('theme toggle', () => {
    it('lives in the header bar, not the form column', () => {
      build('light');
      const toggle = el<HTMLButtonElement>('.login-theme-toggle');
      // The account page keeps its toggle in .header-actions inside the bar.
      // It used to be absolutely positioned against .auth-col here, which made
      // it read as part of the sign-in card.
      expect(el('.auth-head-inner').contains(toggle)).toBe(true);
      expect(el('.auth-col').contains(toggle)).toBe(false);
      expect(el('.auth-card').contains(toggle)).toBe(false);
    });

    it('is no longer pinned over the card', () => {
      build('light');
      expect(styleOf('.login-theme-toggle').position).not.toBe('absolute');
    });

    it('swaps its own icon and label on click', () => {
      build('light');
      const toggle = el<HTMLButtonElement>('.login-theme-toggle');

      expect(toggle.getAttribute('aria-label')).toBe('Switch to dark mode');
      expect(toggle.querySelector('path')?.getAttribute('d')).toContain('M21 12.8');

      toggle.click();
      fixture.detectChanges();

      expect(TestBed.inject(ThemeService).theme()).toBe('dark');
      expect(toggle.getAttribute('aria-label')).toBe('Switch to light mode');
      expect(toggle.querySelector('circle')?.getAttribute('r')).toBe('4');
    });

    it('takes the photo palette rather than the header palette', () => {
      build('dark');
      const bg = rgb(styleOf('.login-theme-toggle').backgroundColor);
      const card = rgb(styleOf('.auth-card').backgroundColor);
      expect(bg).not.toBe(card);
    });
  });

  // ---- sign-in affordance ------------------------------------------------
  describe('sign-in affordance', () => {
    it('still renders the in-flight spinner while the request is running', () => {
      build('light');
      const cta = el<HTMLButtonElement>('.cta.signin');
      expect(cta.querySelector('.spinner')).toBeNull();

      fixture.componentInstance['loading'].set(true);
      fixture.detectChanges();

      expect(cta.disabled).toBe(true);
      expect(cta.querySelector('.spinner')).not.toBeNull();
      expect(cta.textContent).toContain('Signing in');
    });

    it('declares a transition that covers the lift, not just colour', () => {
      build('light');
      const transition = styleOf('.cta.signin').transitionProperty;
      expect(transition).toContain('transform');
      expect(transition).toContain('box-shadow');
    });
  });

  // ---- the removed brand panel -------------------------------------------
  describe('retired brand panel', () => {
    it('no longer runs the drop clock', () => {
      build('light');
      expect(el('.clock')).toBeNull();
      // The signal is gone from the component, not merely hidden by CSS.
      expect('clock' in fixture.componentInstance).toBe(false);
    });

    it('clears no interval on destroy any more', () => {
      build('light');
      const spy = spyOn(window, 'clearInterval');
      fixture.destroy();
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
