import { Directive, ElementRef, NgZone, OnDestroy, inject, input, output } from '@angular/core';

/** Turns one side of a raw IntersectionObserverMargin like "400px" into the
    four-sided form the API wants, applying it to the scroll's leading edge. */
function bottomMargin(value: string): string {
  const v = value.trim();
  if (v.length === 0 || v.includes(' ')) return v;
  return `0px 0px ${v} 0px`;
}

/**
 * Fires when the scrolling viewport reaches this element, so a list can fetch
 * its next page before the user actually sees the end. The host list gives the
 * element a real height (an empty zero-area sentinel cannot intersect), and
 * swaps it back in only after the in-flight page lands — which is what makes
 * the scroll continue automatically: each fresh sentinel is observed again and
 * fires immediately if it is already within the viewer's reach.
 *
 *     @if (hasMore()) {
 *       @if (loadingMore()) { … loading row … }
 *       @else { <div seInfiniteScroll (nearEnd)="loadMore()"></div> }
 *     }
 */
@Directive({
  selector: '[appInfiniteScroll]',
})
export class InfiniteScrollDirective implements OnDestroy {
  /** Emitted once per mounted sentinel, when the end comes into reach. */
  readonly nearEnd = output<void>();
  /** Extra space beyond the viewport that already counts as "near the end". */
  readonly margin = input<string>('400px');

  private readonly zone = inject(NgZone);
  private readonly el: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly io: IntersectionObserver;

  constructor() {
    this.io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        // One shot per mounted sentinel; the list swaps in a new one when the
        // page lands, which re-arms the scroll automatically.
        this.io.unobserve(this.el.nativeElement);
        this.zone.run(() => this.nearEnd.emit());
      },
      { rootMargin: bottomMargin(this.margin()) },
    );
    this.zone.runOutsideAngular(() => this.io.observe(this.el.nativeElement));
  }

  ngOnDestroy(): void {
    this.io.disconnect();
  }
}
