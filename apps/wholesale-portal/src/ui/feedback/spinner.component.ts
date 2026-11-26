import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type SeSpinnerSize = 'sm' | 'md' | 'lg';

/**
 * The platform progress mark: three tapered ochre arcs orbiting a common centre.
 * Use it while an action is in flight. It is decorative unless a `label` is
 * given, in which case the host becomes a live `status` region.
 *
 *     <se-spinner label="Processing payment" />
 *     <se-spinner size="sm" />
 */
@Component({
  selector: 'se-spinner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': "'se-spinner se-spinner--' + size()",
    '[attr.role]': 'label() ? "status" : null',
    '[attr.aria-label]': 'label() || null',
    '[attr.aria-live]': 'label() ? "polite" : null',
  },
  template: `
    <svg class="se-spinner__orbits" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path class="se-spinner__arc se-spinner__arc--deep" d="M24 6C31.5 6 38.2 10.6 40.8 17.6" />
      <path class="se-spinner__arc se-spinner__arc--mid" d="M7.2 30.4C5.4 24.4 6.7 17.8 10.8 12.8" />
      <path class="se-spinner__arc se-spinner__arc--soft" d="M36.5 37.2C31.2 42.1 23.4 43.4 16.8 40.5" />
    </svg>
    @if (label()) {
      <span class="se-spinner__label">{{ label() }}</span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      color: var(--se-color-text);
    }
    .se-spinner__orbits {
      width: var(--se-spinner-size);
      height: var(--se-spinner-size);
      flex: none;
      animation: se-orbital-spin 1.15s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite;
      transform-box: fill-box;
      transform-origin: center;
    }
    .se-spinner__arc {
      stroke-width: 4.5;
      stroke-linecap: round;
    }
    .se-spinner__arc--deep { stroke: var(--se-color-accent-active, #93600a); }
    .se-spinner__arc--mid { stroke: var(--se-color-accent, #c88a12); }
    .se-spinner__arc--soft { stroke: var(--se-color-accent-soft, #e4b85c); }
    .se-spinner__label { font: var(--se-type-caption); color: var(--se-color-text-muted); }
    .se-spinner--sm { --se-spinner-size: 12px; }
    .se-spinner--md { --se-spinner-size: 16px; }
    .se-spinner--lg { --se-spinner-size: 24px; }
    @keyframes se-orbital-spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    @media (prefers-reduced-motion: reduce) {
      .se-spinner__orbits { animation-duration: 3s; }
    }
  `,
})
export class SeSpinnerComponent {
  readonly size = input<SeSpinnerSize>('sm');
  readonly label = input('');
}
