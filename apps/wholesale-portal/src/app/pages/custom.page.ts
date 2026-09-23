import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, CustomOrder } from '../api.service';
import { pill } from '../status-pill';

/** Custom/special design requests — quote, full payment, sample gate, production. */
@Component({
  selector: 'app-custom',
  imports: [CommonModule, FormsModule],
  template: `
    <h1>Custom design requests</h1>

    <section class="panel">
      <h2>Submit a design request</h2>
      <form class="custom-form" (ngSubmit)="submit()">
        <label>Sizes <input [(ngModel)]="form.sizes" name="sizes" placeholder="M, L, XL" required /></label>
        <label>Colours <input [(ngModel)]="form.colours" name="colours" placeholder="black/gold" required /></label>
        <label>Quantity <input type="number" min="1" [(ngModel)]="form.quantity" name="quantity" required /></label>
        <label>Delivery location <input [(ngModel)]="form.location" name="location" required /></label>
        <label>Fabric quality <input [(ngModel)]="form.fabricQuality" name="fabricQuality" placeholder="premium cotton" required /></label>
        <label>Desired date <input type="date" [(ngModel)]="form.desiredDate" name="desiredDate" required /></label>
        <label class="wide">Design description <textarea [(ngModel)]="form.description" name="description" rows="3" required></textarea></label>
        <button class="cta" type="submit">Submit request</button>
      </form>
      @if (message()) { <p class="success">{{ message() }}</p> }
      @if (error()) { <p class="error">{{ error() }}</p> }
    </section>

    <h2>Your requests</h2>
    @for (request of requests(); track request.id) {
      <section class="panel">
        <header class="invoice-head">
          <span><code>{{ request.id.slice(0, 8) }}</code> · {{ request.quantity }} pcs · due {{ request.desiredDate }}</span>
          <span class="status" [class]="'status ' + pill(request.status)">{{ request.status.replaceAll('_', ' ') }}</span>
        </header>
        <p class="muted small">{{ request.description }}</p>

        @if (request.status === 'quoted') {
          <button class="link" (click)="loadQuote(request.id)">View quotation</button>
          @if (quoteFor() === request.id && quote()) {
            <p>Quoted: <strong>₦{{ quote()!.amount | number: '1.0-2' }}</strong> {{ quote()!.note }}</p>
            <button class="cta small" (click)="accept(request.id)">Accept quotation</button>
          }
        }
        @if (request.status === 'quote_accepted') {
          <p class="muted small">Awaiting your full payment (bank transfer/POS) — our team confirms it, then the sample goes into production.</p>
        }
        @if (request.status === 'sample_in_production') {
          <p><strong>Your sample is in production.</strong> Once you receive it, decide below — full production only starts after your approval.</p>
          <button class="cta small" (click)="sample(request.id, true)">Approve sample</button>
          <button class="link" (click)="sample(request.id, false)">Reject sample</button>
        }
      </section>
    }
  `,
})
export class CustomPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly pill = pill;
  readonly requests = signal<CustomOrder[]>([]);
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly quoteFor = signal<string | null>(null);
  readonly quote = signal<{ amount: number; note: string | null } | null>(null);

  form = {
    sizes: '',
    colours: '',
    quantity: 20,
    location: '',
    fabricQuality: '',
    description: '',
    desiredDate: '',
  };

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.api.customOrders().subscribe((res) => this.requests.set(res.data));
  }

  submit(): void {
    this.error.set(null);
    this.api.submitCustomOrder(this.form).subscribe({
      next: () => {
        this.message.set('Request submitted — you will be notified when it is reviewed and quoted.');
        this.load();
      },
      error: (err) => this.error.set(err?.error?.message ?? 'Submission failed.'),
    });
  }

  loadQuote(id: string): void {
    this.quoteFor.set(id);
    this.api.quotation(id).subscribe((q) => this.quote.set(q));
  }

  accept(id: string): void {
    this.api.acceptQuote(id).subscribe({
      next: () => this.load(),
      error: (err) => this.error.set(err?.error?.message ?? 'Could not accept.'),
    });
  }

  sample(id: string, approved: boolean): void {
    this.api.decideSample(id, approved).subscribe({
      next: () => this.load(),
      error: (err) => this.error.set(err?.error?.message ?? 'Could not record decision.'),
    });
  }
}
