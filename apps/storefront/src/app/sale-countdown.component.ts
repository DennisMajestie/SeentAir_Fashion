import { Component, NgZone, OnDestroy, OnInit, inject, input, output, signal } from '@angular/core';
import { formatCountdown } from './pricing';

/**
 * The time left on a real sale, counting down to the product's `saleEndsAt`.
 *
 * It only ever renders for a sale that exists, and when the end time arrives it
 * stops and tells its parent, which goes back to showing the normal price.
 *
 * aria-hidden: a clock that changes every second is noise to a screen reader.
 * The parent states the end time once, in words, next to it.
 */
@Component({
  selector: 'app-sale-countdown',
  template: `<span class="sale-clock" aria-hidden="true">{{ text() }}</span>`,
})
export class SaleCountdownComponent implements OnInit, OnDestroy {
  private readonly zone = inject(NgZone);
  /** ISO end time of the sale. */
  readonly endsAt = input.required<string>();
  /** Fires once, when the end time is reached. */
  readonly ended = output<void>();

  readonly text = signal('');
  private timer: ReturnType<typeof setInterval> | undefined;

  ngOnInit(): void {
    const end = Date.parse(this.endsAt());
    this.text.set(formatCountdown(end - Date.now()));
    // Scheduled OUTSIDE the Angular zone: a recurring timer inside it keeps the
    // zone permanently unstable, which starves fixture.whenStable() in every
    // spec that mounts a card. Each tick re-enters the zone for its update.
    this.zone.runOutsideAngular(() => {
      this.timer = setInterval(() => {
        const left = end - Date.now();
        this.zone.run(() => {
          if (left <= 0) {
            clearInterval(this.timer);
            this.ended.emit();
          } else {
            this.text.set(formatCountdown(left));
          }
        });
      }, 1000);
    });
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }
}
