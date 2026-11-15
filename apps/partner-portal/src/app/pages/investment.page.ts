import { DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { SeMoneyPipe } from '@seentair/ui';
import { PortalStore } from '../portal.store';

/**
 * Screen P4: the shareholder registry record for this partner — read-only,
 * aggregates only. Sections the design invents (wire tranches, valuations)
 * have no API data behind them and are not rendered.
 */
@Component({
  selector: 'app-investment-page',
  imports: [DecimalPipe, SeMoneyPipe],
  template: `
    @if (store.dash(); as d) {
      <div class="stitch">
        <div class="flex flex-col gap-4 md:grid md:grid-cols-2 md:items-start">
          <!-- Primary Equity Hero Island Card -->
          <section class="hero bg-light-surface rounded-xl p-5 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.06)] relative overflow-hidden md:col-span-2">
            <!-- Background subtle tactile watermark -->
            <div class="absolute -right-4 -bottom-4 text-canvas-tint pointer-events-none opacity-40" aria-hidden="true">
              <span class="material-symbols-outlined text-[110px]">pie_chart</span>
            </div>

            <div class="relative z-10 flex flex-col gap-3.5">
              <div class="flex items-start justify-between">
                <div>
                  <span class="text-[11px] font-mono uppercase tracking-wider text-light-secondary font-semibold block">Total Invested Position</span>
                  <div class="text-[28px] font-bold font-mono text-light-primary tracking-tight mt-0.5">{{ d.investmentInformation.investedAmount | seMoney }}</div>
                </div>
                <span class="px-2.5 py-0.5 rounded-full bg-accent/15 text-warning font-semibold text-[11px] border border-accent/25">Active Syndicate</span>
              </div>

              <p class="text-[12px] text-light-secondary leading-relaxed">
                Represents {{ d.investmentInformation.shares | number }} fully paid ordinary shares out of {{ d.investmentInformation.totalShares | number }} total shares on the Seentair Aba manufacturing cap table.
              </p>

              <!-- Dynamic Equity Bar -->
              <div class="flex flex-col gap-1.5 pt-1">
                <div class="flex justify-between text-[11px] font-mono text-light-secondary">
                  <span>Your Stake ({{ d.investmentInformation.shares | number }})</span>
                  <span>Total Pool ({{ d.investmentInformation.totalShares | number }})</span>
                </div>
                <div class="w-full h-2 rounded-full bg-canvas-tint overflow-hidden">
                  <div class="h-full bg-accent rounded-full" [style.width.%]="d.investmentInformation.equityPercentage"></div>
                </div>
                <span class="text-[11px] font-mono text-accent font-semibold">{{ d.investmentInformation.equityPercentage }}% equity ownership</span>
              </div>

              <!-- Valuation Ribbon (real registry figures) -->
              <div class="metrics grid grid-cols-2 gap-2 pt-3 border-t border-border text-[12px] md:grid-cols-4">
                <div class="p-2.5 rounded-lg bg-canvas border border-border/80">
                  <span class="text-[10px] text-light-secondary font-mono block">Total capital invested</span>
                  <strong class="font-mono text-light-primary text-[13px] block mt-0.5">{{ d.investmentInformation.investedAmount | seMoney }}</strong>
                  <span class="text-[9px] text-light-secondary font-semibold">Fully paid on registry</span>
                </div>
                <div class="p-2.5 rounded-lg bg-canvas border border-border/80">
                  <span class="text-[10px] text-light-secondary font-mono block">Shares held</span>
                  <strong class="font-mono text-light-primary text-[13px] block mt-0.5">{{ d.investmentInformation.shares | number }}</strong>
                  <span class="text-[9px] text-light-secondary font-semibold">of {{ d.investmentInformation.totalShares | number }} total</span>
                </div>
                <div class="p-2.5 rounded-lg bg-canvas border border-border/80">
                  <span class="text-[10px] text-light-secondary font-mono block">Dividends to date</span>
                  <strong class="font-mono text-success text-[13px] block mt-0.5">{{ store.lifetimeDividends() | seMoney }}</strong>
                  <span class="text-[9px] text-light-secondary font-semibold">Lifetime declared</span>
                </div>
                <div class="p-2.5 rounded-lg bg-canvas border border-border/80">
                  <span class="text-[10px] text-light-secondary font-mono block">Latest dividend</span>
                  <strong class="font-mono text-accent text-[13px] block mt-0.5">{{ (store.latestDistribution()?.myDividend ?? 0) | seMoney }}</strong>
                  <span class="text-[9px] text-light-secondary font-semibold">{{ store.latestDistribution()?.period ?? 'No distribution yet' }}</span>
                </div>
              </div>
            </div>
          </section>

          <!-- Equity distribution -->
          <section class="bg-light-surface rounded-xl p-4 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.05)] flex flex-col gap-2.5">
            <div class="flex items-center justify-between border-b border-border pb-2.5">
              <div>
                <h2 class="text-[14px] font-bold text-light-primary">Equity distribution</h2>
                <span class="text-[11px] text-light-secondary">Shareholder groups</span>
              </div>
              <span class="text-[11px] font-mono text-accent font-semibold">{{ d.config.partnersSharePct }}% PARTNERS</span>
            </div>

            <div class="equity-split flex flex-col gap-2.5 text-[12px]">
              @for (row of equityRows(); track row.label) {
                <div class="p-3 rounded-lg bg-canvas border border-border">
                  <div class="flex justify-between items-center">
                    <span class="font-semibold text-light-primary">{{ row.label }}</span>
                    <strong class="font-mono text-light-primary">{{ row.pct }}%</strong>
                  </div>
                  <div class="w-full h-2 rounded-full bg-canvas-tint overflow-hidden my-2">
                    <div class="h-full rounded-full" [class.bg-accent]="row.me" [class.bg-light-surface-variant]="!row.me" [style.width.%]="row.pct"></div>
                  </div>
                  <span class="text-[10px] font-mono text-light-secondary">{{ row.shares | number }} shares</span>
                </div>
              }
            </div>
          </section>

          <!-- Capitalization table -->
          <section class="bg-light-surface rounded-xl p-4 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.05)] flex flex-col gap-1 text-[12px]">
            <h3 class="text-[13px] font-bold text-light-primary border-b border-border pb-2 flex items-center justify-between">
              <span>Capitalization table</span>
              <span class="text-[11px] font-mono text-accent">CLASS A</span>
            </h3>
            <div class="cap-table">
              @for (row of capRows(); track row.id) {
                <div class="flex justify-between py-1.5 border-b border-border/60 gap-3">
                  <div>
                    <strong class="text-light-primary block font-semibold">{{ row.group }}</strong>
                    <span class="text-[11px] text-light-secondary">Class {{ row.cls }} · {{ row.rights }}</span>
                  </div>
                  <div class="text-right">
                    <strong class="font-mono text-light-primary block">{{ row.equityPct }}%</strong>
                    <span class="text-[10px] font-mono text-light-secondary">{{ row.shares | number }} shares</span>
                  </div>
                </div>
              }
            </div>
          </section>

          <!-- Registry & capital model -->
          <section class="bg-light-surface rounded-xl p-4 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.05)] flex flex-col gap-1 text-[12px]">
            <h3 class="text-[13px] font-bold text-light-primary border-b border-border pb-2">Registry &amp; capital model</h3>
            <div class="flex justify-between py-1.5 border-b border-border/60 gap-3">
              <span class="text-light-secondary">Instrument:</span>
              <strong class="text-light-primary text-right">Class A voting ordinary shares</strong>
            </div>
            <div class="flex justify-between py-1.5 border-b border-border/60 gap-3">
              <span class="text-light-secondary">Profit retention:</span>
              <strong class="font-mono text-light-primary text-right">{{ d.config.reinvestmentPct }}% reinvestment</strong>
            </div>
            <div class="flex justify-between py-1.5 border-b border-border/60 gap-3">
              <span class="text-light-secondary">Dividend pool:</span>
              <strong class="font-mono text-light-primary text-right">{{ d.config.dividendsPct }}% of quarterly net</strong>
            </div>
            <div class="flex justify-between py-1.5 border-b border-border/60 gap-3">
              <span class="text-light-secondary">Strategic reserve:</span>
              <strong class="font-mono text-light-primary text-right">{{ d.config.reservePct }}% retained</strong>
            </div>
            <div class="flex justify-between py-1.5 gap-3">
              <span class="text-light-secondary">Ledger entry:</span>
              <strong class="text-light-primary text-right">Initial equity injection · cleared</strong>
            </div>
          </section>

          <!-- Registry Slip Export -->
          <div class="p-3.5 rounded-xl bg-canvas-tint/70 border border-border flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-[20px] text-accent">workspace_premium</span>
              <div>
                <span class="text-[12px] font-bold text-light-primary block">Official registry slip</span>
                <span class="text-[10px] text-light-secondary font-mono">Print a sealed copy for your records</span>
              </div>
            </div>
            <button type="button" class="px-3 py-1.5 rounded-full bg-light-surface border border-border text-[11px] font-bold text-light-primary hover:bg-canvas" (click)="print()">Print</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class InvestmentPage {
  readonly store = inject(PortalStore);

  readonly otherPartnersPct = computed(() => {
    const mine = this.store.dash()?.investmentInformation.equityPercentage ?? 0;
    const partnersPct = this.store.dash()?.config.partnersSharePct ?? 40;
    return Math.max(0, partnersPct - mine);
  });
  readonly founderShares = computed(() => {
    const total = this.store.dash()?.investmentInformation.totalShares ?? 0;
    const founderPct = this.store.dash()?.config.founderSharePct ?? 60;
    return Math.round(total * (founderPct / 100));
  });
  readonly otherPartnersShares = computed(() => {
    const d = this.store.dash()?.investmentInformation;
    if (!d) return 0;
    return Math.max(0, d.totalShares - this.founderShares() - d.shares);
  });
  readonly equityRows = computed(() => {
    const d = this.store.dash();
    if (!d) return [];
    return [
      { label: 'Founder & executive team', pct: d.config.founderSharePct, shares: this.founderShares(), me: false },
      { label: 'Other strategic partners', pct: this.otherPartnersPct(), shares: this.otherPartnersShares(), me: false },
      { label: `Your holding (${this.store.firstName()})`, pct: d.investmentInformation.equityPercentage, shares: d.investmentInformation.shares, me: true },
    ];
  });
  readonly capRows = computed(() => {
    const d = this.store.dash();
    if (!d) return [];
    return [
      { id: 'founder', cls: 'A', group: 'Founder & executive team', shares: this.founderShares(), equityPct: d.config.founderSharePct, rights: `${d.config.founderSharePct}% of pool` },
      { id: 'partners', cls: 'A', group: 'Other strategic partners', shares: this.otherPartnersShares(), equityPct: this.otherPartnersPct(), rights: 'Equity % of pool' },
      { id: 'me', cls: 'A', group: `${this.store.me()?.name ?? 'You'} (your holding)`, shares: d.investmentInformation.shares, equityPct: d.investmentInformation.equityPercentage, rights: `${d.investmentInformation.equityPercentage}% of pool` },
    ];
  });
  print(): void {
    window.print();
  }
}
