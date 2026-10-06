import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Directive,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { SeIconComponent, SeIconName } from '../icon/icon.component';

export interface SeNavItem {
  label: string;
  icon: SeIconName;
  /** A router link, e.g. `/orders`. */
  link: string;
  /** A small count shown on the item, e.g. approvals waiting. */
  badge?: number | string;
  /** Only active on an exact URL match. Set it on the home item (`/`). */
  exact?: boolean;
}

export interface SeNavGroup {
  title?: string;
  items: SeNavItem[];
}

export interface SeShellUser {
  name: string;
  role?: string;
}

/** The viewport width at which the sidebar stops being an off-canvas drawer. */
const WIDE_QUERY = '(min-width: 64rem)';

let nextId = 0;

/**
 * An extra item in the shell's user menu, above "Sign out". Put it on a native
 * `<button type="button">` or `<a>`:
 *
 *     <a seShellMenu routerLink="/settings">Settings</a>
 */
@Directive({
  selector: 'button[seShellMenu], a[seShellMenu]',
  host: { class: 'se-shell__menu-item se-focusable', role: 'menuitem', tabindex: '-1' },
})
export class SeShellMenuItemDirective {}

/**
 * The frame every internal app sits in: sidebar navigation, a sticky top bar
 * with search and the user menu, and the page.
 *
 *     <se-shell appName="Seentair admin" [nav]="nav" [user]="user()" [(collapsed)]="collapsed" (signOut)="logout()">
 *       <se-search seShellSearch label="Search everything" />
 *       <button seShellActions seButton variant="ghost" iconOnly aria-label="Notifications">…</button>
 *       <a seShellMenu routerLink="/settings">Settings</a>
 *       <router-outlet />
 *     </se-shell>
 *
 * The shell fills its container (`height: 100%`), so the app gives it the
 * viewport. Below 64rem the sidebar becomes a drawer opened from the top bar.
 */
@Component({
  selector: 'se-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, SeIconComponent],
  host: {
    class: 'se-shell',
    '[class.se-shell--collapsed]': 'collapsed()',
    '[class.se-shell--drawer-open]': 'drawerOpen()',
    '(keydown.escape)': 'onEscape()',
    '(document:click)': 'onDocumentClick($event)',
  },
  template: `
    <a class="se-shell__skip se-focusable" href="#se-main" (click)="skipToContent($event)">
      Skip to content
    </a>
    <div class="se-shell__scrim" aria-hidden="true" (click)="closeDrawer()"></div>

    <aside
      #sidebar
      class="se-shell__sidebar"
      [id]="uid + '-sidebar'"
      [attr.inert]="drawerHidden() ? '' : null"
    >
      <div class="se-shell__brand">
        <span class="se-shell__brand-mark" aria-hidden="true">{{ appName().charAt(0) }}</span>
        <span class="se-shell__brand-name">{{ appName() }}</span>
      </div>
      <nav class="se-shell__nav" aria-label="Main">
        @for (group of nav(); track $index; let g = $index) {
          <div class="se-shell__group">
            @if (group.title) {
              <h2 class="se-shell__group-title" [id]="uid + '-group-' + g">{{ group.title }}</h2>
            }
            <ul
              class="se-shell__list"
              [attr.aria-labelledby]="group.title ? uid + '-group-' + g : null"
            >
              @for (item of group.items; track item.link) {
                <li class="se-shell__item">
                  <a
                    class="se-shell__link se-focusable"
                    [routerLink]="item.link"
                    routerLinkActive="se-shell__link--active"
                    ariaCurrentWhenActive="page"
                    [routerLinkActiveOptions]="{ exact: !!item.exact }"
                    [attr.title]="collapsed() ? item.label : null"
                    (click)="closeDrawer()"
                  >
                    <se-icon [name]="item.icon" />
                    <span class="se-shell__link-label">{{ item.label }}</span>
                    @if (item.badge !== undefined && item.badge !== '') {
                      <span class="se-shell__badge">{{ item.badge }}</span>
                    }
                  </a>
                </li>
              }
            </ul>
          </div>
        }
      </nav>
      <button
        class="se-shell__collapse se-focusable"
        type="button"
        aria-label="Toggle sidebar"
        [attr.aria-expanded]="!collapsed()"
        [attr.aria-controls]="uid + '-sidebar'"
        [attr.title]="collapsed() ? 'Expand sidebar' : 'Collapse sidebar'"
        (click)="collapsed.set(!collapsed())"
      >
        <se-icon name="panel-left" />
        <span class="se-shell__link-label">Collapse</span>
      </button>
    </aside>

    <div class="se-shell__body">
      <header class="se-shell__topbar">
        <button
          #menuButton
          class="se-shell__menu-button se-focusable"
          type="button"
          aria-label="Open navigation"
          [attr.aria-expanded]="drawerOpen()"
          [attr.aria-controls]="uid + '-sidebar'"
          (click)="openDrawer()"
        >
          <se-icon name="menu" />
        </button>
        <div class="se-shell__search"><ng-content select="[seShellSearch]" /></div>
        <div class="se-shell__actions"><ng-content select="[seShellActions]" /></div>
        @if (user(); as u) {
          <div #userArea class="se-shell__user">
            <button
              #userButton
              class="se-shell__user-button se-focusable"
              type="button"
              aria-haspopup="menu"
              [id]="uid + '-user'"
              [attr.aria-expanded]="menuOpen()"
              [attr.aria-controls]="uid + '-menu'"
              (click)="menuOpen() ? closeMenu(false) : openMenu('first')"
              (keydown.arrowdown)="$event.preventDefault(); openMenu('first')"
              (keydown.arrowup)="$event.preventDefault(); openMenu('last')"
            >
              <span class="se-shell__avatar" aria-hidden="true">{{ initials() }}</span>
              <span class="se-shell__user-text">
                <span class="se-shell__user-name">{{ u.name }}</span>
                @if (u.role) {
                  <span class="se-shell__user-role">{{ u.role }}</span>
                }
              </span>
              <se-icon name="chevron-down" />
            </button>
            <div
              #menu
              class="se-shell__menu"
              role="menu"
              [id]="uid + '-menu'"
              [attr.aria-labelledby]="uid + '-user'"
              [hidden]="!menuOpen()"
              (keydown)="onMenuKeydown($event)"
              (click)="onMenuClick($event)"
            >
              <ng-content select="[seShellMenu]" />
              <button
                class="se-shell__menu-item se-focusable"
                type="button"
                role="menuitem"
                tabindex="-1"
                (click)="signOut.emit()"
              >
                <se-icon name="logout" />
                Sign out
              </button>
            </div>
          </div>
        }
      </header>
      <main #main id="se-main" class="se-shell__main" tabindex="-1"><ng-content /></main>
    </div>
  `,
})
export class SeShellComponent {
  private readonly injector = inject(Injector);

  readonly appName = input.required<string>();
  readonly nav = input.required<SeNavGroup[]>();
  readonly user = input<SeShellUser | null>(null);
  /** Desktop only: the sidebar shows icons without labels. */
  readonly collapsed = model(false);
  readonly signOut = output<void>();

  protected readonly uid = `se-shell-${nextId++}`;
  /** Below 64rem the sidebar is a drawer; this is whether that drawer is open. */
  protected readonly drawerOpen = signal(false);
  protected readonly menuOpen = signal(false);
  private readonly wide = signal(true);
  /** Off-canvas and closed: out of the tab order and the accessibility tree. */
  protected readonly drawerHidden = computed(() => !this.wide() && !this.drawerOpen());

  protected readonly initials = computed(() => {
    const words = (this.user()?.name ?? '').trim().split(/\s+/).filter(Boolean);
    const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words;
    return letters.map((w) => w.charAt(0).toUpperCase()).join('');
  });

  private readonly sidebar = viewChild.required<ElementRef<HTMLElement>>('sidebar');
  private readonly main = viewChild.required<ElementRef<HTMLElement>>('main');
  private readonly menuButton = viewChild.required<ElementRef<HTMLElement>>('menuButton');
  private readonly userArea = viewChild<ElementRef<HTMLElement>>('userArea');
  private readonly userButton = viewChild<ElementRef<HTMLElement>>('userButton');
  private readonly menu = viewChild<ElementRef<HTMLElement>>('menu');

  constructor() {
    const query = window.matchMedia(WIDE_QUERY);
    const sync = (): void => {
      this.wide.set(query.matches);
      if (query.matches) this.drawerOpen.set(false);
    };
    sync();
    query.addEventListener('change', sync);
    inject(DestroyRef).onDestroy(() => query.removeEventListener('change', sync));
  }

  protected skipToContent(event: Event): void {
    // Focus moves without touching the URL, which belongs to the router.
    event.preventDefault();
    this.main().nativeElement.focus();
  }

  protected openDrawer(): void {
    this.drawerOpen.set(true);
    // The sidebar is inert until the next render, so focus has to wait for it.
    this.afterRender(() =>
      this.sidebar().nativeElement.querySelector<HTMLElement>('a, button')?.focus(),
    );
  }

  protected closeDrawer(): void {
    if (!this.drawerOpen()) return;
    this.drawerOpen.set(false);
    this.menuButton().nativeElement.focus();
  }

  protected openMenu(focus: 'first' | 'last'): void {
    this.menuOpen.set(true);
    this.afterRender(() => {
      const items = this.menuItems();
      (focus === 'first' ? items[0] : items[items.length - 1])?.focus();
    });
  }

  protected closeMenu(returnFocus: boolean): void {
    if (!this.menuOpen()) return;
    this.menuOpen.set(false);
    if (returnFocus) this.userButton()?.nativeElement.focus();
  }

  protected onEscape(): void {
    if (this.menuOpen()) this.closeMenu(true);
    else this.closeDrawer();
  }

  protected onMenuKeydown(event: KeyboardEvent): void {
    const items = this.menuItems();
    const at = items.indexOf(document.activeElement as HTMLElement);
    let next: number;
    switch (event.key) {
      case 'ArrowDown':
        next = (at + 1) % items.length;
        break;
      case 'ArrowUp':
        next = (at - 1 + items.length) % items.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = items.length - 1;
        break;
      case 'Tab':
        // Focus is leaving; the menu must not stay open behind it.
        this.closeMenu(false);
        return;
      default:
        return;
    }
    event.preventDefault();
    items[next]?.focus();
  }

  protected onMenuClick(event: Event): void {
    // Choosing any item, projected or ours, closes the menu.
    if ((event.target as HTMLElement).closest('[role="menuitem"]')) this.closeMenu(true);
  }

  protected onDocumentClick(event: Event): void {
    const area = this.userArea()?.nativeElement;
    if (this.menuOpen() && area && !area.contains(event.target as Node)) this.closeMenu(false);
  }

  private menuItems(): HTMLElement[] {
    const menu = this.menu()?.nativeElement;
    if (!menu) return [];
    return Array.from(
      menu.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not([disabled]):not([aria-disabled="true"])',
      ),
    );
  }

  private afterRender(fn: () => void): void {
    afterNextRender(fn, { injector: this.injector });
  }
}
