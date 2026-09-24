import { Injectable, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

const THEME_KEY = 'seentair.theme';
const THEME_META_COLORS: Record<Theme, string> = { light: '#fcf9f8', dark: '#141311' };

/** Light/dark theme — mirrors the pre-paint script in index.html.
 *  Persists the choice and keeps the <meta name="theme-color"> in sync. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>('light');

  constructor() {
    this.theme.set(this.load());
    this.apply(this.theme());
  }

  toggle(): void {
    this.set(this.theme() === 'light' ? 'dark' : 'light');
  }

  private load(): Theme {
    if (typeof window === 'undefined') return 'light';
    const saved = localStorage.getItem(THEME_KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'light';
  }

  private set(t: Theme): void {
    this.theme.set(t);
    this.apply(t);
  }

  private apply(t: Theme): void {
    document.documentElement.dataset['theme'] = t;
    document.documentElement.style.colorScheme = t;
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {
      /* storage unavailable — session-only */
    }
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) meta.content = THEME_META_COLORS[t];
  }
}