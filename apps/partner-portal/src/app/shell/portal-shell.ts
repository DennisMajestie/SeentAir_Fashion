import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import {
  SeBannerComponent,
  SeButtonDirective,
  SeConfirmService,
  SeIconComponent,
  SeNavGroup,
  SeShellComponent,
  SeSkeletonComponent,
  SeToastService,
} from '@seentair/ui';
import { ApiService } from '../api.service';
import { PortalStore } from '../portal.store';
import { ThemeService } from '../theme.service';

/**
 * Partner portal chrome: the shared shell with the confirmed dashboard flow
 * (appendix 17) as one flat list, a refresh control and the theme toggle.
 * Screens are held back until the dashboard payload has loaded, so every one
 * of them can read it from the store without its own loading state.
 *
 * Read-mostly; aggregates only, never customer data; no links into the
 * storefront or the wholesale portal (principle #6).
 */
@Component({
  selector: 'app-portal-shell',
  imports: [
    RouterOutlet,
    SeBannerComponent,
    SeButtonDirective,
    SeIconComponent,
    SeShellComponent,
    SeSkeletonComponent,
  ],
  template: `
    <se-shell
      appName="Seentair Partners"
      [nav]="nav"
      [user]="shellUser()"
      [(collapsed)]="collapsed"
      (signOut)="signOut()"
    >
      <button
        seButton
        variant="ghost"
        iconOnly
        seShellActions
        type="button"
        [attr.aria-label]="
          store.lastUpdatedLabel()
            ? 'Refresh portfolio data, last synced ' + store.lastUpdatedLabel()
            : 'Refresh portfolio data'
        "
        (click)="refresh()"
      >
        <se-icon name="refresh" />
      </button>
      <button
        seButton
        variant="ghost"
        iconOnly
        seShellActions
        type="button"
        [attr.aria-label]="
          theme.theme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
        "
        (click)="theme.toggle()"
      >
        <se-icon [name]="theme.theme() === 'dark' ? 'sun' : 'moon'" />
      </button>

      @if (store.loadError(); as err) {
        <se-banner
          tone="danger"
          title="Your portfolio could not be loaded"
          actionLabel="Try again"
          (action)="refresh()"
        >
          {{ err }}
        </se-banner>
      } @else if (!store.dash()) {
        <div aria-busy="true">
          <se-skeleton shape="metric" [columns]="4" />
          <se-skeleton shape="detail" [rows]="6" />
        </div>
      } @else {
        <router-outlet />
      }
    </se-shell>
  `,
})
export class PortalShell implements OnInit {
  readonly api = inject(ApiService);
  readonly store = inject(PortalStore);
  readonly theme = inject(ThemeService);
  private readonly confirm = inject(SeConfirmService);
  private readonly toast = inject(SeToastService);
  private readonly router = inject(Router);

  readonly collapsed = signal(false);

  /** The confirmed dashboard flow, in its order. */
  readonly nav: SeNavGroup[] = [
    {
      items: [
        { label: 'Overview', icon: 'home', link: '/overview' },
        { label: 'My investment', icon: 'bank', link: '/investment' },
        { label: 'Performance', icon: 'chart', link: '/performance' },
        { label: 'Inventory', icon: 'box', link: '/inventory' },
        { label: 'Accounts & reports', icon: 'file', link: '/reports' },
        { label: 'Profit sharing', icon: 'users', link: '/profit-sharing' },
        { label: 'Documents', icon: 'message', link: '/documents' },
        { label: 'Settings', icon: 'settings', link: '/settings' },
      ],
    },
  ];

  readonly shellUser = computed(() => {
    const equity = this.store.dash()?.investmentInformation.equityPercentage;
    return {
      name: this.store.me()?.name ?? 'Partner',
      role: equity !== undefined ? `${equity}% equity partner` : 'Equity partner',
    };
  });

  ngOnInit(): void {
    this.store.load();
  }

  refresh(): void {
    this.store.refresh();
  }

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
