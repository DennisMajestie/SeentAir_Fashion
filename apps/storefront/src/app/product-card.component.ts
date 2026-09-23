import { CommonModule } from '@angular/common';
import { Component, OnDestroy, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Product, ProductVariant } from './api.service';
import { CartService } from './cart.service';

/** Colour-name → swatch hex for the little dots on cards and quick-add. */
export const SWATCHES: Record<string, string> = {
  black: '#1a1a1a',
  bone: '#e8e2d5',
  charcoal: '#3a3a3a',
  clay: '#b46a4e',
  ecru: '#e6ddc9',
  sand: '#d8c6a3',
  olive: '#6b6b47',
  'grey melange': '#9a9a9a',
  indigo: '#3f4a6b',
  natural: '#ddd3c0',
  white: '#f2f0eb',
};

/**
 * The shop product card: thumbnail, availability badge, hover quick-add
 * (colour + size), colour dots, meta line, price and review stars. Shared
 * by the shop grid and the storefront home sections.
 */
@Component({
  selector: 'app-product-card',
  imports: [CommonModule, RouterLink],
  template: `
    <div class="card product-card" [class.soldout]="isSoldOut(product())">
      <a class="thumb" [routerLink]="['/product', product().id]">
        <img
          [src]="product().variants[0]?.imageUrl || 'assets/' + fallback(index())"
          [alt]="product().name"
          loading="lazy"
        />
        @if (badge(product()); as b) { <span class="badge" [class.badge-out]="b === 'Sold out'">{{ b }}</span> }
        @if (!isSoldOut(product())) {
          <button class="quickadd-btn" type="button"
            (click)="$event.preventDefault(); $event.stopPropagation(); toggleQuickAdd(product())">
            {{ quickAddId() === product().id ? 'Close' : '+ Quick add' }}
          </button>
        }
      </a>

      @if (quickAddId() === product().id) {
        <div class="quickadd-panel">
          @if (coloursOf(product()).length > 1) {
            <div class="qa-row">
              @for (c of coloursOf(product()); track c) {
                <button class="swatch-btn" [class.active]="qaColour() === c" [title]="c"
                  (click)="qaColour.set(c)">
                  <span class="swatch" [style.background]="swatch(c)"></span>
                </button>
              }
            </div>
          }
          <div class="qa-row">
            @for (s of sizesOf(product()); track s) {
              <button class="size-chip"
                [disabled]="!isBuyable(product(), s, qaColour())"
                (click)="quickAdd(product(), s)">{{ s }}</button>
            }
          </div>
        </div>
      }
      @if (addedId() === product().id) {
        <p class="qa-added">Added to cart ✓</p>
      }

      <a class="card-body" [routerLink]="['/product', product().id]">
        <h3>{{ product().name }}</h3>
        <div class="card-meta">
          <span class="dots">
            @for (c of coloursOf(product()).slice(0, 4); track c) {
              <span class="swatch small" [style.background]="swatch(c)" [title]="c"></span>
            }
          </span>
          <span class="muted small">{{ metaLine(product()) }}</span>
        </div>
        <p class="price">₦{{ product().basePrice | number: '1.0-2' }}</p>
        @if (rating(); as r) {
          <p class="stars-line" [attr.aria-label]="r.avg + ' out of 5 from ' + r.count + ' reviews'">
            <span class="stars">{{ starString(r.avg) }}</span>
            <span class="muted small">{{ r.avg | number: '1.1-1' }} ({{ r.count }})</span>
          </p>
        }
      </a>
    </div>
  `,
})
export class ProductCardComponent implements OnDestroy {
  private readonly cart = inject(CartService);
  readonly product = input.required<Product>();
  readonly index = input(0);
  readonly rating = input<{ avg: number; count: number } | null>(null);

  readonly quickAddId = signal<string | null>(null);
  readonly qaColour = signal<string | null>(null);
  readonly addedId = signal<string | null>(null);
  private addedTimer: ReturnType<typeof setTimeout> | undefined;

  private readonly fallbacks = ['shop-1.jpg', 'shop-2.jpg', 'shop-3.jpg', 'shop-5.jpg', 'shop-6.jpg'];

  ngOnDestroy(): void {
    clearTimeout(this.addedTimer);
  }

  fallback(index: number): string {
    return this.fallbacks[index % this.fallbacks.length];
  }
  swatch(colour: string): string {
    return SWATCHES[colour.toLowerCase()] ?? '#8a8378';
  }
  coloursOf(p: Product): string[] {
    return [...new Set(p.variants.map((v) => v.colour).filter((c): c is string => !!c))];
  }
  sizesOf(p: Product): string[] {
    const order = ['S', 'M', 'L', 'XL', 'XXL', 'OS', 'Bespoke'];
    return [...new Set(p.variants.map((v) => v.size).filter((s): s is string => !!s))].sort(
      (a, b) => {
        const ia = order.indexOf(a), ib = order.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
      },
    );
  }
  metaLine(p: Product): string {
    const sizes = this.sizesOf(p);
    const colours = this.coloursOf(p);
    const sizePart =
      sizes.length === 0 ? '' :
      sizes.length === 1 && (sizes[0] === 'OS' || sizes[0] === 'Bespoke')
        ? (sizes[0] === 'OS' ? 'One size' : 'Made to measure')
        : `${sizes[0]}–${sizes[sizes.length - 1]}`;
    const colourPart = colours.length > 1 ? `${colours.length} colours` : '';
    return [sizePart, colourPart].filter(Boolean).join(' · ');
  }
  isSoldOut(p: Product): boolean {
    return p.variants.length > 0 && p.variants.every((v) => v.availabilityStatus === 'out_of_stock');
  }
  badge(p: Product): string | null {
    if (this.isSoldOut(p)) return 'Sold out';
    if (p.variants.some((v) => v.availabilityStatus === 'made_to_order')) return 'Made to order';
    const ageDays = (Date.now() - new Date(p.createdAt).getTime()) / 86_400_000;
    return ageDays <= 30 ? 'New' : null;
  }
  starString(avg: number): string {
    const full = Math.round(avg);
    return '★'.repeat(full) + '☆'.repeat(5 - full);
  }

  toggleQuickAdd(p: Product): void {
    if (this.quickAddId() === p.id) {
      this.quickAddId.set(null);
      return;
    }
    this.quickAddId.set(p.id);
    this.qaColour.set(this.coloursOf(p)[0] ?? null);
  }
  private variantFor(p: Product, size: string, colour: string | null): ProductVariant | null {
    return (
      p.variants.find(
        (v) => v.size === size && (colour === null || v.colour === colour),
      ) ?? null
    );
  }
  isBuyable(p: Product, size: string, colour: string | null): boolean {
    const v = this.variantFor(p, size, colour);
    return !!v && v.availabilityStatus !== 'out_of_stock';
  }
  quickAdd(p: Product, size: string): void {
    const v = this.variantFor(p, size, this.qaColour());
    if (!v || v.availabilityStatus === 'out_of_stock') return;
    this.cart.add(p, v, 1);
    this.quickAddId.set(null);
    this.addedId.set(p.id);
    clearTimeout(this.addedTimer);
    this.addedTimer = setTimeout(() => this.addedId.set(null), 1800);
  }
}