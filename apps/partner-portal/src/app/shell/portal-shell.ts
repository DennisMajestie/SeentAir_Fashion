import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SeBannerComponent, SeButtonDirective, SeConfirmService, SeSkeletonComponent, SeToastService } from '@seentair/ui';
import { ApiService } from '../api.service';
import { PortalStore } from '../portal.store';
import { ThemeService } from '../theme.service';
import { ShellStateService } from '../shell-state.service';
import { RailIndicator } from '../rail-indicator.directive';

/** Desktop: Vessa-style island shell (rounded rail of three islands + sticky
 *  rounded topbar). Below 768px the shell falls back to the slim bar and the
 *  fixed bottom navigation, unchanged from the mobile design. */
@Component({
  selector: 'app-portal-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, SeBannerComponent, SeButtonDirective, SeSkeletonComponent, RailIndicator],
  template: `
    <div class="p-shell" [class.sd-collapsed]="state.collapsed()">
      <aside class="p-side" aria-label="Partner sections">
        <div class="railbox railbox--theme" role="group" aria-label="Theme"
             [class.railbox--row]="!state.collapsed()"
             [appRailIndicator]="'.ri--theme'" activeClass="is-lit" background="var(--dark)" radius="22px">
          <button type="button" class="ri ri--theme" [class.is-lit]="theme.theme() === 'light'"
                  [attr.aria-pressed]="theme.theme() === 'light'" aria-label="Light mode"
                  [attr.data-tip]="state.collapsed() ? 'Light mode' : null"
                  (click)="theme.setMode('light')">
            <span class="material-symbols-outlined ri__icon">light_mode</span>
            @if (!state.collapsed()) { <span class="ri__label">Light</span> }
          </button>
          <button type="button" class="ri ri--theme" [class.is-lit]="theme.theme() === 'dark'"
                  [attr.aria-pressed]="theme.theme() === 'dark'" aria-label="Dark mode"
                  [attr.data-tip]="state.collapsed() ? 'Dark mode' : null"
                  (click)="theme.setMode('dark')">
            <span class="material-symbols-outlined ri__icon">dark_mode</span>
            @if (!state.collapsed()) { <span class="ri__label">Dark</span> }
          </button>
        </div>

        <nav class="railbox railbox--nav" aria-label="Main"
             [appRailIndicator]="'.ri-group'" activeClass="is-on" background="var(--ochre)" radius="22px">
          <ul class="nav-list">
            @for (item of navItems; track item.link) {
              <li>
                <a class="ri ri-group" [routerLink]="item.link" routerLinkActive="is-on" ariaCurrentWhenActive="page"
                   [attr.data-tip]="state.collapsed() ? item.label : null">
                  <span class="material-symbols-outlined ri__icon">{{ item.icon }}</span>
                  @if (!state.collapsed()) { <span class="ri__label">{{ item.label }}</span> }
                </a>
              </li>
            }
          </ul>
        </nav>

        <div class="railbox railbox--util" role="group" aria-label="Utilities">
          <button type="button" class="ri ri--util" [attr.data-tip]="state.collapsed() ? 'Sign out' : null" (click)="signOut()">
            <span class="material-symbols-outlined ri__icon">logout</span>
            @if (!state.collapsed()) { <span class="ri__label">Sign out</span> }
          </button>
          <button type="button" class="ri ri--collapse" (click)="state.toggle()"
                  [attr.aria-expanded]="!state.collapsed()"
                  [attr.data-tip]="state.collapsed() ? 'Expand sidebar' : 'Collapse sidebar'">
            <span class="material-symbols-outlined ri__icon">{{ state.collapsed() ? 'left_panel_open' : 'left_panel_close' }}</span>
            @if (!state.collapsed()) { <span class="ri__label">{{ state.collapsed() ? 'Expand' : 'Collapse' }}</span> }
          </button>
        </div>
      </aside>

      <div class="p-right">
        <header class="p-top">
          <a class="brand" routerLink="/overview" aria-label="Seentair Partners — overview">
            <img class="vessa-logo vessa-logo--light" src="assets/logo-light.png" alt="Seentair — Style for Everyone" width="834" height="299" />
            <img class="vessa-logo vessa-logo--dark" src="assets/logo-dark.png" alt="" aria-hidden="true" width="243" height="78" />
            <span class="tag">PARTNER</span>
          </a>

          <div class="top-actions">
            <div class="period-chip" aria-label="Reporting period">
              <span>Period</span>
              <strong>{{ store.periodLabel() }}</strong>
            </div>
            @if (store.lastUpdatedLabel(); as synced) {
              <span class="last-synced">Synced {{ synced }}</span>
            }
            <button seButton variant="ghost" iconOnly type="button"
                    [attr.aria-label]="store.lastUpdatedLabel() ? 'Refresh portfolio data, last synced ' + store.lastUpdatedLabel() : 'Refresh portfolio data'"
                    (click)="refresh()">
              <span class="material-symbols-outlined">refresh</span>
            </button>
            <button seButton variant="ghost" iconOnly type="button" class="top-theme"
                    [attr.aria-label]="theme.theme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
                    (click)="theme.toggle()">
              <span class="material-symbols-outlined">{{ theme.theme() === 'dark' ? 'light_mode' : 'dark_mode' }}</span>
            </button>

            <div class="menu">
              <button type="button" class="user" (click)="toggleAccount()" [attr.aria-expanded]="accountOpen()" aria-label="Account menu">
                <span class="av">{{ initials() }}</span>
                <span class="user__text">
                  <small>{{ greeting() }}</small>
                  <span>{{ store.me()?.name ?? 'Partner' }}</span>
                </span>
                <span class="material-symbols-outlined user__chev">expand_more</span>
              </button>
              @if (accountOpen()) {
                <button type="button" class="menu__backdrop" aria-label="Close account menu" (click)="accountOpen.set(false)"></button>
                <div class="menu__panel" role="menu">
                  <div class="menu__profile">
                    <span class="av">{{ initials() }}</span>
                    <span class="user__text">
                      <strong>{{ store.me()?.name ?? 'Partner' }}</strong>
                      <span class="menu__mail">{{ store.me()?.email }}</span>
                    </span>
                  </div>
                  <button type="button" class="menu__item" (click)="go('/settings')">Account &amp; settings</button>
                  <button type="button" class="menu__item" (click)="signOut()">Sign out</button>
                </div>
              }
            </div>
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
      </div>

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
    .p-shell{
      --pg:#f7f2ea; --tint:#efe3c8; --card:#fffdf9; --well:rgba(20,36,28,.05);
      --text:#1b1916; --muted:#7b756a; --line:#e8e1d3; --line-2:#d9d0c2;
      --ochre:#c88a12; --ochre-ink:#1a1405; --dark:#171512; --darkink:#f4f0e6;
      --shadow:0 12px 30px -16px rgba(60,45,10,.3); --r-rail:34px; --r-active:22px;
      background: radial-gradient(80% 70% at 0% 0%, var(--tint), transparent 55%), var(--pg);
      color: var(--text); font-family:'Urbanist',sans-serif; min-height:100dvh; padding-bottom:132px;
    }
    /* ---- top bar (mobile: slim bar; desktop: Vessa island) ---- */
    .p-top{position:sticky;top:0;z-index:30;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:14px 16px 10px;border-bottom:1px solid var(--line);background:rgba(247,242,234,.94);backdrop-filter:blur(10px);}
    .brand{display:flex;align-items:center;gap:10px;min-width:0;text-decoration:none;}
    .vessa-logo{display:block;width:88px;height:auto;max-height:46px;object-fit:contain;object-position:left center;}
    .tag{font:600 10px/1 'JetBrains Mono',monospace;padding:3px 6px;border-radius:999px;background:rgba(200,138,18,.2);color:#93600a;border:1px solid rgba(200,138,18,.35);}
    .top-actions{display:flex;align-items:center;gap:6px;}
    .period-chip{display:flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid var(--border);border-radius:999px;background:var(--surface);font-size:11px;color:var(--text-muted);}
    .period-chip strong{font-family:var(--font-mono,monospace);color:var(--text);}
    .last-synced{font-size:10px;color:var(--text-muted);font-family:var(--font-mono,monospace);white-space:nowrap;}
    @media(max-width:900px){.last-synced{display:none;}}
    .top-actions .material-symbols-outlined{font-size:20px;color:var(--text);}
    @media (max-width:767px){.user__text,.user__chev{display:none;}.user{padding:3px;border-color:transparent;}}

    /* user chip + account menu */
    .menu{position:relative;}
    .user{display:flex;align-items:center;gap:8px;border:1px solid var(--line-2);border-radius:999px;background:transparent;padding:4px 10px 4px 5px;cursor:pointer;color:var(--text);}
    .user:hover{background:var(--well);}
    .av{display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:rgba(200,138,18,.18);color:var(--ochre);font:700 11px/1 'Urbanist',sans-serif;}
    .user__text{display:grid;text-align:left;line-height:1.2;}
    .user__text small{font-size:10px;color:var(--muted);}
    .user__text span{font-size:12px;font-weight:600;max-width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .user__chev{font-size:16px;color:var(--muted);}
    .menu__backdrop{position:fixed;inset:0;z-index:40;border:0;background:transparent;cursor:default;}
    .menu__panel{position:absolute;right:0;top:calc(100% + 10px);min-width:240px;padding:6px;background:var(--card);border:1px solid var(--line-2);border-radius:16px;box-shadow:var(--shadow);z-index:50;animation:menupop .14s ease;}
    @keyframes menupop{from{opacity:0;transform:translateY(-4px);}}
    .menu__profile{display:flex;align-items:center;gap:10px;padding:10px;border-bottom:1px solid var(--line);margin-bottom:4px;}
    .menu__profile .user__text strong{font-size:13px;}
    .menu__mail{font-size:11px;color:var(--muted);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .menu__item{display:block;width:100%;padding:9px 10px;border:0;border-radius:10px;background:none;text-align:left;font:500 13px/1.2 'Urbanist',sans-serif;color:var(--text);cursor:pointer;}
    .menu__item:hover{background:var(--well);}

    .p-main{max-width:390px;margin:0 auto;padding:16px;display:flex;flex-direction:column;gap:12px;}
    .loading{display:flex;flex-direction:column;gap:12px;}

    /* ---- mobile bottom nav (unchanged) ---- */
    .p-nav{position:fixed;left:0;right:0;bottom:0;max-width:390px;margin:0 auto;z-index:30;display:grid;grid-template-columns:repeat(4,1fr);gap:2px;padding:8px 8px calc(8px + env(safe-area-inset-bottom,0px));background:rgba(255,253,249,.96);backdrop-filter:blur(10px);border-top:1px solid var(--line);}
    .p-nav a{display:flex;flex-direction:column;align-items:center;gap:2px;text-decoration:none;color:var(--muted);padding:4px 2px;border-radius:10px;min-width:0;}
    .p-nav a .material-symbols-outlined{font-size:21px;}
    .p-nav a span:last-child{font:500 10px/1.1 Urbanist,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;}
    .p-nav a.active{color:var(--ochre);}
    .p-nav a.active span:last-child{font-weight:700;}

    /* ---- Vessa island rail (desktop only) ---- */
    .p-side{display:none;}
    .railbox{background:var(--card);border-radius:var(--r-rail);padding:4px;display:flex;flex-direction:column;gap:4px;box-shadow:var(--shadow);width:100%;}
    .railbox--row{flex-direction:row;}
    .ri{position:relative;display:flex;align-items:center;gap:12px;height:60px;width:100%;padding:0 12px;border:0;background:none;border-radius:var(--r-active);color:var(--muted);font:500 12.5px/1.2 Urbanist,sans-serif;cursor:pointer;text-decoration:none;transition:background .18s ease,color .18s ease;z-index:1;min-width:0;}
    .ri__icon{font-size:22px;flex:none;}
    .ri__label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;}
    .ri:hover:not(.is-on):not(.is-lit){background:var(--well);color:var(--text);}
    .ri.is-on{color:var(--ochre-ink);}
    .ri.is-lit{color:var(--darkink);}
    .ri.is-lit .ri__icon{color:var(--darkink);}
    .railbox--theme .ri{height:52px;}
    .railbox--util .ri{height:48px;}
    .railbox--row .ri{width:auto;flex:1;justify-content:center;padding:0 8px;}
    .nav-list{display:flex;flex-direction:column;gap:2px;margin:0;padding:0;list-style:none;}
    .railbox--nav .ri{height:56px;}
    .ri-group .ri__label{font-size:13.5px;}

    @media (min-width:768px){
      .p-shell{display:grid;grid-template-columns:auto minmax(0,1fr);gap:16px;padding:10px 12px 12px;padding-bottom:12px;}
      .p-right{display:flex;flex-direction:column;gap:16px;min-width:0;}

      .p-side{display:flex;flex-direction:column;gap:16px;position:sticky;top:10px;height:calc(100dvh - 20px);width:248px;overflow-y:auto;scrollbar-width:none;}
      .p-side::-webkit-scrollbar{display:none;}

      .p-top{top:10px;border:1px solid transparent;border-bottom:0;border-radius:30px;background:var(--card);box-shadow:var(--shadow);backdrop-filter:none;padding:6px 10px;min-height:64px;}
      .p-top .brand .vessa-logo{width:clamp(140px,13vw,172px);max-height:48px;}
      .top-theme{display:none;} /* theme lives in the rail island on desktop */
      .top-actions{gap:10px;}

      .p-main{max-width:1180px;margin:0;padding:4px 4px 32px;}
      .p-nav{display:none;}

      /* Collapsed rail: icon-only 60px circles + tooltips */
      .sd-collapsed .p-side{width:88px;}
      .sd-collapsed .railbox{width:72px;margin:0 auto;}
      .sd-collapsed .railbox--row{flex-direction:column;}
      .sd-collapsed .ri{width:60px;height:60px;min-height:60px;border-radius:50%;padding:0;justify-content:center;margin:0 auto;}
      .sd-collapsed .railbox--theme .ri,.sd-collapsed .railbox--util .ri,.sd-collapsed .ri-group{height:60px;}
      .sd-collapsed .ri__label{display:none;}
      .sd-collapsed .ri[data-tip]:hover::after,.sd-collapsed .ri[data-tip]:focus-visible::after{
        content:attr(data-tip);position:absolute;left:calc(100% + 10px);top:50%;transform:translateY(-50%);
        background:var(--dark);color:var(--darkink);font:600 13px/1 'Urbanist',sans-serif;padding:8px 12px;border-radius:12px;white-space:nowrap;z-index:60;pointer-events:none;
      }
    }
    @media (prefers-reduced-motion: reduce){
      .p-shell *{transition:none !important;animation:none !important;}
    }
  `],
})
export class PortalShell implements OnInit {
  readonly api = inject(ApiService);
  readonly store = inject(PortalStore);
  readonly theme = inject(ThemeService);
  readonly state = inject(ShellStateService);
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

  readonly greeting = computed(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  });

  readonly accountOpen = signal(false);

  ngOnInit(): void { this.store.load(); }
  refresh(): void { this.store.refresh(); }

  toggleAccount(): void {
    this.accountOpen.update((v) => !v);
  }

  go(url: string): void {
    this.accountOpen.set(false);
    void this.router.navigateByUrl(url);
  }

  async signOut(): Promise<void> {
    this.accountOpen.set(false);
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
