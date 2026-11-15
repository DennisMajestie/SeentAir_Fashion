import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SeConfirmService, SeToastService } from '@seentair/ui';
import { ApiService } from '../api.service';
import { CartService } from '../cart.service';
import { ThemeService } from '../theme.service';
import { ShellStateService } from '../shell-state.service';
import { RailIndicator } from '../rail-indicator.directive';

/** Authenticated wholesale screens, wrapped in the Vessa island shell on
 *  desktop (rounded rail of islands + sticky rounded topbar, cart shortcut,
 *  account menu). Below 768px the mobile design renders unchanged: pages
 *  keep their own slim sticky headers and the bottom tab bar. */
@Component({
  selector: 'ws-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, RailIndicator],
  template: `
    <div class="ws-shell" [class.sd-collapsed]="state.collapsed()">
      <aside class="ws-side" aria-label="Wholesale sections">
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
                   [routerLinkActiveOptions]="{ exact: item.exact }"
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

      <div class="ws-right">
        <header class="ws-top">
          <a class="brand" routerLink="/" aria-label="Seentair Wholesale — home">
            <img class="vessa-logo vessa-logo--light" src="assets/logo-light.png" alt="Seentair — Style for Everyone" width="834" height="299" />
            <img class="vessa-logo vessa-logo--dark" src="assets/logo-dark.png" alt="" aria-hidden="true" width="243" height="78" />
            <span class="tag">WHOLESALE</span>
          </a>

          <div class="top-actions">
            <a routerLink="/cart" class="circ" [attr.aria-label]="cart.units() > 0 ? 'Bulk cart, ' + cart.units() + ' units' : 'Bulk cart'">
              <span class="material-symbols-outlined">shopping_bag</span>
              @if (cart.units() > 0) {
                <i class="circ__badge">{{ cart.units() }}</i>
              }
            </a>

            <div class="menu">
              <button type="button" class="user" (click)="toggleAccount()" [attr.aria-expanded]="accountOpen()" aria-label="Account menu">
                <span class="av">{{ initials() }}</span>
                <span class="user__text">
                  <small>{{ greeting() }}</small>
                  <span>{{ me() ?? 'Wholesale buyer' }}</span>
                </span>
                <span class="material-symbols-outlined user__chev">expand_more</span>
              </button>
              @if (accountOpen()) {
                <button type="button" class="menu__backdrop" aria-label="Close account menu" (click)="accountOpen.set(false)"></button>
                <div class="menu__panel" role="menu">
                  <div class="menu__profile">
                    <span class="av">{{ initials() }}</span>
                    <span class="user__text">
                      <strong>{{ me() ?? 'Wholesale buyer' }}</strong>
                      <span class="menu__mail">Aba Industrial Line</span>
                    </span>
                  </div>
                  <button type="button" class="menu__item" (click)="go('/orders')">Orders &amp; invoices</button>
                  <button type="button" class="menu__item" (click)="go('/custom')">Custom designs</button>
                  <button type="button" class="menu__item" (click)="signOut()">Sign out</button>
                </div>
              }
            </div>
          </div>
        </header>

        <main class="ws-main">
          <router-outlet />
        </main>
      </div>

      <nav class="ws-nav" aria-label="Wholesale sections">
        @for (item of navItems; track item.link) {
          <a [routerLink]="item.link" routerLinkActive="active" ariaCurrentWhenActive="page"
             [routerLinkActiveOptions]="{ exact: item.exact }">
            <span class="material-symbols-outlined">{{ item.icon }}</span>
            <span>{{ item.label }}</span>
          </a>
        }
      </nav>
    </div>
  `,
  styles: [`
    :host{display:block;}
    .ws-shell{
      --pg:#f7f2ea; --tint:#efe3c8; --card:#fffdf9; --well:rgba(20,36,28,.05);
      --text:#1b1916; --muted:#7b756a; --line:#e8e1d3; --line-2:#d9d0c2;
      --ochre:#c88a12; --ochre-ink:#1a1405; --dark:#171512; --darkink:#f4f0e6;
      --shadow:0 12px 30px -16px rgba(60,45,10,.3); --r-rail:34px; --r-active:22px;
      background: radial-gradient(80% 70% at 0% 0%, var(--tint), transparent 55%), var(--pg);
      color: var(--text); font-family:'Urbanist',sans-serif; min-height:100dvh;
    }
    /* ---- desktop-only Vessa island topbar ---- */
    .ws-top{display:none;}
    .circ{position:relative;display:grid;place-items:center;width:42px;height:42px;border-radius:50%;border:1px solid var(--line-2);background:var(--card);color:var(--muted);cursor:pointer;flex:none;text-decoration:none;}
    .circ:hover{color:var(--text);}
    .circ__badge{position:absolute;top:-4px;right:-4px;background:var(--ochre);color:var(--ochre-ink);font:700 10px/1 'Urbanist',sans-serif;border-radius:999px;padding:2px 6px;font-style:normal;}
    .brand{display:flex;align-items:center;gap:10px;min-width:0;text-decoration:none;}
    .vessa-logo{display:block;width:88px;height:auto;max-height:46px;object-fit:contain;object-position:left center;}
    .tag{font:600 10px/1 'JetBrains Mono',monospace;padding:3px 6px;border-radius:999px;background:rgba(200,138,18,.2);color:#93600a;border:1px solid rgba(200,138,18,.35);}
    .top-actions{display:flex;align-items:center;gap:10px;}
    .top-actions .material-symbols-outlined{font-size:20px;color:var(--text);}

    .menu{position:relative;}
    .user{display:flex;align-items:center;gap:8px;border:1px solid var(--line-2);border-radius:999px;background:transparent;padding:4px 10px 4px 5px;cursor:pointer;color:var(--text);}
    .user:hover{background:var(--well);}
    .av{display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:rgba(200,138,18,.18);color:var(--ochre);font:700 11px/1 'Urbanist',sans-serif;}
    .user__text{display:grid;text-align:left;line-height:1.2;}
    .user__text small{font-size:10px;color:var(--muted);}
    .user__text span{font-size:12px;font-weight:600;max-width:150px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .user__chev{font-size:16px;color:var(--muted);}
    .menu__backdrop{position:fixed;inset:0;z-index:40;border:0;background:transparent;cursor:default;}
    .menu__panel{position:absolute;right:0;top:calc(100% + 10px);min-width:240px;padding:6px;background:var(--card);border:1px solid var(--line-2);border-radius:16px;box-shadow:var(--shadow);z-index:50;animation:menupop .14s ease;}
    @keyframes menupop{from{opacity:0;transform:translateY(-4px);}}
    .menu__profile{display:flex;align-items:center;gap:10px;padding:10px;border-bottom:1px solid var(--line);margin-bottom:4px;}
    .menu__profile strong{font-size:13px;}
    .menu__mail{font-size:11px;color:var(--muted);}
    .menu__item{display:block;width:100%;padding:9px 10px;border:0;border-radius:10px;background:none;text-align:left;font:500 13px/1.2 'Urbanist',sans-serif;color:var(--text);cursor:pointer;}
    .menu__item:hover{background:var(--well);}

    /* ---- Vessa island rail (desktop only) ---- */
    .ws-side{display:none;}
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

    /* ---- mobile bottom tab bar (unchanged design) ---- */
    .ws-nav{position:fixed;left:0;right:0;bottom:0;max-width:390px;margin:0 auto;z-index:30;display:flex;align-items:center;justify-content:space-around;gap:2px;padding:8px 8px calc(8px + env(safe-area-inset-bottom,0px));background:rgba(255,253,249,.96);backdrop-filter:blur(10px);border-top:1px solid var(--line);}
    .ws-nav a{display:flex;flex-direction:column;align-items:center;gap:2px;text-decoration:none;color:var(--muted);padding:4px 6px;border-radius:10px;min-width:0;}
    .ws-nav a .material-symbols-outlined{font-size:22px;}
    .ws-nav a span:last-child{font:500 10px/1.1 Urbanist,sans-serif;white-space:nowrap;}
    .ws-nav a.active{color:var(--ochre);}
    .ws-nav a.active span:last-child{font-weight:700;}

    @media (min-width:768px){
      .ws-shell{display:grid;grid-template-columns:auto minmax(0,1fr);gap:16px;padding:10px 12px 12px;}
      .ws-right{display:flex;flex-direction:column;gap:16px;min-width:0;}

      .ws-top{display:flex;align-items:center;justify-content:space-between;gap:10px;position:sticky;top:10px;z-index:30;min-height:64px;padding:6px 10px;background:var(--card);border-radius:30px;box-shadow:var(--shadow);}
      .ws-top .brand .vessa-logo{width:clamp(140px,13vw,172px);max-height:48px;}

      .ws-side{display:flex;flex-direction:column;gap:16px;position:sticky;top:10px;height:calc(100dvh - 20px);width:248px;overflow-y:auto;scrollbar-width:none;}
      .ws-side::-webkit-scrollbar{display:none;}

      .ws-main{min-width:0;}
      .ws-nav{display:none;}

      .sd-collapsed .ws-side{width:88px;}
      .sd-collapsed .railbox{width:72px;margin:0 auto;}
      .sd-collapsed .railbox--row{flex-direction:column;}
      .sd-collapsed .ri{width:60px;height:60px;min-height:60px;border-radius:50%;padding:0;justify-content:center;margin:0 auto;}
      .sd-collapsed .ri__label{display:none;}
      .sd-collapsed .ri[data-tip]:hover::after,.sd-collapsed .ri[data-tip]:focus-visible::after{
        content:attr(data-tip);position:absolute;left:calc(100% + 10px);top:50%;transform:translateY(-50%);
        background:var(--dark);color:var(--darkink);font:600 13px/1 'Urbanist',sans-serif;padding:8px 12px;border-radius:12px;white-space:nowrap;z-index:60;pointer-events:none;
      }
    }
    @media print{
      .ws-top,.ws-side,.ws-nav{display:none !important;}
    }
    @media (prefers-reduced-motion: reduce){
      .ws-shell *{transition:none !important;animation:none !important;}
    }
  `],
})
export class WsShell {
  readonly cart = inject(CartService);
  readonly theme = inject(ThemeService);
  readonly state = inject(ShellStateService);
  private readonly api = inject(ApiService);
  private readonly toast = inject(SeToastService);
  private readonly confirm = inject(SeConfirmService);
  private readonly router = inject(Router);

  readonly navItems = [
    { label: 'Home', icon: 'dashboard', link: '/', exact: true },
    { label: 'Catalogue', icon: 'inventory_2', link: '/catalogue', exact: false },
    { label: 'Orders', icon: 'receipt_long', link: '/orders', exact: false },
    { label: 'Custom', icon: 'design_services', link: '/custom', exact: false },
  ];

  readonly me = signal<string | null>(null);

  readonly initials = computed(() => {
    const parts = (this.me() ?? 'Wholesale buyer').trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] ?? 'W') + (parts[1]?.[0] ?? '')).toUpperCase();
  });

  readonly greeting = computed(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  });

  readonly accountOpen = signal(false);

  constructor() {
    this.api.me().subscribe({ next: (m) => this.me.set(m.name), error: () => this.me.set(null) });
  }

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
      consequence: 'This session ends. You will need to sign in again to place or track orders.',
      confirmLabel: 'Sign out',
      cancelLabel: 'Stay',
    });
    if (!ok) return;
    this.api.logout();
    this.toast.show('Signed out of the wholesale portal');
  }
}
