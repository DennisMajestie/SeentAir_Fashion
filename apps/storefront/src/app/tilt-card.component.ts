import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injectable,
  NgZone,
  PLATFORM_ID,
  WritableSignal,
  afterNextRender,
  booleanAttribute,
  inject,
  input,
  numberAttribute,
  signal,
  viewChild,
} from '@angular/core';

/** Settle-back easing: a small overshoot reads as a spring without ever snapping. */
const SETTLE_EASE = 'cubic-bezier(0.34, 1.4, 0.64, 1)';
const SETTLE_MS = 400;

/**
 * One shared reader for the media queries the tilt depends on. A grid can hold
 * 40+ cards; each card reads these signals at pointer-enter instead of
 * registering its own matchMedia listeners, so nothing global is attached per
 * card. Values update live if the user toggles reduced motion or plugs in a mouse.
 */
@Injectable({ providedIn: 'root' })
export class TiltEnvironmentService {
  readonly reducedMotion = signal(false);
  readonly hoverCapable = signal(false);

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    this.track('(prefers-reduced-motion: reduce)', this.reducedMotion);
    this.track('(hover: hover) and (pointer: fine)', this.hoverCapable);
  }

  private track(query: string, target: WritableSignal<boolean>): void {
    const mql = window.matchMedia(query);
    target.set(mql.matches);
    mql.addEventListener('change', (e) => target.set(e.matches));
  }
}

/**
 * 3D tilt-on-hover wrapper for product cards. Projects arbitrary content and
 * tilts the whole card toward the cursor (max 8° per axis), lifts it 20px on
 * the Z axis, grows a soft shadow with the tilt and drifts a low-opacity
 * specular highlight under the pointer. Eases back to rest in ~400ms.
 *
 * Children marked `data-depth="0..1"` float in front of the card surface in
 * proportion to their value. Note that any ancestor with `overflow: hidden`
 * (e.g. the shop `.card`) flattens 3D for its descendants, so depth layers
 * need a clip-free path up to this component.
 *
 * Usage in the shop grid, wrap the existing card as-is:
 *
 *   <div class="grid">
 *     @for (product of filtered(); track product.id; let i = $index) {
 *       <app-tilt-card>
 *         <app-product-card [product]="product" [index]="i" [rating]="ratingOf(product.id)" />
 *       </app-tilt-card>
 *     }
 *   </div>
 *
 * Or author a card for the effect, with layered depth (see `.tilt-product` in
 * styles.scss, it keeps `transform-style: preserve-3d` and never clips):
 *
 *   <app-tilt-card>
 *     <a class="tilt-product" [routerLink]="['/product', product.id]">
 *       <img class="tilt-product-img" data-depth="0.5" [src]="…" [alt]="product.name" />
 *       <span class="tilt-price" data-depth="1">₦{{ product.basePrice | number: '1.0-2' }}</span>
 *     </a>
 *   </app-tilt-card>
 *
 * Performance contract: only `transform` and `opacity` are animated, DOM writes
 * happen once per animation frame, pointer listeners run outside Angular's zone
 * and `will-change` is present only while a card is hovered or settling.
 *
 * Inert on touch-only devices (no hover), and under `prefers-reduced-motion`
 * the tilt is replaced by a plain shadow fade. Never intercepts clicks: the
 * overlays are `pointer-events: none` and listeners are passive.
 */
@Component({
  selector: 'app-tilt-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.tilt-reduced]': 'env.reducedMotion()',
    '[class.tilt-disabled]': 'disabled()',
    '[style.--tilt-depth]': 'depth() + "px"',
  },
  template: `
    <div class="tilt-surface" #surface>
      <div class="tilt-shadow" #shadow aria-hidden="true"></div>
      <ng-content />
      <div class="tilt-glare" aria-hidden="true">
        <div class="tilt-glare-spot" #glare></div>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      position: relative;
      perspective: 1000px;
      --tilt-radius: var(--radius, 16px);
    }
    /* Lifted cards protrude into the grid gap; keep them above their neighbours. */
    :host(.is-raised) {
      z-index: 1;
    }

    .tilt-surface {
      position: relative;
      transform-style: preserve-3d;
      border-radius: var(--tilt-radius);
      transition: transform ${SETTLE_MS}ms ${SETTLE_EASE};
      &.is-active {
        will-change: transform;
      }
      /* While tracking, a short follow smooths pointer jitter; settle uses the spring. */
      &.is-tracking {
        transition: transform 120ms ease-out;
      }
    }

    /* Pre-rendered shadow whose opacity tracks tilt magnitude, never animate box-shadow. */
    .tilt-shadow {
      position: absolute;
      inset: 0;
      border-radius: inherit;
      pointer-events: none;
      opacity: 0;
      box-shadow:
        0 24px 48px -12px rgba(28, 27, 27, 0.35),
        0 8px 16px -8px rgba(28, 27, 27, 0.2);
      transition: opacity ${SETTLE_MS}ms ease;
      .is-tracking & {
        transition: opacity 120ms ease-out;
      }
    }

    /* Clipping wrapper so the highlight keeps the card's rounded shape while the
       surface itself stays unclipped (overflow: hidden would flatten preserve-3d). */
    .tilt-glare {
      position: absolute;
      inset: 0;
      overflow: hidden;
      border-radius: inherit;
      pointer-events: none;
      transition: transform ${SETTLE_MS}ms ${SETTLE_EASE};
      .is-active & {
        transform: translateZ(var(--tilt-depth));
      }
    }
    .tilt-glare-spot {
      position: absolute;
      left: -50%;
      top: -50%;
      width: 200%;
      height: 200%;
      background: radial-gradient(
        circle at center,
        rgba(255, 255, 255, 0.55) 0%,
        rgba(255, 255, 255, 0.12) 25%,
        transparent 55%
      );
      opacity: 0;
      transition:
        opacity ${SETTLE_MS}ms ease,
        transform ${SETTLE_MS}ms ${SETTLE_EASE};
      .is-tracking & {
        transition:
          opacity 120ms ease-out,
          transform 120ms ease-out;
      }
      .is-active & {
        opacity: var(--tilt-glare-opacity, 0.18);
      }
    }

    /* Keyboard focus lands on the projected link; show a ring on the whole card. */
    :host(:has(:focus-visible)) .tilt-surface {
      outline: 2px solid var(--primary, #8a6a18);
      outline-offset: 3px;
    }
    @supports not selector(:has(*)) {
      :host(:focus-within) .tilt-surface {
        outline: 2px solid var(--primary, #8a6a18);
        outline-offset: 3px;
      }
    }

    /* Reduced motion: no tilt (gated in JS); a plain shadow fade on hover instead. */
    @media (hover: hover) {
      :host(.tilt-reduced:hover) .tilt-shadow {
        opacity: 0.6;
        transition: opacity 200ms ease;
      }
    }
  `,
})
export class SeentairTiltCardComponent {
  readonly env = inject(TiltEnvironmentService);
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Maximum rotation per axis, in degrees. */
  readonly maxTilt = input(8, { transform: numberAttribute });
  /** Z lift of the whole card while hovered, in px. */
  readonly lift = input(20, { transform: numberAttribute });
  /** Z translation for a `data-depth="1"` layer, in px; lower values scale down. */
  readonly depth = input(40, { transform: numberAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });
  /** True while the pointer is over the card. Set inside the zone on enter/leave only. */
  readonly active = signal(false);

  private readonly surface = viewChild.required<ElementRef<HTMLElement>>('surface');
  private readonly shadow = viewChild.required<ElementRef<HTMLElement>>('shadow');
  private readonly glare = viewChild.required<ElementRef<HTMLElement>>('glare');
  private surfaceEl!: HTMLElement;
  private shadowEl!: HTMLElement;
  private glareEl!: HTMLElement;

  private tracking = false;
  private frame = 0;
  private cx = 0;
  private cy = 0;
  private layers: HTMLElement[] = [];
  private settleTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    afterNextRender(() => this.zone.runOutsideAngular(() => this.attach()));
  }

  private attach(): void {
    this.surfaceEl = this.surface().nativeElement;
    this.shadowEl = this.shadow().nativeElement;
    this.glareEl = this.glare().nativeElement;
    const el = this.host.nativeElement;
    const opts: AddEventListenerOptions = { passive: true };
    el.addEventListener('pointerenter', this.onEnter, opts);
    el.addEventListener('pointermove', this.onMove, opts);
    el.addEventListener('pointerleave', this.onLeave, opts);
    this.surfaceEl.addEventListener('transitionend', this.onSettled);
    this.destroyRef.onDestroy(() => {
      el.removeEventListener('pointerenter', this.onEnter);
      el.removeEventListener('pointermove', this.onMove);
      el.removeEventListener('pointerleave', this.onLeave);
      this.surfaceEl.removeEventListener('transitionend', this.onSettled);
      cancelAnimationFrame(this.frame);
      clearTimeout(this.settleTimer);
    });
  }

  /** Mouse/pen only: a finger tap must never tilt, or tapping a product feels unreliable. */
  private canTilt(e: PointerEvent): boolean {
    return (
      e.pointerType !== 'touch' &&
      !this.disabled() &&
      this.env.hoverCapable() &&
      !this.env.reducedMotion()
    );
  }

  private readonly onEnter = (e: PointerEvent): void => {
    if (!this.canTilt(e)) return;
    clearTimeout(this.settleTimer);
    // Depth layers are queried per hover so content rendered later (badges, panels) is included.
    this.layers = Array.from(this.surfaceEl.querySelectorAll<HTMLElement>('[data-depth]'));
    for (const layer of this.layers) {
      const d = Math.min(1, Math.max(0, Number(layer.dataset['depth']) || 0));
      layer.style.transition = `transform ${SETTLE_MS}ms ${SETTLE_EASE}`;
      layer.style.transform = `translateZ(${(d * this.depth()).toFixed(1)}px)`;
    }
    this.surfaceEl.classList.add('is-active', 'is-tracking');
    this.host.nativeElement.classList.add('is-raised');
    this.tracking = true;
    this.zone.run(() => this.active.set(true));
    this.onMove(e);
  };

  private readonly onMove = (e: PointerEvent): void => {
    if (!this.tracking || e.pointerType === 'touch') return;
    this.cx = e.clientX;
    this.cy = e.clientY;
    if (this.frame === 0) this.frame = requestAnimationFrame(this.render);
  };

  /** One DOM write pass per frame. Reads the rect first so scrolling under a still cursor stays correct. */
  private readonly render = (): void => {
    this.frame = 0;
    if (!this.tracking) return;
    const rect = this.host.nativeElement.getBoundingClientRect();
    const px = rect.width > 0 ? clamp01((this.cx - rect.left) / rect.width) : 0.5;
    const py = rect.height > 0 ? clamp01((this.cy - rect.top) / rect.height) : 0.5;
    const nx = px * 2 - 1;
    const ny = py * 2 - 1;
    const max = this.maxTilt();
    // Near edge comes toward the viewer: cursor at top → negative rotateX, at right → negative rotateY.
    const rx = ny * max;
    const ry = -nx * max;
    const magnitude = Math.min(1, Math.hypot(nx, ny));

    this.surfaceEl.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateZ(${this.lift()}px)`;
    this.shadowEl.style.opacity = (0.35 + 0.65 * magnitude).toFixed(3);
    // The spot is 200% of the card, so half its size in % maps to the full card in px.
    this.glareEl.style.transform = `translate(${((px - 0.5) * 50).toFixed(2)}%, ${((py - 0.5) * 50).toFixed(2)}%)`;
  };

  private readonly onLeave = (): void => {
    if (!this.tracking) return;
    this.tracking = false;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    // Dropping is-tracking hands the transform over to the 400ms spring.
    this.surfaceEl.classList.remove('is-tracking');
    this.surfaceEl.style.transform = 'rotateX(0deg) rotateY(0deg) translateZ(0px)';
    this.shadowEl.style.opacity = '0';
    this.glareEl.style.transform = 'translate(0%, 0%)';
    for (const layer of this.layers) layer.style.transform = 'translateZ(0px)';
    // Fallback in case transitionend never fires (card hidden mid-settle).
    this.settleTimer = setTimeout(this.onSettled, SETTLE_MS + 80);
    this.zone.run(() => this.active.set(false));
  };

  /**
   * At rest, clear every inline transform. Any lingering 3D function, even
   * translateZ(0)- would hold a GPU layer per card; 40 of those hurt scrolling
   * on a mid-range phone. Removing is-active also drops will-change.
   */
  private readonly onSettled = (e?: TransitionEvent): void => {
    if (e && (e.target !== this.surfaceEl || e.propertyName !== 'transform')) return;
    if (this.tracking) return;
    clearTimeout(this.settleTimer);
    this.surfaceEl.classList.remove('is-active');
    this.host.nativeElement.classList.remove('is-raised');
    this.surfaceEl.style.transform = '';
    this.shadowEl.style.opacity = '';
    this.glareEl.style.transform = '';
    for (const layer of this.layers) {
      layer.style.transform = '';
      layer.style.transition = '';
    }
    this.layers = [];
  };
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
