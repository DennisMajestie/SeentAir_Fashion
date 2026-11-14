import { Component, OnInit, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SeBannerComponent, SeButtonDirective, SeConfirmService, SeSkeletonComponent, SeToastService } from '@seentair/ui';
import { ApiService } from '../api.service';
import { PortalStore } from '../portal.store';
import { ThemeService } from '../theme.service';

@Component({
  selector: 'app-portal-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, SeBannerComponent, SeButtonDirective, SeSkeletonComponent],
  template: `
    <div class="p-shell">
      <header class="p-top">
        <div class="brand">
          <div class="logo">S</div>
          <div>
            <div class="brand-row"><span class="name">SEENTAIR</span><span class="tag">PARTNER</span></div>
            <span class="sub">Equity Syndicate Ledger</span>
          </div>
        </div>
        <div class="top-actions">
          <button seButton variant="ghost" iconOnly type="button" [attr.aria-label]="store.lastUpdatedLabel() ? 'Refresh portfolio data, last synced ' + store.lastUpdatedLabel() : 'Refresh portfolio data'" (click)="refresh()">
            <span class="material-symbols-outlined">refresh</span>
          </button>
          <button seButton variant="ghost" iconOnly type="button" [attr.aria-label]="theme.theme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'" (click)="theme.toggle()">
            <span class="material-symbols-outlined">{{ theme.theme() === 'dark' ? 'light_mode' : 'dark_mode' }}</span>
          </button>
          <button type="button" class="avatar" (click)="signOut()" [attr.aria-label]="'Sign out ' + (store.me()?.name ?? 'partner')">{{ initials() }}</button>
        </div>
      </header>

      <main class="p-main">
        @if (store.loadError(); as err) {
          <se-banner tone="danger" title="Your portfolio could not be loaded" actionLabel="Try again" (action)="refresh()">{{ err }}</se-banner>
        } @else if (!store.dash()) {
          <div class="loading" aria-busy="true">
            <se-skeleton shape="metric" [columns]="2" />
            <se-skeleton shape="detail" [rows]="6" />
          </div>
        } @else {
          <router-outlet />
        }
      </main>

      <nav class="p-nav" aria-label="Partner navigation">
        @for (item of navItems; track item.link) {
          <a [routerLink]="item.link" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: false }">
            <span class="material-symbols-outlined">{{ item.icon }}</span>
            <span>{{ item.label }}</span>
          </a>
        }
      </nav>
    </div>
  `,
  styles: [`
    :host{display:block;}
    .p-shell{min-height:100vh;background:#f7f2ea;color:#1b1916;font-family:'Urbanist',sans-serif;padding-bottom:132px;}
    .p-top{position:sticky;top:0;z-index:30;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:14px 16px 10px;border-bottom:1px solid rgba(232,225,211,.8);background:rgba(247,242,234,.94);backdrop-filter:blur(10px);}
    .brand{display:flex;align-items:center;gap:10px;min-width:0;}
    .logo{width:36px;height:36px;border-radius:12px;background:#1b1916;color:#c88a12;display:flex;align-items:center;justify-content:center;font:700 16px/1 Urbanist,sans-serif;flex:none;}
    .brand-row{display:flex;align-items:center;gap:6px;}
    .name{font:700 15px/1 Urbanist,sans-serif;letter-spacing:-.01em;}
    .tag{font:600 10px/1 'JetBrains Mono',monospace;padding:3px 6px;border-radius:999px;background:rgba(200,138,18,.2);color:#93600a;border:1px solid rgba(200,138,18,.3);}
    .sub{display:block;font:500 11px/1.2 Urbanist,sans-serif;color:#7b756a;margin-top:2px;}
    .top-actions{display:flex;align-items:center;gap:4px;}
    .top-actions .material-symbols-outlined{font-size:20px;color:#1b1916;}
    .avatar{width:32px;height:32px;border-radius:999px;border:0;background:#1b1916;color:#fffdf9;font:700 12px/1 Urbanist,sans-serif;cursor:pointer;}
    .p-main{max-width:390px;margin:0 auto;padding:16px;display:flex;flex-direction:column;gap:12px;}
    .loading{display:flex;flex-direction:column;gap:12px;}
    .p-nav{position:fixed;left:0;right:0;bottom:0;max-width:390px;margin:0 auto;z-index:30;display:grid;grid-template-columns:repeat(4,1fr);gap:2px;padding:8px 8px calc(8px + env(safe-area-inset-bottom,0px));background:rgba(255,253,249,.96);backdrop-filter:blur(10px);border-top:1px solid #e8e1d3;}
    .p-nav a{display:flex;flex-direction:column;align-items:center;gap:2px;text-decoration:none;color:#7b756a;padding:4px 2px;border-radius:10px;min-width:0;}
    .p-nav a .material-symbols-outlined{font-size:21px;}
    .p-nav a span:last-child{font:500 10px/1.1 Urbanist,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;}
    .p-nav a.active{color:#c88a12;}
    .p-nav a.active span:last-child{font-weight:700;}
  `],
})
export class PortalShell implements OnInit {
  readonly api = inject(ApiService);
  readonly store = inject(PortalStore);
  readonly theme = inject(ThemeService);
  private readonly confirm = inject(SeConfirmService);
  private readonly toast = inject(SeToastService);
  private readonly router = inject(Router);

  readonly navItems = [
    { label: 'Overview', icon: 'dashboard', link: '/overview' },
    { label: 'Holding', icon: 'pie_chart', link: '/investment' },
    { label: 'Metrics', icon: 'monitoring', link: '/performance' },
    { label: 'Inventory', icon: 'inventory_2', link: '/inventory' },
    { label: 'Reports', icon: 'description', link: '/reports' },
    { label: 'Dividends', icon: 'payments', link: '/profit-sharing' },
    { label: 'Docs', icon: 'folder_open', link: '/documents' },
    { label: 'Settings', icon: 'settings', link: '/settings' },
  ];

  readonly initials = computed(() => {
    const name = (this.store.me()?.name ?? 'Partner').trim();
    const parts = name.split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] ?? 'P') + (parts[1]?.[0] ?? '')).toUpperCase();
  });

  ngOnInit(): void { this.store.load(); }
  refresh(): void { this.store.refresh(); }

  async signOut(): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Sign out?',
      consequence: 'This session ends. Your portfolio is loaded fresh the next time you sign in.',
      confirmLabel: 'Sign out',
      cancelLabel: 'Stay',
    });
    if (!ok) return;
    this.api.logout();
    this.store.clear();
    this.toast.show('Signed out of the partner portal');
    void this.router.navigateByUrl('/login');
  }
}
