import { Component, OnInit, inject, signal } from '@angular/core';
import {
  SeCellDirective,
  SeColumn,
  SeConfirmService,
  SeDatePipe,
  SePageComponent,
  SeRowAction,
  SeTableComponent,
  SeToastService,
} from '@seentair/ui';
import { AccessService } from '../access.service';
import { ApiService } from '../api.service';

export interface ReviewRow {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  variant: { sku: string };
}

/** "4 of 5" rather than glyphs, so the rating reads the same everywhere. */
export const ratingLabel = (rating: number): string => `${rating} of 5`;

/**
 * Review moderation. Reviews stay hidden from the storefront until published
 * (the moderated default holds until the client answers Open Question #4), so
 * this list is the queue of what is still waiting. Publishing or rejecting
 * needs full access to the catalogue, as the API requires.
 */
@Component({
  selector: 'app-reviews-admin',
  imports: [SeCellDirective, SeDatePipe, SePageComponent, SeTableComponent],
  template: `
    <se-page
      title="Reviews"
      description="A review is hidden from the storefront until it is published here."
    >
      <se-table
        caption="Reviews awaiting moderation"
        [columns]="columns"
        [rows]="reviews()"
        [loading]="loading()"
        [error]="error()"
        (retry)="load()"
        [actions]="actions"
        emptyHeading="No reviews waiting"
        emptyText="Every submitted review has been decided."
      >
        <ng-template seCell="submitted" let-row>{{
          row.createdAt | seDate: 'datetime'
        }}</ng-template>
      </se-table>
    </se-page>
  `,
})
export class ReviewsAdminPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly confirm = inject(SeConfirmService);
  private readonly toast = inject(SeToastService);
  private readonly access = inject(AccessService);

  readonly reviews = signal<ReviewRow[]>([]);
  /** True only until the first answer arrives. */
  readonly loading = signal(true);
  readonly error = signal('');

  readonly columns: SeColumn<ReviewRow>[] = [
    { key: 'sku', header: 'Product', value: (r) => r.variant?.sku ?? '' },
    {
      key: 'rating',
      header: 'Rating',
      numeric: true,
      value: (r) => r.rating,
      format: (v) => ratingLabel(v as number),
    },
    { key: 'comment', header: 'Comment', value: (r) => r.comment || 'No comment' },
    { key: 'submitted', header: 'Submitted', sortable: true, value: (r) => r.createdAt },
  ];

  /** Moderation is a catalogue write; a viewer sees the queue and nothing to press. */
  readonly actions: SeRowAction<ReviewRow>[] = this.access.can('catalogue', 'full')
    ? [
        { label: 'Publish', run: (r) => void this.decide(r, 'published') },
        { label: 'Reject', danger: true, run: (r) => void this.decide(r, 'rejected') },
      ]
    : [];

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.pendingReviews().subscribe({
      next: (res) => {
        this.reviews.set(res as unknown as ReviewRow[]);
        this.loading.set(false);
        this.error.set('');
      },
      error: (err) => {
        this.loading.set(false);
        if (this.reviews().length === 0) {
          this.error.set(
            err?.error?.message ?? 'The server did not respond. Nothing has been changed.',
          );
        }
      },
    });
  }

  async decide(review: ReviewRow, status: 'published' | 'rejected'): Promise<void> {
    const sku = review.variant?.sku ?? 'this product';
    let ok: boolean;
    if (status === 'published') {
      ok = await this.confirm.ask({
        title: `Publish the review of ${sku}?`,
        consequence:
          'The review becomes visible to every shopper on the storefront. It can be taken down again by rejecting it later.',
        confirmLabel: 'Publish review',
      });
    } else {
      // The API does not record a reason yet; it is asked for so the decision
      // is deliberate and is kept in the toast for the person who made it.
      const reason = await this.confirm.askWithReason({
        title: `Reject the review of ${sku}?`,
        consequence:
          'The review stays hidden from the storefront and leaves the queue. The customer is not told. This is written to the audit log.',
        confirmLabel: 'Reject review',
        danger: true,
        reasonLabel: 'Reason for rejecting',
      });
      ok = reason !== null;
    }
    if (!ok) return;
    this.api.moderateReview(review.id, status).subscribe({
      next: () => {
        this.toast.show(status === 'published' ? 'Review published' : 'Review rejected');
        this.load();
      },
      error: (err) =>
        this.toast.show(err?.error?.message ?? 'The review could not be updated', {
          tone: 'danger',
          action: { label: 'Try again', run: () => void this.decide(review, status) },
        }),
    });
  }
}
