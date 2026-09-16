import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, ReturnRequest } from '../api.service';

@Component({
  selector: 'app-returns',
  imports: [CommonModule, FormsModule],
  template: `
    <h1>Returns queue</h1>
    <p class="muted">12h request window enforced by the system; physical return due within 24h of the request.</p>
    @if (returns().length === 0) { <p class="success">No returns waiting.</p> }
    @for (request of returns(); track request.id) {
      <section class="panel">
        <p>
          <code>{{ request.variant.sku }}</code> × {{ request.quantity }}
          · order <code>{{ request.order.id.slice(0, 8) }}</code>
          · <span class="status">{{ request.status }}</span>
        </p>
        <p class="muted small">
          "{{ request.reason }}" — requested {{ request.requestedAt | date: 'medium' }},
          return due {{ request.returnDeadline | date: 'medium' }}
        </p>
        @if (request.status === 'requested') {
          <div class="actions">
            <input [(ngModel)]="resolutions[request.id]" placeholder="Resolution (e.g. refund issued)" />
            <button class="cta small" (click)="resolve(request.id, 'restocked')">Resolve — restock</button>
            <button class="danger small" (click)="resolve(request.id, 'damaged')">Resolve — damaged</button>
          </div>
        }
      </section>
    }
    @if (error()) { <p class="error">{{ error() }}</p> }
  `,
})
export class ReturnsPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly returns = signal<ReturnRequest[]>([]);
  readonly error = signal<string | null>(null);
  resolutions: Record<string, string> = {};

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.api.returns().subscribe((res) => this.returns.set(res.data));
  }

  resolve(id: string, disposition: 'restocked' | 'damaged'): void {
    const resolution = this.resolutions[id]?.trim();
    if (!resolution) {
      this.error.set('Enter a resolution note first.');
      return;
    }
    this.error.set(null);
    this.api.resolveReturn(id, resolution, disposition).subscribe({
      next: () => this.load(),
      error: (err) => this.error.set(err?.error?.message ?? 'Resolution failed.'),
    });
  }
}
