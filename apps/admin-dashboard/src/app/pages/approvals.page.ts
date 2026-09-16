import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, Approval } from '../api.service';

@Component({
  selector: 'app-approvals',
  imports: [CommonModule, FormsModule],
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

    <p class="section-label">History
      <span class="count">
        <select [(ngModel)]="historyFilter" name="hf" (ngModelChange)="loadHistory()" style="background:var(--obsidian); color:var(--ink); border:1px solid var(--hairline-2); padding:0.2rem">
          <option value="">all</option>
          <option value="approved">approved</option>
          <option value="rejected">rejected</option>
        </select>
      </span>
    </p>
    <table class="table">
      <thead><tr><th>Action</th><th>Requested by</th><th>Status</th><th>When</th></tr></thead>
      <tbody>
        @for (h of history(); track h.id) {
          <tr>
            <td>{{ h.actionType.replaceAll('_', ' ') }}</td>
            <td class="small">{{ h.requestedBy.name }}</td>
            <td><span class="chip" [class.ok]="h.status === 'approved'" [class.bad]="h.status === 'rejected'" [class.warn]="h.status === 'pending'">{{ h.status }}</span></td>
            <td class="mono small">{{ h.createdAt | date: 'MMM d, HH:mm' }}</td>
          </tr>
        }
      </tbody>
    </table>
  `,
})
export class ApprovalsPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly approvals = signal<Approval[]>([]);
  readonly history = signal<Approval[]>([]);
  readonly error = signal<string | null>(null);
  historyFilter = '';

  ngOnInit(): void {
    this.load();
    this.loadHistory();
  }

  private load(): void {
    this.api.pendingApprovals().subscribe((a) => this.approvals.set(a));
  }

  loadHistory(): void {
    this.api.approvalsHistory(this.historyFilter || undefined).subscribe((res) => this.history.set(res.data));
  }

  decide(id: string, decision: 'approved' | 'rejected'): void {
    this.api.decideApproval(id, decision).subscribe({
      next: () => {
        this.load();
        this.loadHistory();
      },
      error: (err) => this.error.set(err?.error?.message ?? 'Decision failed.'),
    });
  }
}
