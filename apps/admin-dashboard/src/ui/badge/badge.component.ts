import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { SeStatusKind, statusMeaning } from './status';

export type SeBadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

/**
 * A badge: one or two words in a coloured pill. The word carries the meaning;
 * the colour only reinforces it.
 *
 *     <se-badge tone="info">Draft</se-badge>
 *
 * For a domain state (an order, payment, approval, stock level...) use
 * `<se-status>` instead, so the wording and colour come from the shared mapping.
 */
@Component({
  selector: 'se-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': "'se-badge se-badge--' + tone()" },
  template: `<ng-content />`,
})
export class SeBadgeComponent {
  readonly tone = input<SeBadgeTone>('neutral');
}

/**
 * The badge for a domain state. Give it the vocabulary and the value the API
 * sent; it supplies the wording and the colour.
 *
 *     <se-status kind="order" [value]="order.status" />
 *     <se-status kind="payment" [value]="order.paymentStatus" />
 */
@Component({
  selector: 'se-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': "'se-badge se-badge--' + meaning().tone" },
  template: `{{ meaning().label }}`,
})
export class SeStatusComponent {
  readonly kind = input.required<SeStatusKind>();
  readonly value = input.required<string | null | undefined>();
  readonly meaning = computed(() => statusMeaning(this.kind(), this.value()));
}
