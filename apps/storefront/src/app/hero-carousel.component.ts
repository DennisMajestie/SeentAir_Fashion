import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
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

/**
 * Desktop-only hero carousel.
 *
 * No autoplay and no timers: the shop's north star is that customers can shop
 * without struggling, and a hero that moves on its own is a moving target for
 * anyone reading or reaching for a link. Movement is entirely user-driven.
 *
 * Slide height is held at the tallest banner's ratio and each image is
 * `contain`-fitted, because the four source files are not the same shape
 * (2.276:1 through 2.960:1). Letting each image size itself would resize the
 * section on every slide change; fitting instead means all artwork is shown
 * whole, uncropped and unstretched, in a box that never moves.
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
              @if (slide.link) {
                <a [routerLink]="slide.link" tabindex="-1">
                  <img
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
        /* The tallest of the four banners (1024x450) sets the box. */
        aspect-ratio: 1024 / 450;
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
        flex: 0 0 100%;
        width: 100%;
        height: 100%;
        margin: 0;
      }
      .hero-carousel__slide a {
        display: block;
        height: 100%;
      }

      .hero-carousel__slide img {
        display: block;
        width: 100%;
        height: 100%;
        /* contain, never cover: every banner is shown whole, with its own
           proportions intact. cover would crop the shortest of the four. */
        object-fit: contain;
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
      .hero-carousel__dot:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
      }

      @media (prefers-reduced-motion: reduce) {
        .hero-carousel__track {
          transition: none;
        }
        .hero-carousel__dot,
        .hero-carousel__arrow {
          transition: none;
        }
      }
    `,
  ],
})
export class HeroCarouselComponent {
  readonly slides = SLIDES;

  /** The only state the track depends on. */
  readonly current = signal(0);

  private readonly count = SLIDES.length;

  /**
   * `((i % n) + n) % n` rather than `i % n`: JavaScript's modulo keeps the sign
   * of the dividend, so previous() from slide 0 with a bare `% n` yields -1 and
   * would transform the track off the end of the row.
   */
  goTo(index: number): void {
    this.current.set(index);
  }

  next(): void {
    this.current.update((i) => this.wrap(i + 1));
  }

  previous(): void {
    this.current.update((i) => this.wrap(i - 1));
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