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

describe('ops login polish', () => {
  let fixture: ComponentFixture<App>;

  const el = <T extends Element>(sel: string): T => fixture.nativeElement.querySelector(sel) as T;

  const styleOf = (sel: string, pseudo?: string): CSSStyleDeclaration =>
    getComputedStyle(el(sel), pseudo ?? null);

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

  // ---- item 1: brand panel is always dark, form side still switches -------
  describe('item 1 — brand panel decoupled from the app theme', () => {
    it('renders a dark brand panel while the form side is light', () => {
      build('light');
      const brand = styleOf('.brand-panel').backgroundColor;
      const form = styleOf('.auth-col').backgroundColor;

      expect(rgb(brand)).toBe('rgb(15, 14, 12)');
      expect(rgb(form)).toBe('rgb(251, 249, 244)');
    });

    it('keeps the brand panel dark when the app theme is dark', () => {
      build('dark');
      expect(rgb(styleOf('.brand-panel').backgroundColor)).toBe('rgb(15, 14, 12)');
      expect(rgb(styleOf('.auth-col').backgroundColor)).toBe('rgb(15, 14, 12)');
    });

    it('does not repaint the brand panel when the theme is toggled', () => {
      build('light');
      const before = rgb(styleOf('.brand-panel').backgroundColor);

      el<HTMLButtonElement>('.login-theme-toggle').click();
      fixture.detectChanges();

      expect(TestBed.inject(ThemeService).theme()).toBe('dark');
      expect(rgb(styleOf('.brand-panel').backgroundColor)).toBe(before);
    });
  });

  // ---- item 7: toggle belongs to the form pane ----------------------------
  describe('item 7 — theme toggle placement and icon swap', () => {
    it('is a descendant of the form pane, not the shell', () => {
      build('light');
      const toggle = el<HTMLButtonElement>('.login-theme-toggle');
      const col = el('.auth-col');

      expect(col.contains(toggle)).toBe(true);
      expect(el('.login-shell').querySelector(':scope > .login-theme-toggle')).toBeNull();
    });

    it('swaps its own icon and label on click', () => {
      build('light');
      const toggle = el<HTMLButtonElement>('.login-theme-toggle');

      // light theme -> moon
      expect(toggle.getAttribute('aria-label')).toBe('Switch to dark mode');
      expect(toggle.querySelector('path')?.getAttribute('d')).toContain('M21 12.8');

      toggle.click();
      fixture.detectChanges();

      // dark theme -> sun
      expect(toggle.getAttribute('aria-label')).toBe('Switch to light mode');
      expect(toggle.querySelector('circle')?.getAttribute('r')).toBe('4');
    });
  });

  // ---- item 2: grid focal point ------------------------------------------
  describe('item 2 — grid focal point', () => {
    it('shows the glow layer that was previously display:none', () => {
      build('light');
      expect(styleOf('.brand-glow').display).not.toBe('none');
    });

    it('draws the glow as a radial gradient anchored off-centre', () => {
      build('light');
      const bg = styleOf('.brand-glow').backgroundImage;
      expect(bg).toContain('radial-gradient');
      expect(bg).toContain('88% 92%'); // bottom-right anchor
    });

    it('keeps the grid lines visible against the now-dark panel', () => {
      build('light');
      const grid = styleOf('.brand-grid').backgroundImage;
      expect(grid).not.toBe('none');
      // near-black ink at 6% would vanish; the panel ink tint must be light
      expect(grid).toContain('240, 236, 226');
    });
  });

  // ---- item 3: outlined headline legibility ------------------------------
  describe('item 3 — outlined headline contrast', () => {
    it('uses a stroke of at least 1.5px', () => {
      build('light');
      const width = parseFloat(
        styleOf('.brand-headline span').getPropertyValue('-webkit-text-stroke-width'),
      );
      expect(width).toBeGreaterThanOrEqual(1.5);
    });

    it('meets WCAG AA for the stroke against the panel it is drawn on', () => {
      build('light');
      const stroke = styleOf('.brand-headline span').getPropertyValue('-webkit-text-stroke-color');
      const panel = styleOf('.brand-panel').backgroundColor;
      expect(contrast(rgb(stroke), rgb(panel))).toBeGreaterThanOrEqual(4.5);
    });
  });

  // ---- item 4: seam between the two columns ------------------------------
  describe('item 4 — panel seam', () => {
    it('draws a gradient rule on the column boundary', () => {
      build('light');
      const after = getComputedStyle(el('.brand-panel'), '::after');
      expect(after.width).toBe('1px');
      expect(after.backgroundImage).toContain('linear-gradient');
    });
  });

  // ---- item 5: password placeholder contrast -----------------------------
  describe('item 5 — password field legibility', () => {
    it('meets WCAG AA against the rendered input background', () => {
      build('light');
      const placeholder = styleOf(
        '.auth-card input[name="password"]',
        '::placeholder',
      ).getPropertyValue('color');
      const bg = styleOf('.auth-card input[name="password"]').backgroundColor;

      expect(rgb(placeholder)).toBe('rgb(95, 94, 94)');
      expect(contrast(rgb(placeholder), rgb(bg))).toBeGreaterThanOrEqual(4.5);
    });

    it('still meets AA in dark mode', () => {
      build('dark');
      const input = '.auth-card input[name="password"]';
      const placeholder = styleOf(input, '::placeholder').getPropertyValue('color');
      expect(
        contrast(rgb(placeholder), rgb(styleOf(input).backgroundColor)),
      ).toBeGreaterThanOrEqual(4.5);
    });
  });

  // ---- item 6: the two inline actions match -------------------------------
  describe('item 6 — "Forgot?" and "Show" match', () => {
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
      expect(a.textTransform).toBe('uppercase');
    });

    it('gives both an explicit focus ring', () => {
      build('light');
      // hover underline replaces the always-on underline, so both read alike
      expect(styleOf('.forgot').textDecorationLine).not.toContain('underline');
      expect(styleOf('.pw-toggle').textDecorationLine).not.toContain('underline');
    });
  });

  // ---- item 8: the clock actually ticks ----------------------------------
  describe('item 8 — live clock', () => {
    it('updates on a one-second interval', () => {
      jasmine.clock().install();
      try {
        // tickClock reads a real `new Date()`, so the fake clock must also
        // supply the date or the rendered seconds never move.
        jasmine.clock().mockDate(new Date('2026-10-02T06:09:46Z'));
        build('light');
        const first = el('.clock').textContent?.trim() ?? '';
        expect(first).toMatch(/\d{2}:\d{2}:\d{2} WAT/);

        jasmine.clock().mockDate(new Date('2026-10-02T06:09:47Z'));
        jasmine.clock().tick(1000);
        fixture.detectChanges();

        expect(el('.clock').textContent?.trim()).not.toBe(first);
      } finally {
        jasmine.clock().uninstall();
      }
    });

    it('clears the interval on destroy', () => {
      build('light');
      // Real timers here: spying on clearInterval while the jasmine clock is
      // installed makes ngOnDestroy throw on the fake timer id.
      const spy = spyOn(window, 'clearInterval');
      fixture.destroy();
      expect(spy).toHaveBeenCalled();
    });
  });

  // ---- item 10: wide-screen framing --------------------------------------
  describe('item 10 — capped, centred shell', () => {
    it('caps the shell width and centres it', () => {
      build('light');
      const s = styleOf('.login-shell');
      expect(s.maxWidth).toBe('1380px');
      expect(s.marginLeft).toBe(s.marginRight);
    });

    it('caps each column', () => {
      build('light');
      const tracks = (styleOf('.login-shell').gridTemplateColumns.match(/[\d.]+px/g) ?? []).map(
        (t) => parseFloat(t),
      );
      expect(tracks.length).toBe(2);
      expect(tracks[0]).toBeLessThanOrEqual(760);
      expect(tracks[1]).toBeLessThanOrEqual(620);
    });

    it('puts a solid dark fill outside the shell in light mode', () => {
      build('light');
      expect(rgb(getComputedStyle(el('.login-shell'), '::before').backgroundColor)).toBe(
        'rgb(15, 14, 12)',
      );
    });
  });

  // ---- item 9: button affordance (structural, not pseudo-class) ----------
  describe('item 9 — sign-in affordance', () => {
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
});
