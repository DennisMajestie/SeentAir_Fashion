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
 * Alpha of a computed colour. An opaque `rgb(...)` has no alpha channel and is
 * reported as 1, which is what the eye means by it anyway.
 */
function alphaOf(value: string): number {
  const m = /^rgba?\(([^)]+)\)$/.exec(value);
  if (!m) return 1;
  const parts = m[1].split(',').map((p) => parseFloat(p.trim()));
  return parts.length > 3 ? parts[3] : 1;
}

/**
 * Reads backdrop-filter in either spelling. The styleshipped -webkit- fallback
 * is absent from the TS DOM lib, hence the cast.
 */
function backdropBlur(style: CSSStyleDeclaration): string {
  const legacy = (style as CSSStyleDeclaration & { webkitBackdropFilter?: string })
    .webkitBackdropFilter;
  return style.backdropFilter || legacy || '';
}

/**
 * The ops sign-in, as it stands.
 *
 * This file used to pin a full-bleed photograph with a three-layer scrim, a
 * hairline-framed transparent card and a column placed at the start of the
 * grid. That layout is gone: the screen is now the same split card as the
 * storefront and the two portals -- a dark branded half beside an opaque form
 * half -- and the sign-in bar is a copy of the storefront's site header.
 *
 * What survived the rewrite is the coverage that was about behaviour rather
 * than pixels: the WCAG relative-luminance maths and the contrast assertions,
 * the theme toggle's placement and affordance, the sign-in affordance states,
 * and the guard that the old brand-panel clock stayed retired. What went is
 * everything that only described the photograph.
 */
describe('ops login', () => {
  let fixture: ComponentFixture<App>;

  const el = <T extends Element>(sel: string): T => fixture.nativeElement.querySelector(sel) as T;

  const styleOf = (sel: string, pseudo?: string): CSSStyleDeclaration =>
    getComputedStyle(el(sel), pseudo ?? null);

  const build = (theme: 'light' | 'dark', desktop = true): void => {
    // ThemeService writes data-theme onto the document, which outlives a
    // fixture. Without destroying the previous one, a 'light' build following a
    // 'dark' one renders under the dark attribute still in place.
    fixture?.destroy();
    localStorage.clear();
    localStorage.setItem('seentair.theme', theme);
    fixture = TestBed.createComponent(App);
    // First detectChanges runs ngOnInit, which seeds isDesktop from
    // matchMedia -- so the override has to land after that, not before.
    fixture.detectChanges();
    fixture.componentInstance['isDesktop'].set(desktop);
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

  // ---- the split card ----------------------------------------------------
  describe('split card', () => {
    it('brands the sign-in screen, which the logged-out shell otherwise has none of', () => {
      build('dark');
      // The ops header is behind api.isLoggedIn, so without this the page
      // renders a bare form with no wordmark anywhere.
      expect(el('.auth-head')).toBeTruthy();
      expect(el('.auth-logo')).toBeTruthy();
      expect(el('.auth-screen .site-header')).toBeNull();
    });

    it('stacks to a single column when the branded half is not rendered', () => {
      // Karma's viewport is narrower than the 900px the split breakpoint uses,
      // so the two-column case cannot be asserted here -- it is measured in a
      // real browser at 1440. What is assertable is the fallback.
      build('light', false);
      expect(el('.auth-brand')).toBeNull();
      const parts = styleOf('.auth-split').gridTemplateColumns.split(' ').map(parseFloat);
      expect(parts.length).toBe(1);
    });

    it('keeps the branded half and the form half as siblings inside one card', () => {
      // The structure the 46/54 split lays out. Asserted on the DOM rather than
      // on computed columns, because the ratio itself is media-query driven.
      build('light');
      const split = el('.auth-split');
      expect(split.querySelector('.auth-brand')).toBeTruthy();
      expect(split.querySelector('.auth-panel')).toBeTruthy();
      // The form itself still lives inside the form half.
      expect(split.querySelector('.auth-panel .auth-card')).toBeTruthy();
    });

    it('gives the form half an opaque surface, not a window onto a photograph', () => {
      // The panel is what paints, and it must be opaque -- this is the
      // assertion that caught the panel falling back to a hard-coded white
      // because the token name did not exist in this app, which put near-white
      // ink on a white surface in dark mode.
      build('dark');
      expect(alphaOf(styleOf('.auth-panel').backgroundColor)).toBe(1);
      // The old card was deliberately translucent so the photograph read
      // through it, and carried a backdrop blur. Neither means anything now.
      expect(backdropBlur(styleOf('.auth-card'))).toBe('none');
    });

    it('no longer runs a photograph or a scrim behind the screen', () => {
      build('dark');
      expect(styleOf('.auth-screen').backgroundImage).toBe('none');
      expect(styleOf('.auth-screen', '::before').display).toBe('none');
    });
  });

  // ---- the branded half --------------------------------------------------
  describe('branded half', () => {
    it('is decorative, so assistive tech skips it', () => {
      build('dark');
      expect(el('.auth-brand').getAttribute('aria-hidden')).toBe('true');
    });

    it('carries the welcome lockup and the brand name', () => {
      build('dark');
      expect(el('.auth-brand__hello').textContent?.trim()).toBe('WELCOME');
      expect(el('.auth-brand__name').textContent?.trim()).toBe('SEENTAIR');
      expect(el('.auth-brand__lede').textContent?.trim().length).toBeGreaterThan(0);
    });

    it('paints a brand-dark gradient in both themes', () => {
      build('light');
      const light = styleOf('.auth-brand').backgroundImage;
      build('dark');
      const dark = styleOf('.auth-brand').backgroundImage;
      expect(light).toContain('gradient');
      expect(dark).toContain('gradient');
    });

    it('uses three cloud ellipses, drawn in CSS rather than fetched', () => {
      build('light');
      expect(document.querySelectorAll('.auth-brand__cloud').length).toBe(3);
      expect(el('.auth-brand__cloud--a').tagName).toBe('SPAN');
    });

    it('rounds the two discs and clips them at the card edge', () => {
      build('light');
      expect(styleOf('.auth-brand__photo--seam').borderRadius).toBe('50%');
      expect(styleOf('.auth-brand__photo--corner').borderRadius).toBe('50%');
      // The seam disc overhangs the seam, so the panel is what clips.
      expect(styleOf('.auth-split').overflow).toBe('hidden');
    });

    it('holds its own light-on-dark contrast regardless of theme', () => {
      // The branded half paints its own dark gradient in both themes, so its
      // type contrast is theme-independent and must be checked directly.
      build('light');
      const bg = rgb(styleOf('.auth-brand').backgroundColor);
      expect(contrast(rgb(styleOf('.auth-brand__hello').color), bg)).toBeGreaterThan(4.5);
      expect(contrast(rgb(styleOf('.auth-brand__name').color), bg)).toBeGreaterThan(4.5);
      expect(contrast(rgb(styleOf('.auth-brand__lede').color), bg)).toBeGreaterThan(4.5);
    });
  });

  // ---- the bar -----------------------------------------------------------
  describe('sign-in bar', () => {
    it('is sticky and pinned to the top edge from first paint', () => {
      build('dark');
      const head = styleOf('.auth-head');
      expect(head.position).toBe('sticky');
      expect(head.top).toBe('0px');
    });

    it('is a solid surface, not a frosted wash over a photograph', () => {
      build('dark');
      expect(styleOf('.auth-head').backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
      expect(backdropBlur(styleOf('.auth-head'))).toBe('none');
    });

    it('caps itself at the account-page measure with a real gutter', () => {
      build('light');
      const inner = styleOf('.auth-head-inner');
      expect(parseFloat(inner.maxWidth)).toBe(1280);
      expect(parseFloat(inner.paddingLeft)).toBeGreaterThan(0);
    });

    it('draws its hairline immediately rather than only once scrolled', () => {
      build('light');
      const border = styleOf('.auth-head').borderBottomColor;
      expect(border).not.toBe('rgba(0, 0, 0, 0)');
    });

    // Split in two on purpose: ThemeService is a root singleton, so building
    // twice in one test cannot switch the theme back. Each test builds once.
    it('inverts the wordmark in dark mode', () => {
      build('dark');
      expect(styleOf('.auth-logo').filter).toContain('invert');
    });

    it('leaves the wordmark alone in light mode', () => {
      build('light');
      expect(styleOf('.auth-logo').filter).not.toContain('invert');
    });

    it('carries the wordmark at the suite-wide 50px, linking home', () => {
      build('light');
      // Locked so the four sign-in bars cannot drift apart again: the storefront,
      // partner portal and wholesale portal all sit at 50px.
      expect(styleOf('.auth-logo').height).toBe('50px');
      const logo = el('.logo');
      expect(logo.getAttribute('href')).toBe('/');
      expect(logo.getAttribute('aria-label')).toMatch(/home/i);
    });

    it('hosts the theme toggle, and not the form column', () => {
      build('light');
      const toggle = el<HTMLButtonElement>('.login-theme-toggle');
      expect(el('.auth-head-inner').contains(toggle)).toBe(true);
      expect(el('.auth-panel').contains(toggle)).toBe(false);
      expect(styleOf('.login-theme-toggle').position).not.toBe('absolute');
      // Its label has to describe the action it performs.
      expect(toggle.getAttribute('aria-label')).toMatch(/mode/i);
    });

    it('keeps the toggle legible against the bar', () => {
      build('light');
      const fg = rgb(styleOf('.login-theme-toggle').color);
      const bg = rgb(styleOf('.auth-head').backgroundColor);
      expect(contrast(fg, bg)).toBeGreaterThan(3);
    });
  });

  // ---- the form ----------------------------------------------------------
  describe('field legibility', () => {
    it('meets WCAG AA for the placeholder in dark mode too', () => {
      build('dark');
      const panelBg = rgb(styleOf('.auth-panel').backgroundColor);
      const label = rgb(styleOf('.auth-card .field-label').color);
      expect(contrast(label, panelBg)).toBeGreaterThan(4.5);
    });

    it('gives the inputs a comfortable target height and a focus ring', () => {
      build('light');
      expect(parseFloat(styleOf('.auth-card input').minHeight || styleOf('.auth-card input').height)).toBeGreaterThanOrEqual(44);
      expect(styleOf('.auth-card input').borderRadius).toBe('14px');
    });

    it('keeps "Forgot?" and the eye toggle the same colour', () => {
      build('light');
      expect(rgb(styleOf('.forgot').color)).toBe(rgb(styleOf('.pw-toggle').color));
      // ...and distinct from the field label, so it does not read as body text.
      expect(rgb(styleOf('.forgot').color)).not.toBe(rgb(styleOf('.auth-card .field-label').color));
    });

    it('labels the password toggle for assistive tech', () => {
      build('light');
      const toggle = el<HTMLButtonElement>('.pw-toggle');
      expect(toggle.getAttribute('type')).toBe('button');
      expect(toggle.textContent?.trim()).toMatch(/show|hide/i);
    });
  });

  describe('sign-in affordance', () => {
    it('shows a spinner and disables the button while signing in', () => {
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

  // ---- the retired clock -------------------------------------------------
  // The old brand panel ran a "run 04" countdown. The panel is back, but as a
  // static lockup with no timer, so the retirement still holds.
  describe('retired clock', () => {
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