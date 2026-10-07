import {
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SeIconComponent, SeIconName } from '@seentair/ui';
import { AccessService } from './access.service';
import { ApiService } from './api.service';
import { navFor } from './nav';

interface GsItem {
  title: string;
  sub?: string;
  route: string;
  icon: SeIconName;
  deep?: boolean;
}

interface GsGroup {
  label: string;
  items: GsItem[];
}

type GsRow =
  { kind: 'label'; label: string; idx: number } | { kind: 'item'; item: GsItem; idx: number };

/**
 * Extra words that should find a screen, by route. The screens themselves come
 * from the role's navigation (nav.ts), so search can only ever find a screen
 * this person can open.
 */
const KEYWORDS: Record<string, string> = {
  '/': 'home overview kpis at a glance',
  '/approvals': 'approve pending request queue decide management',
  '/orders': 'sales fulfilment dispatch shipping order status',
  '/returns': 'refund sla quarantine inspection return window',
  '/custom-orders': 'custom bespoke quote quotation design request progress',
  '/wholesale': 'tier discount business account apply moq buy',
  '/messages': 'customer chat support sms conversation',
  '/catalogue': 'product sku collection price edit',
  '/inventory': 'stock valuation movement ledger units',
  '/materials': 'raw material fabric thread threshold purchase usage',
  '/production': 'kanban batch sewing cutting stage plan schedule',
  '/tech-pack': 'pattern silhouette spec measurements sizing garment',
  '/floor-kiosk': 'factory station scanning qc cutting sewing',
  '/accounting': 'money ledger naira income expense profit report',
  '/logistics': 'delivery waybill shipment gigl haulage zones',
  '/vendors': 'vendor supplier mill request order inventory restock',
  '/marketing': 'campaign promo sms source code offer',
  '/reviews': 'review moderation publish rating stars',
  '/partners': 'investor distribution dividend equity shares',
  '/staff': 'user employee team role access two factor',
  '/audit': 'log history trail activity changes',
  '/security': '2fa two factor setup verification authenticator',
};

@Component({
  selector: 'app-search',
  imports: [RouterLink, SeIconComponent],
  styles: [
    `
      .gs {
        position: relative;
        width: 100%;
        max-width: var(--se-size-drawer);
      }
      .gs__panel {
        top: calc(100% + var(--se-space-2));
        left: 0;
        width: 100%;
      }
      /* The "/" shortcut hint inside the field. */
      .gs__key {
        position: absolute;
        right: var(--se-space-3);
        padding: 0 var(--se-space-2);
        border: var(--se-border-width) solid var(--se-color-border);
        border-radius: var(--se-radius-sm);
        color: var(--se-color-text-muted);
        font: var(--se-type-caption);
        pointer-events: none;
      }
    `,
  ],
  template: `
    <div class="gs">
      <form class="se-search" role="search" (submit)="openFocused($event)">
        <se-icon name="search" />
        <input
          #box
          class="se-input"
          type="search"
          role="combobox"
          aria-label="Search screens and records"
          [attr.aria-expanded]="open()"
          aria-autocomplete="list"
          aria-controls="gs-panel"
          autocomplete="off"
          spellcheck="false"
          placeholder="Search screens and records"
          [value]="query()"
          (input)="onInput(box.value)"
          (keydown.arrowdown)="$event.preventDefault(); move(1)"
          (keydown.arrowup)="$event.preventDefault(); move(-1)"
          (keydown.escape)="close()"
        />
        @if (!query()) {
          <kbd class="gs__key" aria-hidden="true">/</kbd>
        }
      </form>

      @if (open() && query()) {
        <div id="gs-panel" class="se-popover gs__panel" role="listbox" aria-label="Search results">
          @if (busy()) {
            <p class="se-popover__note">Searching</p>
          } @else if (rows().length) {
            @for (row of rows(); track $index) {
              @if (row.kind === 'label') {
                <p class="se-popover__heading" role="presentation">{{ row.label }}</p>
              } @else {
                <a
                  class="se-popover__item"
                  [class.se-popover__item--active]="focus() === row.idx"
                  [routerLink]="row.item.route"
                  role="option"
                  [attr.aria-selected]="focus() === row.idx"
                  (mouseenter)="focus.set(row.idx)"
                  (click)="go(row.item)"
                >
                  <se-icon [name]="row.item.icon" />
                  <span class="se-popover__main">
                    <span class="se-popover__title">{{ row.item.title }}</span>
                    @if (row.item.sub) {
                      <span class="se-popover__text">{{ row.item.sub }}</span>
                    }
                  </span>
                </a>
              }
            }
            <p class="se-popover__note">Enter opens the result. Up and down move. Escape closes.</p>
          } @else {
            <p class="se-popover__note">No screens or records match.</p>
          }
        </div>
      }
    </div>
  `,
})
export class AppSearchComponent {
  private readonly api = inject(ApiService);
  private readonly access = inject(AccessService);
  private readonly router = inject(Router);
  private readonly el = inject(ElementRef);
  private readonly box = viewChild<HTMLInputElement>('box');
  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly query = signal('');
  readonly open = signal(false);
  readonly busy = signal(false);
  readonly focus = signal(0);
  readonly groups = signal<GsGroup[]>([]);

  readonly rows = computed<GsRow[]>(() => {
    const out: GsRow[] = [];
    let idx = 0;
    for (const g of this.groups()) {
      out.push({ kind: 'label', label: g.label, idx });
      for (const item of g.items) {
        out.push({ kind: 'item', item, idx });
        idx += 1;
      }
    }
    return out;
  });

  constructor() {
    effect(() => {
      this.focus();
      this.el.nativeElement
        .querySelector('.se-popover__item--active')
        ?.scrollIntoView({ block: 'nearest' });
    });
  }

  @HostListener('window:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (this.open()) this.close();
      return;
    }
    if (e.key === '/' && !this.isTyping(e)) {
      e.preventDefault();
      this.box()?.focus();
    }
  }

  private isTyping(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  onInput(value: string): void {
    this.query.set(value);
    this.open.set(true);
    const q = value.trim();
    if (this.timer) clearTimeout(this.timer);
    if (q.length === 0) {
      this.groups.set([]);
      this.busy.set(false);
      return;
    }
    this.timer = setTimeout(() => void this.run(q), 200);
  }

  private async run(q: string): Promise<void> {
    this.busy.set(true);
    const ql = q.toLowerCase();
    // Screens: only the ones in this role's navigation.
    const nav: GsItem[] = navFor(this.access.access())
      .flatMap((group) => group.items)
      .filter(
        (page) => page.label.toLowerCase().includes(ql) || (KEYWORDS[page.link] ?? '').includes(ql),
      )
      .map((page) => ({ title: page.label, route: page.link, icon: page.icon }));

    const groups: GsGroup[] = [];
    if (nav.length) groups.push({ label: 'Screens', items: nav });

    if (ql.length >= 2) {
      // Records: each kind is searched only if the role can open it, so the
      // API is never asked for something it would refuse.
      const can = (...modules: string[]): boolean => this.access.canAny(modules);
      const lookups = [
        can('retail_orders', 'wholesale_orders') ? this.orders(ql) : null,
        can('catalogue') ? this.products(ql) : null,
        can('raw_materials') ? this.materials(ql) : null,
        can('wholesale_orders') ? this.wholesale(ql) : null,
        can('custom_orders') ? this.custom(ql) : null,
        can('staff_access') ? this.staff(ql) : null,
        can('returns') ? this.returns(ql) : null,
      ].filter((lookup): lookup is Promise<GsGroup | null> => lookup !== null);
      const settled = await Promise.allSettled(lookups);
      for (const s of settled) {
        if (s.status === 'fulfilled' && s.value && s.value.items.length) groups.push(s.value);
      }
    }

    this.groups.set(groups);
    this.focus.set(0);
    this.busy.set(false);
  }

  private async orders(ql: string): Promise<GsGroup | null> {
    const { data } = await firstValueFrom(this.api.orders());
    const items = data
      .filter(
        (o) =>
          o.id.toLowerCase().includes(ql) ||
          (o.customer !== null && o.customer.name.toLowerCase().includes(ql)) ||
          o.status.toLowerCase().includes(ql),
      )
      .slice(0, 6)
      .map((o) => ({
        title: `Order #${o.id.slice(0, 8).toUpperCase()}`,
        sub: `${o.customer ? o.customer.name : 'Walk-in customer'}, ${o.status.replace(/_/g, ' ')}`,
        // Straight to the order's own page.
        route: `/orders/${o.id}`,
        icon: 'cart' as const,
      }));
    return items.length ? { label: 'Orders', items } : null;
  }

  private async products(ql: string): Promise<GsGroup | null> {
    const { data } = await firstValueFrom(this.api.products());
    const items = data
      .map((p) => ({
        name: String(p['name'] ?? ''),
        category: String(p['category'] ?? ''),
        skus:
          (p['variants'] as Array<Record<string, unknown>> | undefined)?.map((v) =>
            String(v['sku'] ?? ''),
          ) ?? [],
      }))
      .filter(
        ({ name, skus }) =>
          name.toLowerCase().includes(ql) || skus.some((s) => s.toLowerCase().includes(ql)),
      )
      .slice(0, 6)
      .map(({ name, category, skus }) => ({
        title: name,
        sub: `${category}${skus[0] ? ` · ${skus[0]}` : ''}`,
        route: '/catalogue',
        icon: 'tag' as const,
        deep: true,
      }));
    return items.length ? { label: 'Products', items } : null;
  }

  private async materials(ql: string): Promise<GsGroup | null> {
    const data = await firstValueFrom(this.api.materials());
    const items = data
      .filter(
        (m) =>
          String(m['name'] ?? '')
            .toLowerCase()
            .includes(ql) ||
          String(m['unit'] ?? '')
            .toLowerCase()
            .includes(ql),
      )
      .slice(0, 6)
      .map((m) => ({
        title: String(m['name'] ?? 'Material'),
        sub: String(m['unit'] ?? ''),
        route: '/materials',
        icon: 'layers' as const,
        deep: true,
      }));
    return items.length ? { label: 'Materials', items } : null;
  }

  private async wholesale(ql: string): Promise<GsGroup | null> {
    const data = await firstValueFrom(this.api.wholesaleAccounts());
    const items = data
      .map((a) => ({
        id: String(a['id'] ?? ''),
        name: String(
          a['businessName'] ??
            (a['user'] as Record<string, unknown> | undefined)?.['name'] ??
            a['name'] ??
            'Account',
        ),
        email: String((a['user'] as Record<string, unknown> | undefined)?.['email'] ?? ''),
        status: String(a['status'] ?? ''),
      }))
      .filter(
        (a) =>
          a.id.toLowerCase().includes(ql) ||
          a.name.toLowerCase().includes(ql) ||
          a.email.toLowerCase().includes(ql) ||
          a.status.toLowerCase().includes(ql),
      )
      .slice(0, 6)
      .map((a) => ({
        title: a.name,
        sub: `${a.email} · ${a.status}`,
        route: '/wholesale',
        icon: 'users' as const,
        deep: true,
      }));
    return items.length ? { label: 'Wholesale accounts', items } : null;
  }

  private async custom(ql: string): Promise<GsGroup | null> {
    const { data } = await firstValueFrom(this.api.customOrders());
    const items = data
      .map((c) => ({
        id: String(c['id'] ?? ''),
        customer: String(c['customerName'] ?? ''),
        product: String(c['productName'] ?? ''),
        status: String(c['status'] ?? ''),
      }))
      .filter(
        (c) =>
          c.id.toLowerCase().includes(ql) ||
          c.customer.toLowerCase().includes(ql) ||
          c.product.toLowerCase().includes(ql) ||
          c.status.toLowerCase().includes(ql),
      )
      .slice(0, 6)
      .map((c) => ({
        title: `#${c.id.slice(0, 8).toUpperCase()}`,
        sub: `${c.customer}${c.product ? ` · ${c.product}` : ''} · ${c.status}`,
        route: '/custom-orders',
        icon: 'edit' as const,
        deep: true,
      }));
    return items.length ? { label: 'Custom orders', items } : null;
  }

  private async staff(ql: string): Promise<GsGroup | null> {
    const { data } = await firstValueFrom(this.api.users());
    const items = data
      .map((u) => ({
        name: String(u['name'] ?? ''),
        email: String(u['email'] ?? ''),
        role: String(u['role'] ?? ''),
      }))
      .filter(
        (u) =>
          u.name.toLowerCase().includes(ql) ||
          u.email.toLowerCase().includes(ql) ||
          u.role.toLowerCase().includes(ql),
      )
      .slice(0, 6)
      .map((u) => ({
        title: u.name,
        sub: `${u.role}${u.email ? ` · ${u.email}` : ''}`,
        route: '/staff',
        icon: 'user' as const,
        deep: true,
      }));
    return items.length ? { label: 'Staff', items } : null;
  }

  private async returns(ql: string): Promise<GsGroup | null> {
    const { data } = await firstValueFrom(this.api.returns());
    const items = data
      .filter(
        (r) =>
          r.id.toLowerCase().includes(ql) ||
          r.variant.sku.toLowerCase().includes(ql) ||
          r.status.toLowerCase().includes(ql) ||
          r.reason.toLowerCase().includes(ql),
      )
      .slice(0, 6)
      .map((r) => ({
        title: `Return ${r.id.slice(0, 8).toUpperCase()}`,
        sub: `${r.variant.sku} · ${r.status}`,
        route: '/returns',
        icon: 'undo' as const,
        deep: true,
      }));
    return items.length ? { label: 'Returns', items } : null;
  }

  move(delta: number): void {
    const total = this.groups().reduce((n, g) => n + g.items.length, 0);
    if (!total) return;
    this.focus.update((cur) => (cur + delta + total) % total);
  }

  openFocused(e: Event): void {
    e.preventDefault();
    const item = this.groups().flatMap((g) => g.items)[this.focus()];
    if (item) this.go(item);
  }

  go(item: GsItem): void {
    const q = this.query().trim();
    if (item.deep && q) {
      this.router.navigate([item.route], { queryParams: { q } });
    } else {
      this.router.navigateByUrl(item.route);
    }
    this.close();
    this.query.set('');
  }

  close(): void {
    this.open.set(false);
    this.groups.set([]);
  }
}
