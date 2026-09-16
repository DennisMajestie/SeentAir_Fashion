import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, Product } from '../api.service';

interface Stage {
  image: string;
  index: string;
  label: string;
  caption: string;
}

/**
 * The cinematic scroll-dressing landing (Design Spec §15.2).
 * Scroll position drives the mannequin's dressing sequence; the mechanism is
 * a tall scroll region with a sticky stage and opacity-layered images —
 * GPU-cheap, no animation library. Reduced-motion users get the same four
 * stages as a static editorial sequence, and the shop path never depends on
 * any of it (§15.3: animation is enhancement, not a prerequisite).
 */
@Component({
  selector: 'app-landing',
  imports: [CommonModule, RouterLink],
  template: `
    @if (!reducedMotion) {
      <section class="dressing-scroll" #scrollRoot>
        <div class="dressing-stage">
          <div class="stage-frame">
            @for (stage of stages; track stage.image; let i = $index) {
              <img
                class="stage-image"
                [class.active]="i <= activeStage()"
                [src]="'assets/' + stage.image"
                [alt]="stage.caption"
                [loading]="i === 0 ? 'eager' : 'lazy'"
                (error)="imageFailed()"
              />
            }
          </div>
          <div class="stage-copy">
            <p class="stage-index">{{ stages[activeStage()].index }} / 04</p>
            <h1 class="stage-label">{{ stages[activeStage()].label }}</h1>
            <p class="stage-caption">{{ stages[activeStage()].caption }}</p>
            <div class="stage-rail">
              @for (stage of stages; track stage.index; let i = $index) {
                <span class="rail-tick" [class.done]="i <= activeStage()"></span>
              }
            </div>
            @if (activeStage() === stages.length - 1) {
              <a class="cta" routerLink="/shop" fragment="">Shop the look</a>
            }
          </div>
          <a class="skip-link" href="#drops">Skip to shop ↓</a>
        </div>
      </section>
    } @else {
      <!-- prefers-reduced-motion: the same story, told statically. -->
      <section class="dressing-static">
        <h1 class="stage-label">The look, assembled.</h1>
        @for (stage of stages; track stage.image) {
          <figure>
            <img [src]="'assets/' + stage.image" [alt]="stage.caption" loading="lazy" (error)="imageFailed()" />
            <figcaption><span>{{ stage.index }}</span> {{ stage.caption }}</figcaption>
          </figure>
        }
        <a class="cta" routerLink="/shop">Shop the look</a>
      </section>
    }

    <section id="drops" class="grid-wrap">
      <h2>Latest drops</h2>
      @if (products().length === 0) {
        <p class="muted">New pieces landing soon.</p>
      } @else {
        <div class="grid">
          @for (product of products(); track product.id; let i = $index) {
            <a class="card" [routerLink]="['/product', product.id]">
              <div class="thumb">
                <img
                  [src]="product.variants[0]?.imageUrl || 'assets/' + fallbackImage(i)"
                  [alt]="product.name"
                  loading="lazy"
                />
              </div>
              <div class="card-body">
                <h3>{{ product.name }}</h3>
                <p class="category">{{ product.category }}</p>
                <p class="price">₦{{ product.basePrice | number: '1.0-2' }}</p>
              </div>
            </a>
          }
        </div>
        <p class="center"><a class="cta ghost" routerLink="/shop">View all products</a></p>
      }
    </section>
  `,
})
export class LandingPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);

  readonly stages: Stage[] = [
    { image: 'stage-1-empty.jpg', index: '01', label: 'The blank form.', caption: 'One mannequin. Nothing to prove yet.' },
    { image: 'stage-2-shirt.jpg', index: '02', label: 'The shirt.', caption: 'Oversized Seentair tee — cut and sewn in our own factory.' },
    { image: 'stage-3-joggers.jpg', index: '03', label: 'The joggers.', caption: 'Heavyweight cargo joggers. The silhouette takes shape.' },
    { image: 'stage-4-complete.jpg', index: '04', label: 'The look.', caption: 'Sneakers on. Complete. Now make it yours.' },
  ];

  readonly activeStage = signal(0);
  readonly products = signal<Product[]>([]);
  readonly reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  private readonly fallbacks = ['product-tee.jpg', 'product-joggers.jpg', 'product-sneakers.jpg', 'product-bag.jpg'];
  private ticking = false;
  private readonly onScroll = () => {
    if (this.ticking) return;
    this.ticking = true;
    requestAnimationFrame(() => {
      this.ticking = false;
      const section = document.querySelector<HTMLElement>('.dressing-scroll');
      if (!section) return;
      const rect = section.getBoundingClientRect();
      const scrollable = section.offsetHeight - window.innerHeight;
      if (scrollable <= 0) return;
      const progress = Math.min(1, Math.max(0, -rect.top / scrollable));
      const stage = Math.min(this.stages.length - 1, Math.floor(progress * this.stages.length));
      if (stage !== this.activeStage()) this.activeStage.set(stage);
    });
  };

  ngOnInit(): void {
    this.api.products().subscribe((res) => this.products.set(res.data.slice(0, 8)));
    if (!this.reducedMotion) {
      window.addEventListener('scroll', this.onScroll, { passive: true });
    }
  }

  ngOnDestroy(): void {
    window.removeEventListener('scroll', this.onScroll);
  }

  fallbackImage(index: number): string {
    return this.fallbacks[index % this.fallbacks.length];
  }

  /** A failed asset never blocks shopping — the styled backdrop stands in. */
  imageFailed(): void {
    /* intentionally silent: the stage frame keeps its obsidian backdrop */
  }
}
