import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiService, Batch } from '../api.service';

/** Kanban-style production board — batches by stage (UX screen inventory). */
@Component({
  selector: 'app-production',
  imports: [CommonModule],
  template: `
    <h1>Production board</h1>
    <div class="board">
      @for (stage of stages(); track stage) {
        <div class="column">
          <h3>{{ stage }}</h3>
          @for (batch of batchesIn(stage); track batch.id) {
            <div class="card">
              <code>{{ batch.variant.sku }}</code>
              <p>{{ batch.quantity }} units</p>
              @if (nextStage(stage); as next) {
                <button class="cta small" (click)="move(batch.id, next)">→ {{ next }}</button>
              }
            </div>
          }
        </div>
      }
    </div>
    @if (error()) { <p class="error">{{ error() }}</p> }
  `,
})
export class ProductionPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly stages = signal<string[]>([]);
  readonly batches = signal<Batch[]>([]);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.api.batches().subscribe((res) => {
      this.stages.set(res.stages);
      this.batches.set(res.data);
    });
  }

  batchesIn(stage: string): Batch[] {
    return this.batches().filter((b) => b.stage === stage);
  }

  nextStage(stage: string): string | null {
    const stages = this.stages();
    const index = stages.indexOf(stage);
    return index >= 0 && index < stages.length - 1 ? stages[index + 1] : null;
  }

  move(id: string, stage: string): void {
    this.error.set(null);
    this.api.moveBatch(id, stage).subscribe({
      next: () => this.load(),
      error: (err) => this.error.set(err?.error?.message ?? 'Stage move failed.'),
    });
  }
}
