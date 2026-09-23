import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService, Me, PartnerDashboard } from './api.service';

/**
 * One dashboard fetch shared by every page — the API's confirmed
 * partner dashboard payload is the single source for all eight screens.
 * Aggregates only; never customer PII (client-explicit boundary).
 */
@Injectable({ providedIn: 'root' })
export class PortalStore {
  private readonly api = inject(ApiService);

  readonly dash = signal<PartnerDashboard | null>(null);
  readonly me = signal<Me | null>(null);
  readonly loadError = signal<string | null>(null);

  /** Calendar quarter label, e.g. "Q3 2026" — real calendar, not a fabricated period. */
  readonly periodLabel = computed(() => {
    const now = new Date();
    return `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`;
  });

  readonly firstName = computed(() => {
    const name = this.me()?.name?.trim();
    return name ? name.split(/\s+/)[0] : 'Partner';
  });

  /** Latest declared distribution (API orders DESC). */
  readonly latestDistribution = computed(() => this.dash()?.profitSharing?.[0] ?? null);

  readonly lifetimeDividends = computed(
    () => this.dash()?.profitSharing?.reduce((sum, d) => sum + d.myDividend, 0) ?? 0,
  );

  /** Net margin % of all-time ledger performance; null when no income yet. */
  readonly netMarginPct = computed(() => {
    const p = this.dash()?.performance;
    if (!p || !p.income) return null;
    return (p.net / p.income) * 100;
  });

  load(force = false): void {
    if (!force && this.dash()) return;
    this.loadError.set(null);
    this.api.dashboard().subscribe({
      next: (d) => this.dash.set(d),
      error: (err: { error?: { message?: string } }) =>
        this.loadError.set(
          err?.error?.message ?? 'No partner record is linked to this account yet — contact Seentair.',
        ),
    });
    this.api.me().subscribe({
      next: (m) => this.me.set(m),
      error: () => this.me.set(null),
    });
  }

  clear(): void {
    this.dash.set(null);
    this.me.set(null);
    this.loadError.set(null);
  }
}
