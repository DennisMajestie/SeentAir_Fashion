import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** The platform progress mark: three tapered ochre arcs orbiting one centre. */
@Component({
  selector: 'app-orbital-spinner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': "'orbital-spinner orbital-spinner--' + size()",
    '[attr.role]': 'label() ? "status" : null',
    '[attr.aria-label]': 'label() || null',
  },
  template: `
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path class="arc arc--deep" d="M24 6C31.5 6 38.2 10.6 40.8 17.6" />
      <path class="arc arc--mid" d="M7.2 30.4C5.4 24.4 6.7 17.8 10.8 12.8" />
      <path class="arc arc--soft" d="M36.5 37.2C31.2 42.1 23.4 43.4 16.8 40.5" />
    </svg>
    @if (label()) { <span class="label">{{ label() }}</span> }
  `,
  styles: `
    :host { display: inline-flex; align-items: center; gap: 8px; }
    svg { width: var(--orbit-size); height: var(--orbit-size); flex: none;
      animation: orbit-spin 1.15s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite;
      transform-box: fill-box; transform-origin: center; }
    .arc { stroke-width: 4.5; stroke-linecap: round; }
    .arc--deep { stroke: #93600a; }
    .arc--mid { stroke: #c88a12; }
    .arc--soft { stroke: #e4b85c; }
    .label { font-size: 12px; color: var(--muted, #7b756a); }
    .orbital-spinner--sm { --orbit-size: 20px; }
    .orbital-spinner--md { --orbit-size: 36px; }
    .orbital-spinner--lg { --orbit-size: 56px; }
    @keyframes orbit-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { svg { animation-duration: 3s; } }
  `,
})
export class OrbitalSpinnerComponent {
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly label = input('');
}
