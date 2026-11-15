import {
  AfterViewInit,
  DestroyRef,
  Directive,
  ElementRef,
  NgZone,
  inject,
  input,
} from '@angular/core';

/**
 * CSS-transition port of Vessa's SdSlidingIndicator (no GSAP dependency).
 * Creates an absolutely-positioned pill inside the host and moves it onto the
 * item matching `itemSelector` carrying the active class (or aria-current /
 * aria-pressed). Observes class/aria mutations and size changes.
 */
@Directive({
  selector: '[appRailIndicator]',
  standalone: true,
})
export class RailIndicator implements AfterViewInit {
  readonly itemSelector = input.required<string>({ alias: 'appRailIndicator' });
  readonly activeClass = input('is-on');
  readonly radius = input('22px');
  readonly background = input('var(--ochre, #c88a12)');

  private readonly host = inject(ElementRef) as ElementRef<HTMLElement>;
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  private indicator?: HTMLSpanElement;
  private mutationObserver?: MutationObserver;
  private resizeObserver?: ResizeObserver;
  private activeItem?: HTMLElement;
  private hasPlaced = false;
  private changedPosition = false;

  constructor() {
    this.destroyRef.onDestroy(() => this.zone.runOutsideAngular(() => this.teardown()));
  }

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => this.initialize());
  }

  private initialize(): void {
    const container = this.host.nativeElement;
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
      this.changedPosition = true;
    }

    const indicator = document.createElement('span');
    indicator.className = 'rail-ind';
    Object.assign(indicator.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      pointerEvents: 'none',
      zIndex: '0',
      background: this.background(),
      borderRadius: this.radius(),
      opacity: '0',
      transition:
        'left 0.38s cubic-bezier(.2,.8,.2,1), top 0.38s cubic-bezier(.2,.8,.2,1), width 0.38s cubic-bezier(.2,.8,.2,1), height 0.38s cubic-bezier(.2,.8,.2,1), opacity 0.18s ease',
      willChange: 'left, top, width, height',
    });
    indicator.setAttribute('aria-hidden', 'true');
    container.prepend(indicator);
    this.indicator = indicator;

    this.resizeObserver = new ResizeObserver(() => this.move(false));
    this.mutationObserver = new MutationObserver(() => this.move(true));
    this.mutationObserver.observe(container, {
      attributes: true,
      subtree: true,
      childList: true,
      attributeFilter: ['class', 'aria-current', 'aria-pressed'],
    });
    this.resizeObserver.observe(container);
    this.queryItems().forEach((item) => this.resizeObserver?.observe(item));

    const onOrientation = () => this.move(false);
    window.addEventListener('orientationchange', onOrientation);
    this.destroyRef.onDestroy(() => window.removeEventListener('orientationchange', onOrientation));

    this.move(false);
    if ('fonts' in document) {
      void document.fonts.ready.then(() => this.move(false));
    }
  }

  private queryItems(): HTMLElement[] {
    return Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>(this.itemSelector()));
  }

  private findActiveItem(): HTMLElement | undefined {
    return this.queryItems().find(
      (item) =>
        item.classList.contains(this.activeClass()) ||
        item.getAttribute('aria-current') === 'page' ||
        item.getAttribute('aria-pressed') === 'true',
    );
  }

  private move(animate: boolean): void {
    const indicator = this.indicator;
    if (!indicator) return;

    const active = this.findActiveItem();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!active || reducedMotion) {
      indicator.style.opacity = '0';
      this.activeItem = undefined;
      return;
    }

    const { offsetLeft: x, offsetTop: y, offsetWidth: width, offsetHeight: height } = active;
    if (!animate || !this.hasPlaced) {
      const previous = indicator.style.transition;
      indicator.style.transition = 'none';
      indicator.style.left = `${x}px`;
      indicator.style.top = `${y}px`;
      indicator.style.width = `${width}px`;
      indicator.style.height = `${height}px`;
      indicator.style.opacity = '1';
      if (!animate) {
        // Force layout, then restore so the next move animates.
        void indicator.offsetWidth;
        indicator.style.transition = previous;
      }
      this.hasPlaced = true;
      this.activeItem = active;
      return;
    }

    if (active === this.activeItem) return;
    this.activeItem = active;
    indicator.style.left = `${x}px`;
    indicator.style.top = `${y}px`;
    indicator.style.width = `${width}px`;
    indicator.style.height = `${height}px`;
    indicator.style.opacity = '1';
  }

  private teardown(): void {
    this.mutationObserver?.disconnect();
    this.resizeObserver?.disconnect();
    this.indicator?.remove();
    if (this.changedPosition) this.host.nativeElement.style.position = '';
  }
}
