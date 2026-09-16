import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, Dashboard } from '../api.service';

/** The owner's one-glance home (UX requirement #5): sales today, profit/loss,
    low stock, production status, pending approvals. */
@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, RouterLink],
  template: `
    @if (dashboard(); as d) {
      <div class="tiles">
        <div class="tile">
          <span class="label">Sales today</span>
          <strong>{{ d.salesToday.orders }}</strong>
          <span class="sub">₦{{ d.salesToday.revenue | number: '1.0-2' }}</span>
        </div>
        <div class="tile" [class.negative]="d.profitLoss.net < 0">
          <span class="label">Net (profit/loss)</span>
          <strong>₦{{ d.profitLoss.net | number: '1.0-2' }}</strong>
          <span class="sub">in ₦{{ d.profitLoss.income | number: '1.0-0' }} / out ₦{{ d.profitLoss.expenditure | number: '1.0-0' }}</span>
        </div>
        <a class="tile alert" routerLink="/approvals" [class.ok]="d.pendingApprovals === 0">
          <span class="label">Pending approvals</span>
          <strong>{{ d.pendingApprovals }}</strong>
          <span class="sub">tap to review</span>
        </a>
        <div class="tile" [class.alert]="d.inventory.lowStockMaterialCount > 0">
          <span class="label">Low-stock materials</span>
          <strong>{{ d.inventory.lowStockMaterialCount }}</strong>
          <span class="sub">{{ d.inventory.finishedGoodsUnits }} finished units in stock</span>
        </div>
      </div>

      <div class="cols">
        <section class="panel">
          <h2>Production</h2>
          @if (d.production.length === 0) { <p class="muted">No active batches.</p> }
          @for (row of d.production; track row.stage) {
            <p>{{ row.stage }} — <strong>{{ row.batches }}</strong> batch(es)</p>
          }
        </section>

        <section class="panel">
          <h2>Sales by channel</h2>
          @for (row of d.salesByChannel; track row.channel) {
            <p>{{ row.channel }} — {{ row.orders }} orders · ₦{{ row.revenue | number: '1.0-2' }}</p>
          }
          <h2>Marketing sources</h2>
          @for (row of d.marketingSourcePerformance; track row.source) {
            <p>{{ row.source }} — {{ row.orders }} orders · ₦{{ row.revenue | number: '1.0-2' }}</p>
          }
        </section>

        <section class="panel">
          <h2>Best sellers</h2>
          @for (row of bestSellers(); track row.sku) {
            <p><code>{{ row.sku }}</code> {{ row.productName }} — {{ row.unitsSold }} sold</p>
          }
          <h2>Low stock</h2>
          @for (m of d.inventory.lowStockMaterials; track m.name) {
            <p class="error">{{ m.name }}: {{ m.currentQuantity }} left (reorder at {{ m.reorderThreshold }})</p>
          }
        </section>
      </div>
    } @else {
      <p class="muted">Loading dashboard…</p>
    }
  `,
})
export class DashboardPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly dashboard = signal<Dashboard | null>(null);
  readonly bestSellers = signal<Array<{ sku: string; productName: string; unitsSold: number; revenue: number }>>([]);

  ngOnInit(): void {
    this.api.dashboard().subscribe((d) => this.dashboard.set(d));
    this.api.bestSellers().subscribe((b) => this.bestSellers.set(b));
  }
}
