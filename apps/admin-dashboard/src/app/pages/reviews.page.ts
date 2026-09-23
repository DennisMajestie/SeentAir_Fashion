import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiService } from '../api.service';

interface ReviewRow { id: string; rating: number; comment: string | null; createdAt: string; variant: { sku: string }; }

/** Review moderation queue — pending until published (Open Question #4 default). */
@Component({
  selector: 'app-reviews-admin',
  imports: [CommonModule],
  template: `
    <h1>Review moderation</h1>
    <p class="rule-strip">Reviews stay hidden from the storefront until published — the moderated default holds until the client answers Open Question #4.</p>

    @if (reviews().length === 0) { <p class="success">No reviews waiting.</p> }
    @for (r of reviews(); track r.id) {
      <section class="panel row">
        <div>
          <p class="mono small acid-text">{{ r.variant.sku }} · {{ r.createdAt | date: 'medium' }}</p>
          <p><span class="stars-acid">{{ '★'.repeat(r.rating) }}{{ '☆'.repeat(5 - r.rating) }}</span></p>
          <p class="muted">{{ r.comment || '(no comment)' }}</p>
        </div>
        <div class="actions flat">
          <button class="cta small" (click)="decide(r.id, 'published')">Publish</button>
          <button class="danger" (click)="decide(r.id, 'rejected')">Reject</button>
        </div>
      </section>
    }
    @if (error()) { <p class="error">{{ error() }}</p> }
  `,
})
export class ReviewsAdminPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly reviews = signal<ReviewRow[]>([]);
  readonly error = signal<string | null>(null);

  ngOnInit(): void { this.load(); }
  private load(): void {
    this.api.pendingReviews().subscribe((res) => this.reviews.set(res as unknown as ReviewRow[]));
  }
  decide(id: string, status: 'published' | 'rejected'): void {
    this.api.moderateReview(id, status).subscribe({
      next: () => this.load(),
      error: (e) => this.error.set(e?.error?.message ?? 'Moderation failed.'),
    });
  }
}
