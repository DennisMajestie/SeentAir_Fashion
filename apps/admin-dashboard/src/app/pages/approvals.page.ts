import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiService, Approval } from '../api.service';

@Component({
  selector: 'app-approvals',
  imports: [CommonModule],
  template: `
    <h1>Approval queue</h1>
    <p class="muted">Purchasing, production starts, price changes, and fund movements wait here — nothing proceeds without a decision.</p>
    @if (approvals().length === 0) {
      <p class="success">Nothing pending.</p>
    }
    @for (approval of approvals(); track approval.id) {
      <section class="panel row">
        <div>
          <strong>{{ approval.actionType.replaceAll('_', ' ') }}</strong>
          <span class="muted"> · requested by {{ approval.requestedBy.name }} · {{ approval.createdAt | date: 'medium' }}</span>
          <pre class="payload">{{ approval.payload | json }}</pre>
        </div>
        <div class="actions">
          <button class="cta small" (click)="decide(approval.id, 'approved')">Approve</button>
          <button class="danger small" (click)="decide(approval.id, 'rejected')">Reject</button>
        </div>
      </section>
    }
    @if (error()) { <p class="error">{{ error() }}</p> }
  `,
})
export class ApprovalsPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly approvals = signal<Approval[]>([]);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.api.pendingApprovals().subscribe((a) => this.approvals.set(a));
  }

  decide(id: string, decision: 'approved' | 'rejected'): void {
    this.api.decideApproval(id, decision).subscribe({
      next: () => this.load(),
      error: (err) => this.error.set(err?.error?.message ?? 'Decision failed.'),
    });
  }
}
