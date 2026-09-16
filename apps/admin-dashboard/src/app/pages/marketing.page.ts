import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../api.service';

interface CampaignRow { id: string; name: string; type: string; channel: string | null; discountPercent: number | null; startDate: string; endDate: string; }

/** Marketing — Stitch layout: campaigns table with type chips, create panel,
    source performance from analytics. */
@Component({
  selector: 'app-marketing-admin',
  imports: [CommonModule, FormsModule],
  template: `
    <h1>Marketing</h1>

    <div class="cols">
      <section class="panel" style="grid-column: span 2; min-width: 0">
        <p class="section-label" style="margin-top:0">Campaigns <span class="count">[{{ campaigns().length | number: '2.0' }}]</span></p>
        <table class="table">
          <thead><tr><th>Name</th><th>Type</th><th>Channel</th><th>Discount</th><th>Runs</th><th>Live</th></tr></thead>
          <tbody>
            @for (c of campaigns(); track c.id) {
              <tr>
                <td><strong>{{ c.name }}</strong></td>
                <td><span class="chip acid">{{ c.type.replaceAll('_', ' ') }}</span></td>
                <td class="mono small">{{ c.channel || '—' }}</td>
                <td class="mono">{{ c.discountPercent !== null ? c.discountPercent + '%' : '—' }}</td>
                <td class="mono small">{{ c.startDate }} → {{ c.endDate }}</td>
                <td><span class="chip" [class.ok]="isActive(c)">{{ isActive(c) ? 'ACTIVE' : 'inactive' }}</span></td>
              </tr>
            }
          </tbody>
        </table>
      </section>

      <section class="panel">
        <p class="section-label" style="margin-top:0">Create campaign</p>
        <form (ngSubmit)="create()">
          <label>Name <input [(ngModel)]="nc.name" name="cname" required /></label>
          <label>Type
            <select [(ngModel)]="nc.type" name="ctype">
              <option value="campaign">campaign</option>
              <option value="promotion">promotion</option>
              <option value="loyalty">loyalty</option>
              <option value="visibility_boost">visibility boost</option>
            </select>
          </label>
          <label>Channel <input [(ngModel)]="nc.channel" name="cchan" placeholder="instagram" /></label>
          <label>Discount % <input type="number" min="0" max="100" [(ngModel)]="nc.discountPercent" name="cdisc" /></label>
          <label>Start <input type="date" [(ngModel)]="nc.startDate" name="cstart" required /></label>
          <label>End <input type="date" [(ngModel)]="nc.endDate" name="cend" required /></label>
          <button class="cta small" type="submit">Create</button>
        </form>
      </section>
    </div>

    <p class="section-label">Source performance <span class="count">// where sales come from</span></p>
    <div class="tiles">
      @for (s of sources(); track s.source) {
        <div class="tile">
          <span class="label">{{ s.source }}</span>
          <strong>{{ s.orders }}</strong>
          <span class="sub">₦{{ s.revenue | number: '1.0-0' }} revenue</span>
        </div>
      }
    </div>
    @if (message()) { <p class="success">{{ message() }}</p> }
    @if (error()) { <p class="error">{{ error() }}</p> }
  `,
})
export class MarketingAdminPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly campaigns = signal<CampaignRow[]>([]);
  readonly sources = signal<Array<{ source: string; orders: number; revenue: number }>>([]);
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  nc = { name: '', type: 'campaign', channel: '', discountPercent: null as number | null, startDate: '', endDate: '' };

  ngOnInit(): void { this.load(); }
  private load(): void {
    this.api.campaigns().subscribe((res) => this.campaigns.set(res as unknown as CampaignRow[]));
    this.api.dashboard().subscribe((d) => this.sources.set(d.marketingSourcePerformance));
  }

  isActive(c: CampaignRow): boolean {
    const today = new Date().toISOString().slice(0, 10);
    return c.startDate <= today && c.endDate >= today;
  }

  create(): void {
    this.api.createCampaign({
      name: this.nc.name, type: this.nc.type, channel: this.nc.channel || undefined,
      discountPercent: this.nc.discountPercent ?? undefined,
      startDate: this.nc.startDate, endDate: this.nc.endDate,
    }).subscribe({
      next: () => { this.message.set('Campaign created.'); this.error.set(null); this.load(); },
      error: (e) => this.error.set(e?.error?.message ?? 'Create failed — check the dates.'),
    });
  }
}
