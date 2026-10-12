import { CommonModule } from '@angular/common';
import {
  Component,
  DestroyRef,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * The four SEENTAIR campaign banners, one slide at a time.
 *
 * Each entry carries the image's real pixel dimensions so the browser can
 * reserve the right box before the bytes arrive. The files are used exactly as
 * they exist in `public/assets` -- not regenerated, resized, renamed, or
 * re-typeset -- and the copy baked into each image is the only copy of it.
 *
 * Alt text describes what is actually in each photograph (read from the files),
 * so a screen-reader user gets the offer rather than the filename.
 */
interface Slide {
  readonly src: string;
  readonly alt: string;
  /** Only present when a real route genuinely matches the banner's promise. */
  readonly link?: string;
  readonly width: number;
  readonly height: number;
}

const SLIDES: readonly Slide[] = [
  {
    src: 'assets/ScentAir_Aba_Card_1.jpg',
    alt: 'ScentAir premium streetwear in Aba: a black hoodie, white tee, cap, duffel and water bottle shown against an Aba street scene, with a “Shop now” call to action.',
    link: '/shop',
    width: 1024,
    height: 450,
  },
  {
    src: 'assets/ScentAir_Aba_Card_2.jpg',
    alt: 'ScentAir kids collection: a black hoodie and joggers, beige hoodie and trousers, a green varsity jacket, a white tee, sneakers and a cap, with a “Shop now” call to action.',
    link: '/shop?category=Children 2-Piece Sets',
    width: 1024,
    height: 367,
  },
  {
    src: 'assets/ScentAir_Aba_Card_3.jpg',
    alt: 'ScentAir men and women two-piece sets: a black zip jacket and joggers, a beige hoodie and trousers, sneakers and a cap, with a “Shop now” call to action.',
    link: '/shop?category=2-Piece Sets',
    width: 1024,
    height: 355,
  },
  {
    src: 'assets/ScentAir_Aba_Card_4.jpg',
    alt: 'ScentAir nightwear and loungewear: a black short-sleeve set, a white tee, grey sweatpants and a sleep mask laid out on a bed, with a “Shop now” call to action.',
    link: '/shop?category=T-Shirts',
    width: 1024,
    height: 346,
  },
] as const;

/** How long a slide holds before the deck moves on, in ms. */
const AUTOPLAY_MS = 6000;

/**
 * Desktop-only hero carousel.
 *
 * Autoplay advances the deck every AUTOPLAY_MS, but it is built to be stopped:
 * hovering the carousel, focusing anything inside it, or having "reduce motion"
 * set all pause it, and a manual arrow/dot click restarts the clock rather than
 * fighting the timer. A moving hero is only acceptable when the shopper can
 * still pin it where they want it; that is the whole reason each of those
 * interrupts exists.
 *
* Slide height is held by `aspect-ratio` under a `max-height` cap, and each
 * image is `contain`-fitted, because the four source files are not the same
 * shape (2.276:1 through 2.960:1). Letting each image size itself would resize
 * the section on every slide change; fitting instead means all artwork is shown
 * whole, uncropped and unstretched, in a box that never moves.
 *
 * The box is as wide as the header and nav content. Because those four files are
 * all narrower than the box, `contain` leaves a gap either side of the artwork;
 * each slide therefore carries a blurred copy of its own banner underneath to
 * fill that gap with colour from the same photograph, so the shelf reads as full
 * without stretching or cropping anything.
 */
@Component({
  selector: 'app-hero-carousel',
  imports: [CommonModule, RouterLink],
  template: `
    <section
      class="hero-carousel"
      aria-roledescription="carousel"
      aria-label="Promotions"
      (keydown)="onKeydown($event)"
      (mouseenter)="pause()"
      (mouseleave)="resume()"
      (focusin)="pause()"
      (focusout)="onFocusOut($event)"
    >
      <div class="hero-carousel__viewport">
        <ul
          class="hero-carousel__track"
          [style.transform]="'translateX(-' + current() * 100 + '%)'"
        >
          @for (slide of slides; track slide.src; let i = $index) {
            <li
              class="hero-carousel__slide"
              role="group"
              aria-roledescription="slide"
              [attr.aria-label]="i + 1 + ' of ' + slides.length"
              [attr.aria-hidden]="i === current() ? null : 'true'"
              [attr.inert]="i === current() ? null : ''"
            >
              <!-- Blurred copy of the same file, filling the letterbox either
                   side of the artwork. Decorative and hidden from assistive
                   tech. It reuses the exact same src, so the browser fetches the
                   banner once and serves the second element from cache -- which
                   is also why it is a real <img> with a loading attribute rather
                   than a CSS background-image, which would fetch eagerly and
                   defeat the lazy loading the sharp images rely on. -->
              <img
                class="hero-carousel__backdrop"
                [src]="slide.src"
                alt=""
                aria-hidden="true"
                [loading]="i === 0 ? 'eager' : 'lazy'"
              />
              @if (slide.link) {
                <a [routerLink]="slide.link" tabindex="-1">
                  <img
                    class="hero-carousel__art"
                    [src]="slide.src"
                    [alt]="slide.alt"
                    [width]="slide.width"
                    [height]="slide.height"
                    [loading]="i === 0 ? 'eager' : 'lazy'"
                    [attr.fetchpriority]="i === 0 ? 'high' : null"
                  />
                </a>
              } @else {
                <img
                  class="hero-carousel__art"
                  [src]="slide.src"
                  [alt]="slide.alt"
                  [width]="slide.width"
                  [height]="slide.height"
                  [loading]="i === 0 ? 'eager' : 'lazy'"
                  [attr.fetchpriority]="i === 0 ? 'high' : null"
                />
              }
            </li>
          }
        </ul>
      </div>

      <div class="hero-carousel__controls">
        <button
          type="button"
          class="hero-carousel__arrow"
          aria-label="Previous slide"
          (click)="previous()"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="m15 5-7 7 7 7" />
          </svg>
        </button>

        <div class="hero-carousel__dots">
          @for (slide of slides; track slide.src; let i = $index) {
            <button
              type="button"
              class="hero-carousel__dot"
              [class.is-active]="i === current()"
              [attr.aria-current]="i === current() ? 'true' : null"
              [attr.aria-label]="'Go to slide ' + (i + 1)"
              (click)="goTo(i)"
            ></button>
          }
        </div>

        <button
          type="button"
          class="hero-carousel__arrow"
          aria-label="Next slide"
          (click)="next()"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="m9 5 7 7-7 7" />
          </svg>
        </button>

        <!-- Autoplay can be stopped for good, not just by hovering. Focusable
             and labelled, because a moving banner a shopper cannot pin is the
             one failure mode the north star rules out. -->
        <button
          type="button"
          class="hero-carousel__toggle"
          [attr.aria-label]="paused() ? 'Resume automatic slide' : 'Pause automatic slide'"
          [attr.aria-pressed]="paused()"
          (click)="togglePaused()"
        >
          @if (paused()) {
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M8 5l11 7-11 7z" />
            </svg>
          } @else {
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M9 5v14M15 5v14" />
            </svg>
          }
        </button>
      </div>
    </section>
  `,
  styles: [
    `
      .hero-carousel {
        max-width: var(--wrap-max);
        margin-inline: auto;
        padding-inline: var(--wrap-x);
      }

      .hero-carousel__viewport {
        overflow: hidden;
        border-radius: var(--radius);
        /* Same ivory as the page so the letterbox bars read as intentional
           margin around the artwork rather than as a broken image. */
        background: var(--canvas);
        /* The box spans the full content width, matching the header and nav
           content edges exactly. Declaring the width is what makes the height
           deterministic: with an auto width, the ratio and the max-height below
           fed back into each other and the browser derived the WIDTH from the
           clamped height, so a 306px-tall box was only 783px wide regardless of
           how much room it had. With the width definite, the aspect-ratio supplies
           the height and max-height only clamps it, which reproduces the
           previous heights exactly: min(34vh, content width / 2.56). */
        width: 100%;
        aspect-ratio: 1024 / 400;
        /* On short windows an aspect-ratio box can still be too tall; cap it so
           the hero never eats more than about a third of the viewport. */
        max-height: 34vh;
      }

      .hero-carousel__track {
        display: flex;
        margin: 0;
        padding: 0;
        list-style: none;
        /* One step per slide; the transform is the only thing that animates. */
        transition: transform 340ms var(--ease-out);
        height: 100%;
      }

      .hero-carousel__slide {
        /* relative so the backdrop can anchor to this slide; hidden so the
           backdrop cannot bleed into a neighbouring slide while the track
           slides. */
        position: relative;
        overflow: hidden;
        flex: 0 0 100%;
        width: 100%;
        height: 100%;
        margin: 0;
      }
      .hero-carousel__slide a {
        display: block;
        height: 100%;
        /* The link wraps the sharp image only, but it still has to sit above
           the backdrop. */
        position: relative;
      }

      /* Fills the letterbox either side of a contain-fitted banner. Blurred and
         darkened so it reads as depth rather than as a second, competing image,
         and scaled just past the edges so the blur's own soft border is never
         visible as a hard line. */
      .hero-carousel__backdrop {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        filter: blur(24px) brightness(0.7);
        transform: scale(1.1);
        pointer-events: none;
      }

      .hero-carousel__art {
        /* Above the backdrop. Position (not z-index alone) so the stacking
           order is explicit and does not depend on DOM order. */
        position: relative;
        display: block;
        width: 100%;
        height: 100%;
        /* contain, never cover: every banner is shown whole, with its own
           proportions intact. cover would crop the shortest of the four. */
        object-fit: contain;
        object-position: center;
      }

      .hero-carousel__controls {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-16);
        padding: var(--space-16) 0 var(--space-8);
      }

      .hero-carousel__arrow {
        width: 40px;
        height: 40px;
        flex: 0 0 40px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: 1px solid var(--line-2);
        border-radius: 50%;
        background: var(--card);
        color: var(--ink);
        cursor: pointer;
        transition:
          color var(--dur-1) ease,
          border-color var(--dur-1) ease;
      }
      .hero-carousel__arrow svg {
        width: 20px;
        height: 20px;
        fill: none;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .hero-carousel__arrow:hover {
        color: var(--primary);
        border-color: var(--primary);
      }

      .hero-carousel__dots {
        display: flex;
        align-items: center;
        gap: var(--space-12);
      }

      .hero-carousel__dot {
        width: 10px;
        height: 10px;
        padding: 0;
        border: 1px solid var(--line-2);
        border-radius: 50%;
        background: var(--card);
        cursor: pointer;
        transition:
          background-color var(--dur-1) ease,
          border-color var(--dur-1) ease,
          transform var(--dur-1) ease;
      }
      /* Active is a fill plus a size change, so the current slide is not
         identified by colour alone. */
      .hero-carousel__dot.is-active {
        background: var(--primary-fill);
        border-color: var(--primary);
        transform: scale(1.35);
      }

      .hero-carousel__arrow:focus-visible,
      .hero-carousel__dot:focus-visible,
      .hero-carousel__toggle:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
      }

      /* Pause/play. Quieter than the arrows on purpose: it is a preference
         control, not the primary navigation, so it must not read as the
         headline action in the row. */
      .hero-carousel__toggle {
        width: 32px;
        height: 32px;
        flex: 0 0 32px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: 1px solid transparent;
        border-radius: 50%;
        background: transparent;
        color: var(--muted);
        cursor: pointer;
        transition: color var(--dur-1) ease;
      }
      .hero-carousel__toggle svg {
        width: 16px;
        height: 16px;
        fill: none;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .hero-carousel__toggle:hover {
        color: var(--primary);
      }

      @media (prefers-reduced-motion: reduce) {
        .hero-carousel__track {
          transition: none;
        }
        .hero-carousel__dot,
        .hero-carousel__arrow,
        .hero-carousel__toggle {
          transition: none;
        }
      }
    `,
  ],
})
export class HeroCarouselComponent implements OnDestroy {
  readonly slides = SLIDES;

  /** The only state the track depends on. */
  readonly current = signal(0);

  private readonly count = SLIDES.length;

  /** True when autoplay is held: shopper-paused, hovered, focused, or reduced motion. */
  readonly paused = signal(false);

  private readonly destroyRef = inject(DestroyRef);

  /**
   * Why the clock is currently stopped, held as a set rather than one flag so
   * hovering and "reduce motion" can both apply without one cancelling the
   * other. The deck resumes only when every reason is gone.
   */
  private readonly holds = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;

  private readonly reduceMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor() {
    if (this.reduceMotion) this.holds.add('reduce-motion');
    this.sync();
    this.destroyRef.onDestroy(() => this.stop());
  }

  ngOnDestroy(): void {
    this.stop();
  }

  /** Hold autoplay for a reason and resync the clock. */
  private hold(reason: string): void {
    this.holds.add(reason);
    this.sync();
  }

  /** Release a reason; autoplay resumes only if none are left. */
  private release(reason: string): void {
    this.holds.delete(reason);
    this.sync();
  }

  /**
   * Whether the carousel is currently held. Exposed so the template's control
   * shows the correct label even when the hold came from hover, not a click.
   */
  private get held(): boolean {
    return this.holds.size > 0;
  }

  /** Sync the interval to the current hold state. */
  private sync(): void {
    this.paused.set(this.held);
    if (this.held) {
      this.stop();
    } else if (!this.timer) {
      this.timer = setInterval(() => this.next(), AUTOPLAY_MS);
    }
  }

  private stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Hover pauses; leaving resumes. */
  pause(): void {
    this.hold('hover');
  }
  resume(): void {
    this.release('hover');
  }

  /**
   * Focus inside pauses. Focus moving between children of the same carousel
   * fires focusout then focusin, so the release is deferred to the next tick and
   * cancelled if focus came straight back -- otherwise tabbing across the
   * arrows would stutter the deck.
   */
  onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (next && (event.currentTarget as HTMLElement).contains(next)) return;
    this.hold('focus');
    setTimeout(() => {
      const active = document.activeElement;
      const host = document.querySelector('app-hero-carousel');
      if (!host || !host.contains(active)) this.release('focus');
    });
  }

  /** The explicit pause/play control. */
  togglePaused(): void {
    if (this.holds.has('manual')) {
      this.holds.delete('manual');
    } else {
      this.holds.add('manual');
    }
    this.sync();
  }

  /**
   * `((i % n) + n) % n` rather than `i % n`: JavaScript's modulo keeps the sign
   * of the dividend, so previous() from slide 0 with a bare `% n` yields -1 and
   * would transform the track off the end of the row.
   */
  goTo(index: number): void {
    this.current.set(index);
    // A manual pick should hold for a beat rather than be yanked away by the
    // timer mid-read, then resume the normal rhythm.
    this.restart();
  }

  next(): void {
    this.current.update((i) => this.wrap(i + 1));
    this.restart();
  }

  previous(): void {
    this.current.update((i) => this.wrap(i - 1));
    this.restart();
  }

  /** Reset the clock so the next advance is a full interval away. */
  private restart(): void {
    if (this.held) return;
    this.stop();
    this.timer = setInterval(() => this.current.update((i) => this.wrap(i + 1)), AUTOPLAY_MS);
  }

  private wrap(index: number): number {
    return ((index % this.count) + this.count) % this.count;
  }

  /** Arrow keys move the deck, but only while focus is already inside it. */
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.next();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.previous();
    }
  }
}