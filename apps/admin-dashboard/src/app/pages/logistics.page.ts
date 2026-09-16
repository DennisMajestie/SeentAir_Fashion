import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../api.service';

interface LegRow { id: string; carrier: string; legNumber: number; status: string; trackingRef: string | null; cost: number | null; order: { id: string }; }
interface ZoneRow { id: string; zone: string; baseFee: number; pricePerKg: number; }

const LEG_STATUSES = ['pending', 'in_transit', 'delivered', 'failed'];

/** Logistics management — Stitch layout: legs table, create-delivery panel,
    zone pricing (weight + location), quote calculator. */
@Component({
  selector: 'app-logistics-admin',
  imports: [CommonModule, FormsModule],
  template: `
    <h1>Logistics</h1>

    <div class="cols">
      <section class="panel">
        <p class="section-label" style="margin-top:0">Create delivery</p>
        <form class="form-grid" (ngSubmit)="create()">
          <label class="wide">Order id <input [(ngModel)]="nd.orderId" name="doid" required placeholder="paste order uuid" /></label>
          <label>Carrier
            <select [(ngModel)]="nd.carrier" name="dcar">
              <option value="gigl">GIGL (API)</option>
              <option value="dispatch_rider">Dispatch rider</option>
              <option value="transport_co">Transport company</option>
            </select>
          </label>
          <label>Leg # <input type="number" min="1" [(ngModel)]="nd.legNumber" name="dleg" /></label>
          <label>Weight kg <input type="number" min="0" step="0.1" [(ngModel)]="nd.weightKg" name="dw" /></label>
          <label>Zone
            <select [(ngModel)]="nd.zone" name="dz">
              <option value="">—</option>
              @for (z of zones(); track z.id) { <option [value]="z.zone">{{ z.zone }}</option> }
            </select>
          </label>
          <div class="wide"><button class="cta small" type="submit">Create leg</button></div>
        </form>
      </section>

      <section class="panel">
        <p class="section-label" style="margin-top:0">Zone pricing <span class="count">// weight + location</span></p>
        <table class="table">
          <thead><tr><th>Zone</th><th>Base ₦</th><th>Per kg ₦</th></tr></thead>
          <tbody>
            @for (z of zones(); track z.id) {
              <tr><td><strong>{{ z.zone }}</strong></td><td class="mono">{{ z.baseFee | number }}</td><td class="mono">{{ z.pricePerKg | number }}</td></tr>
            }
          </tbody>
        </table>
        <form class="form-grid" (ngSubmit)="upsertZone()">
          <label>Zone <input [(ngModel)]="nz.zone" name="zz" required placeholder="interstate" /></label>
          <label>Base fee ₦ <input type="number" min="0" [(ngModel)]="nz.baseFee" name="zb" required /></label>
          <label>Per kg ₦ <input type="number" min="0" [(ngModel)]="nz.pricePerKg" name="zp" required /></label>
          <div class="wide"><button class="cta small ghost" type="submit">Save zone</button></div>
        </form>
      </section>

      <section class="panel">
        <p class="section-label" style="margin-top:0">Quote calculator</p>
        <form class="form-grid" (ngSubmit)="getQuote()">
          <label>Weight kg <input type="number" min="0" step="0.1" [(ngModel)]="qc.weightKg" name="qw" required /></label>
          <label>Zone
            <select [(ngModel)]="qc.zone" name="qz" required>
              @for (z of zones(); track z.id) { <option [value]="z.zone">{{ z.zone }}</option> }
            </select>
          </label>
          <div class="wide actions" style="margin:0">
            <button class="cta small ghost" type="submit">Quote</button>
            @if (quoteResult() !== null) { <span class="naira" style="font-size:1.4rem">₦{{ quoteResult() | number: '1.0-2' }}</span> }
          </div>
        </form>
      </section>
    </div>

    <p class="section-label">Delivery legs <span class="count">[{{ legs().length | number: '2.0' }}]</span></p>
    <table class="table">
      <thead><tr><th>Order</th><th>Carrier</th><th>Leg</th><th>Tracking</th><th>Cost</th><th>Status</th><th></th></tr></thead>
      <tbody>
        @for (l of legs(); track l.id) {
          <tr>
            <td class="mono small">{{ l.order.id.slice(0, 8) }}</td>
            <td>{{ l.carrier }}</td>
            <td class="mono">{{ l.legNumber }}</td>
            <td class="mono small">{{ l.trackingRef }}</td>
            <td class="mono">{{ l.cost !== null ? '₦' + (l.cost | number) : '—' }}</td>
            <td><span class="chip" [class.ok]="l.status === 'delivered'" [class.warn]="l.status === 'in_transit'" [class.bad]="l.status === 'failed'">{{ l.status.replaceAll('_', ' ') }}</span></td>
            <td>
              <div class="actions" style="margin:0">
                <select [(ngModel)]="statusChoice[l.id]" [name]="'s' + l.id">
                  @for (s of legStatuses; track s) { <option [value]="s">{{ s.replaceAll('_', ' ') }}</option> }
                </select>
                <button class="cta small ghost" (click)="setStatus(l)">Set</button>
              </div>
            </td>
          </tr>
        }
      </tbody>
    </table>
    @if (message()) { <p class="success">{{ message() }}</p> }
    @if (error()) { <p class="error">{{ error() }}</p> }
  `,
})
export class LogisticsAdminPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly legs = signal<LegRow[]>([]);
  readonly zones = signal<ZoneRow[]>([]);
  readonly quoteResult = signal<number | null>(null);
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly legStatuses = LEG_STATUSES;
  statusChoice: Record<string, string> = {};
  nd = { orderId: '', carrier: 'dispatch_rider', legNumber: 1, weightKg: 0, zone: '' };
  nz = { zone: '', baseFee: 0, pricePerKg: 0 };
  qc = { weightKg: 0, zone: '' };

  ngOnInit(): void { this.load(); }
  private load(): void {
    this.api.deliveries().subscribe((res) => {
      const rows = res.data as unknown as LegRow[];
      this.legs.set(rows);
      for (const l of rows) this.statusChoice[l.id] ??= l.status;
    });
    this.api.deliveryPricing().subscribe((res) => this.zones.set(res as unknown as ZoneRow[]));
  }
  private ok(m: string): void { this.message.set(m); this.error.set(null); this.load(); }
  private fail(e: { error?: { message?: string } }, fb: string): void { this.error.set(e?.error?.message ?? fb); this.message.set(null); }

  create(): void {
    this.api.createDelivery({
      orderId: this.nd.orderId, carrier: this.nd.carrier, legNumber: Number(this.nd.legNumber),
      weightKg: this.nd.weightKg ? Number(this.nd.weightKg) : undefined, zone: this.nd.zone || undefined,
    }).subscribe({ next: () => this.ok('Delivery leg created.'), error: (e) => this.fail(e, 'Create failed — GIGL needs API keys; use a manual carrier meanwhile.') });
  }

  upsertZone(): void {
    this.api.upsertPricing({ zone: this.nz.zone, baseFee: Number(this.nz.baseFee), pricePerKg: Number(this.nz.pricePerKg) })
      .subscribe({ next: () => this.ok('Zone saved.'), error: (e) => this.fail(e, 'Zone save failed.') });
  }

  getQuote(): void {
    this.api.quote(Number(this.qc.weightKg), this.qc.zone).subscribe({
      next: (r) => this.quoteResult.set(r.cost),
      error: (e) => this.fail(e, 'No pricing for that zone.'),
    });
  }

  setStatus(l: LegRow): void {
    this.api.updateDeliveryStatus(l.id, this.statusChoice[l.id]).subscribe({
      next: () => this.ok('Status updated.'),
      error: (e) => this.fail(e, 'Update failed.'),
    });
  }
}
