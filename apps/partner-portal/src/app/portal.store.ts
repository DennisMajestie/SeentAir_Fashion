import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService, Me, PartnerDashboard, InventorySummaryRow, PartnerMessage, ProductVariantRef } from './api.service';

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
  /** Live event-sourced stock summary (per-item quantities, aggregate level). */
  readonly inventory = signal<InventorySummaryRow[] | null>(null);
  /** In-platform messages addressed to this account (notifications inbox). */
  readonly messages = signal<PartnerMessage[] | null>(null);
  private readonly variantIndex = signal<Record<string, ProductVariantRef>>({});
  private readonly lastUpdated = signal<number | null>(null);

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

  /** Confirmed profit-allocation covenant, e.g. "40 / 40 / 20" — mirror of server config. */
  readonly covenantLabel = computed(() => {
    const c = this.dash()?.config;
    return `${c?.reinvestmentPct ?? 40} / ${c?.dividendsPct ?? 40} / ${c?.reservePct ?? 20}`;
  });

  /** Position timestamp in the company timezone, or null before the first load. */
  readonly lastUpdatedLabel = computed(() => {
    const t = this.lastUpdated();
    if (!t) return null;
    return new Date(t).toLocaleTimeString('en-NG', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'Africa/Lagos',
    });
  });

  /** Finished-garment stock rows joined to their product label, high → low. */
  readonly finishedVariantRows = computed(() => {
    const index = this.variantIndex();
    return (this.inventory() ?? [])
      .filter((r) => r.itemType === 'variant' && r.currentQuantity !== 0)
      .map((r) => ({ ...r, meta: index[r.itemId] ?? null }))
      .sort((a, b) => b.currentQuantity - a.currentQuantity);
  });

  /** Raw material (mill) rows from the same live summary — never "—" placeholders. */
  readonly materialRows = computed(() => {
    const index = this.variantIndex();
    return (this.inventory() ?? [])
      .filter((r) => r.itemType === 'material' && r.currentQuantity !== 0)
      .map((r) => ({ ...r, meta: index[r.itemId] ?? null }))
      .sort((a, b) => b.currentQuantity - a.currentQuantity);
  });

  /** Finished-goods units grouped by product silhouette for the distribution panel. */
  readonly categoryRows = computed(() => {
    const byProduct = new Map<string, number>();
    for (const row of this.finishedVariantRows()) {
      const name = row.meta?.name ?? 'Unlabelled item';
      byProduct.set(name, (byProduct.get(name) ?? 0) + row.currentQuantity);
    }
    const total = [...byProduct.values()].reduce((s, n) => s + n, 0) || 1;
    return [...byProduct.entries()]
      .map(([name, units]) => ({ name, units, pct: (units / total) * 100 }))
      .sort((a, b) => b.units - a.units);
  });

  load(force = false): void {
    if (!force && this.dash()) return;
    this.loadError.set(null);
    if (!force) this.lastUpdated.set(null);
    this.api.dashboard().subscribe({
      next: (d) => {
        this.dash.set(d);
        this.lastUpdated.set(Date.now());
      },
      error: (err: { error?: { message?: string } }) =>
        this.loadError.set(
          err?.error?.message ?? 'No partner record is linked to this account yet — contact Seentair.',
        ),
    });
    this.api.me().subscribe({
      next: (m) => this.me.set(m),
      error: () => this.me.set(null),
    });
    this.api.inventorySummary().subscribe({
      next: (rows) => this.inventory.set(rows),
      error: () => this.inventory.set(null),
    });
    this.api.products().subscribe({
      next: (res) => {
        const index: Record<string, ProductVariantRef> = {};
        for (const product of res.data) {
          for (const variant of product.variants) {
            index[variant.id] = { ...variant, name: product.name };
          }
        }
        this.variantIndex.set(index);
      },
      error: () => this.variantIndex.set({}),
    });
    this.api.messages().subscribe({
      next: (res) => this.messages.set(res.data),
      error: () => this.messages.set(null),
    });
  }

  /** Re-fetch every source (used by the shell refresh control). */
  refresh(): void {
    this.load(true);
  }

  clear(): void {
    this.dash.set(null);
    this.me.set(null);
    this.loadError.set(null);
    this.inventory.set(null);
    this.messages.set(null);
    this.variantIndex.set({});
    this.lastUpdated.set(null);
  }
}
