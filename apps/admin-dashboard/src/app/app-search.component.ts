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
import { ApiService } from './api.service';

interface GsItem {
  title: string;
  sub?: string;
  route: string;
  icon: string;
  deep?: boolean;
}

interface GsGroup {
  label: string;
  items: GsItem[];
}

type GsRow = { kind: 'label'; label: string; idx: number } | { kind: 'item'; item: GsItem; idx: number };

interface PageRef {
  title: string;
  route: string;
  icon: string;
  keywords: string;
}

const PAGES: PageRef[] = [
  { title: 'Dashboard', route: '/', icon: 'dashboard', keywords: 'home overview kpis at a glance' },
  { title: 'Approvals', route: '/approvals', icon: 'fact_check', keywords: 'approve pending request queue decide management' },
  { title: 'Orders', route: '/orders', icon: 'shopping_bag', keywords: 'sales fulfilment dispatch shipping order status' },
  { title: 'Returns', route: '/returns', icon: 'assignment_return', keywords: 'refund sla quarantine inspection return window' },
  { title: 'Custom orders', route: '/custom-orders', icon: 'checkroom', keywords: 'custom bespoke quote quotation design request progress' },
  { title: 'Wholesale', route: '/wholesale', icon: 'warehouse', keywords: 'tier discount business account apply moq buy' },
  { title: 'Messages', route: '/messages', icon: 'forum', keywords: 'customer chat support sms conversation' },
  { title: 'Catalogue', route: '/catalogue', icon: 'grid_view', keywords: 'product sku collection price edit' },
  { title: 'Inventory', route: '/inventory', icon: 'inventory_2', keywords: 'stock valuation movement ledger units' },
  { title: 'Materials', route: '/materials', icon: 'layers', keywords: 'raw material fabric thread threshold purchase usage' },
  { title: 'Production', route: '/production', icon: 'precision_manufacturing', keywords: 'kanban batch sewing cutting stage plan schedule' },
  { title: 'Tech pack', route: '/tech-pack', icon: 'description', keywords: 'pattern silhouette spec measurements sizing garment' },
  { title: 'Floor kiosk', route: '/floor-kiosk', icon: 'tv', keywords: 'factory station scanning qc cutting sewing' },
  { title: 'Accounting', route: '/accounting', icon: 'account_balance', keywords: 'money ledger naira income expense profit report' },
  { title: 'Logistics', route: '/logistics', icon: 'local_shipping', keywords: 'delivery waybill shipment gigl haulage zones' },
  { title: 'Procurement', route: '/vendors', icon: 'request_quote', keywords: 'vendor supplier mill request order inventory restock' },
  { title: 'Marketing', route: '/marketing', icon: 'campaign', keywords: 'campaign promo sms source code offer' },
  { title: 'Reviews', route: '/reviews', icon: 'reviews', keywords: 'review moderation publish rating stars' },
  { title: 'Partners', route: '/partners', icon: 'handshake', keywords: 'investor distribution dividend equity shares' },
  { title: 'Staff', route: '/staff', icon: 'badge', keywords: 'user employee team role access two factor' },
  { title: 'Audit log', route: '/audit', icon: 'receipt_long', keywords: 'log history trail activity changes' },
  { title: 'Security', route: '/security', icon: 'security', keywords: '2fa two factor setup verification authenticator' },
];

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="gs">
      <form class="gs-form" (submit)="openFocused($event)">
        <span class="gs-ico" aria-hidden="true">search</span>
        <input
          #box
          type="search"
          role="combobox"
          aria-label="Search pages and records"
          aria-expanded="{{ open() }}"
          aria-autocomplete="list"
          [attr.aria-controls]="'gs-panel'"
          autocomplete="off"
          spellcheck="false"
          placeholder="Search pages and records"
          [value]="query()"
          (input)="onInput(box.value)"
          (keydown.arrowdown)="move(1)"
          (keydown.arrowup)="move(-1)"
          (keydown.escape)="close()"
        />
        <kbd class="gs-kbd">/</kbd>
      </form>

      @if (open() && query()) {
        <div id="gs-panel" class="gs-panel" role="listbox" aria-label="Search results">
          @if (busy()) {
            <div class="gs-empty">Searching…</div>
          } @else if (rows().length) {
            @for (row of rows(); track $index) {
              @if (row.kind === 'label') {
                <span class="gs-group" role="presentation">{{ row.label }}</span>
              } @else {
                <a
                  class="gs-item"
                  [class.focused]="focus() === row.idx"
                  [routerLink]="row.item.route"
                  role="option"
                  [attr.aria-selected]="focus() === row.idx"
                  (mouseenter)="focus.set(row.idx)"
                  (click)="go(row.item)"
                >
                  <span class="gs-item-ico" aria-hidden="true">{{ row.item.icon }}</span>
                  <span class="gs-item-main">
                    <strong>{{ row.item.title }}</strong>
                    @if (row.item.sub) {
                      <small>{{ row.item.sub }}</small>
                    }
                  </span>
                  <span class="gs-enter" aria-hidden="true">↵</span>
                </a>
              }
            }
            <div class="gs-foot">
              <kbd>↵</kbd> open result
              <span class="gs-dot" aria-hidden="true">·</span>
              <kbd>↑</kbd><kbd>↓</kbd> navigate
              <span class="gs-dot" aria-hidden="true">·</span>
              <kbd>esc</kbd> close
            </div>
          } @else {
            <div class="gs-empty">No matching pages or records.</div>
          }
        </div>
      }
    </div>
  `,
})
export class AppSearchComponent {
  private readonly api = inject(ApiService);
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
        .querySelector('.gs-item.focused')
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
    const nav: GsItem[] = PAGES.filter(
      (p) => p.title.toLowerCase().includes(ql) || p.keywords.includes(ql),
    ).map((p) => ({ title: p.title, route: p.route, icon: p.icon }));

    const groups: GsGroup[] = [];
    if (nav.length) groups.push({ label: 'Pages', items: nav });

    if (ql.length >= 2) {
      const lookups = [
        this.orders(ql),
        this.products(ql),
        this.materials(ql),
        this.wholesale(ql),
        this.custom(ql),
        this.staff(ql),
        this.returns(ql),
      ];
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
        title: `#${o.id.slice(0, 8).toUpperCase()} · ${o.status}`,
        sub: o.customer ? o.customer.name : `${o.channel} order`,
        route: '/orders',
        icon: 'shopping_bag',
        deep: true,
      }));
    return items.length ? { label: 'Orders', items } : null;
  }

  private async products(ql: string): Promise<GsGroup | null> {
    const { data } = await firstValueFrom(this.api.products());
    const items = data
      .map((p) => ({
        name: String(p['name'] ?? ''),
        category: String(p['category'] ?? ''),
        skus: (p['variants'] as Array<Record<string, unknown>> | undefined)
          ?.map((v) => String(v['sku'] ?? '')) ?? [],
      }))
      .filter(
        ({ name, skus }) => name.toLowerCase().includes(ql) || skus.some((s) => s.toLowerCase().includes(ql)),
      )
      .slice(0, 6)
      .map(({ name, category, skus }) => ({
        title: name,
        sub: `${category}${skus[0] ? ` · ${skus[0]}` : ''}`,
        route: '/catalogue',
        icon: 'grid_view',
        deep: true,
      }));
    return items.length ? { label: 'Products', items } : null;
  }

  private async materials(ql: string): Promise<GsGroup | null> {
    const data = await firstValueFrom(this.api.materials());
    const items = data
      .filter(
        (m) =>
          String(m['name'] ?? '').toLowerCase().includes(ql) ||
          String(m['unit'] ?? '').toLowerCase().includes(ql),
      )
      .slice(0, 6)
      .map((m) => ({
        title: String(m['name'] ?? 'Material'),
        sub: String(m['unit'] ?? ''),
        route: '/materials',
        icon: 'layers',
        deep: true,
      }));
    return items.length ? { label: 'Materials', items } : null;
  }

  private async wholesale(ql: string): Promise<GsGroup | null> {
    const data = await firstValueFrom(this.api.wholesaleAccounts());
    const items = data
      .map((a) => ({
        id: String(a['id'] ?? ''),
        name: String(a['businessName'] ?? (a['user'] as Record<string, unknown> | undefined)?.['name'] ?? a['name'] ?? 'Account'),
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
        icon: 'warehouse',
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
        icon: 'checkroom',
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
        icon: 'badge',
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
        icon: 'assignment_return',
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
    const item = this.groups()
      .flatMap((g) => g.items)
      [this.focus()];
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