import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, Product } from '../api.service';

@Component({
  selector: 'app-shop',
  imports: [CommonModule, RouterLink],
  template: `
    <section id="shop" class="grid-wrap">
      <h2>All products</h2>
      @if (loading()) {
        <p class="muted">Loading…</p>
      } @else if (products().length === 0) {
        <p class="muted">No products yet — check back soon.</p>
      } @else {
        <div class="grid">
          @for (product of products(); track product.id) {
            <a class="card" [routerLink]="['/product', product.id]">
              <div class="thumb">
                @if (product.variants[0]?.imageUrl) {
                  <img [src]="product.variants[0].imageUrl!" [alt]="product.name" />
                } @else {
                  <span class="thumb-fallback">{{ product.name.charAt(0) }}</span>
                }
              </div>
              <div class="card-body">
                <h3>{{ product.name }}</h3>
                <p class="category">{{ product.category }}</p>
                <p class="price">₦{{ product.basePrice | number: '1.0-2' }}</p>
              </div>
            </a>
          }
        </div>
      }
    </section>
  `,
})
export class ShopPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly products = signal<Product[]>([]);
  readonly loading = signal(true);

  ngOnInit(): void {
    this.api.products().subscribe({
      next: (res) => {
        this.products.set(res.data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
