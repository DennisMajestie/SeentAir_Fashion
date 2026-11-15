import { Injectable, PLATFORM_ID, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

const STORAGE_KEY = 'sd-rail';
const COLLAPSE_BREAKPOINT = 1100;

/** Vessa SdShellStateService: collapsed by default at/below 1100px,
 *  persisted across sessions. */
@Injectable({ providedIn: 'root' })
export class ShellStateService {
  private readonly platform = inject(PLATFORM_ID);
  readonly collapsed = signal<boolean>(this.readDefault());

  constructor() {
    effect(() => {
      if (!isPlatformBrowser(this.platform)) return;
      try {
        localStorage.setItem(STORAGE_KEY, this.collapsed() ? 'collapsed' : 'expanded');
      } catch {
        // storage unavailable: session-only state
      }
    });
  }

  toggle(): void {
    this.collapsed.update((v) => !v);
  }

  private readDefault(): boolean {
    if (!isPlatformBrowser(this.platform)) return false;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === 'collapsed') return true;
      if (raw === 'expanded') return false;
    } catch {
      // fall through to width-based default
    }
    return typeof window !== 'undefined' && window.innerWidth <= COLLAPSE_BREAKPOINT;
  }
}
