import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiService, AuditEntry } from '../api.service';

@Component({
  selector: 'app-audit',
  imports: [CommonModule],
  template: `
    <h1>Audit log</h1>
    <p class="muted">Every mutating action, recorded automatically — {{ total() }} entries.</p>
    <table class="table">
      <thead>
        <tr><th>When</th><th>Action</th><th>Actor</th></tr>
      </thead>
      <tbody>
        @for (entry of entries(); track entry.id) {
          <tr>
            <td class="muted">{{ entry.timestamp | date: 'medium' }}</td>
            <td><code>{{ entry.action }}</code></td>
            <td class="muted">{{ entry.actorId?.slice(0, 8) ?? 'system' }}</td>
          </tr>
        }
      </tbody>
    </table>
  `,
})
export class AuditPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly entries = signal<AuditEntry[]>([]);
  readonly total = signal(0);

  ngOnInit(): void {
    this.api.auditLog().subscribe((res) => {
      this.entries.set(res.data);
      this.total.set(res.total);
    });
  }
}
