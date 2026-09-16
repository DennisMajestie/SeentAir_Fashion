import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, Product } from '../api.service';

interface Stage {
  image: string;
  index: string;
  label: string;
  caption: string;
}

interface Particle {
  tx: number; // target (home) position — where this garment pixel lives
  ty: number;
  sx: number; // exploded start position
  sy: number;
  color: string;
  delay: number; // per-particle stagger for organic assembly
}

/**
 * The cinematic scroll-dressing landing (Design Spec §15.2) with the
 * client-requested EXPLODED-PARTICLE assembly:
 *
 * For each stage transition the pixel DIFFERENCE between the two stage
 * photographs is sampled — those changed pixels are the garment itself.
 * Each becomes a particle, radially exploded from the garment's centroid,
 * that converges to its exact home position as the scroll segment
 * progresses (and disperses again on scroll-up: position is a pure
 * function of scroll). At full assembly the real photograph takes over.
 *
 * Guardrails (§15.3): reduced-motion users get the static sequence; if the
 * particle engine cannot start (image decode/readback failure) the plain
 * crossfade remains; shopping never depends on any of it.
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
              />
            }
          </div>
          <canvas class="stage-canvas" #particleCanvas></canvas>
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
              <a class="cta" routerLink="/shop">Shop the look</a>
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
            <img [src]="'assets/' + stage.image" [alt]="stage.caption" loading="lazy" />
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
                <p class="sku-line">{{ product.variants[0]?.sku || 'SPEC-' + (i + 1) }} // {{ product.variants.length }} variant(s)</p>
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
export class LandingPage implements OnInit, AfterViewInit, OnDestroy {
  private readonly api = inject(ApiService);

  @ViewChild('particleCanvas') canvasRef?: ElementRef<HTMLCanvasElement>;

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

  // --- particle engine state ---
  private ctx: CanvasRenderingContext2D | null = null;
  private canvasW = 0;
  private canvasH = 0;
  /** particles[i] = garment particles for the transition stage i → i+1 */
  private pairs: Particle[][] = [];
  private engineReady = false;
  private engineFailed = false;
  private ticking = false;
  private lastDrawnKey = '';
  private readonly isMobile =
    typeof window !== 'undefined' && window.innerWidth < 640;

  private readonly onScroll = () => {
    if (this.ticking) return;
    this.ticking = true;
    requestAnimationFrame(() => {
      this.ticking = false;
      this.tick();
    });
  };
  private readonly onResize = () => {
    // Debounced rebuild: particle homes depend on the cover mapping.
    clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => this.setupEngine(), 250);
  };
  private resizeTimer: ReturnType<typeof setTimeout> | undefined;

  ngOnInit(): void {
    this.api.products().subscribe((res) => this.products.set(res.data.slice(0, 8)));
    if (!this.reducedMotion) {
      window.addEventListener('scroll', this.onScroll, { passive: true });
      window.addEventListener('resize', this.onResize);
    }
  }

  ngAfterViewInit(): void {
    if (!this.reducedMotion) void this.setupEngine();
  }

  ngOnDestroy(): void {
    window.removeEventListener('scroll', this.onScroll);
    window.removeEventListener('resize', this.onResize);
    clearTimeout(this.resizeTimer);
  }

  fallbackImage(index: number): string {
    return this.fallbacks[index % this.fallbacks.length];
  }

  // ------------------------------------------------------------------
  // Scroll → stage/segment mapping. Position is a pure function of
  // scroll, so scrolling up disperses the garment back into particles.
  // ------------------------------------------------------------------
  private tick(): void {
    const section = document.querySelector<HTMLElement>('.dressing-scroll');
    if (!section) return;
    const rect = section.getBoundingClientRect();
    const scrollable = section.offsetHeight - window.innerHeight;
    if (scrollable <= 0) return;
    const progress = Math.min(1, Math.max(0, -rect.top / scrollable));

    const segments = this.stages.length - 1; // 3 transitions
    const stageFloat = progress * segments;
    const seg = Math.min(segments - 1, Math.floor(stageFloat));
    const t = stageFloat - seg;

    // Real photograph takes over at 88% assembly (its 0.7s CSS fade
    // overlaps the particle fade-out for a seamless hand-off).
    const settled = t >= 0.88 ? seg + 1 : seg;
    if (settled !== this.activeStage()) this.activeStage.set(settled);

    this.drawParticles(seg, t);
  }

  private drawParticles(seg: number, t: number): void {
    if (!this.ctx) return;
    const key = `${seg}:${t.toFixed(3)}:${this.engineReady}`;
    if (key === this.lastDrawnKey) return;
    this.lastDrawnKey = key;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvasW, this.canvasH);
    if (!this.engineReady || this.engineFailed) return;

    const particles = this.pairs[seg];
    if (!particles || t <= 0.001 || t >= 0.999) return;

    // Particle layer fades as the real photo takes over (0.85 → 1).
    const layerAlpha = t < 0.85 ? 1 : 1 - (t - 0.85) / 0.15;
    ctx.globalAlpha = Math.max(0, layerAlpha);

    const sizeFrom = this.isMobile ? 5 : 7;
    const sizeTo = 2.5;
    for (const p of particles) {
      // Per-particle stagger, then ease-out toward home.
      const tp = Math.min(1, Math.max(0, (t - p.delay) / (1 - p.delay)));
      const e = 1 - Math.pow(1 - tp, 3);
      const x = p.sx + (p.tx - p.sx) * e;
      const y = p.sy + (p.ty - p.sy) * e;
      const size = sizeFrom + (sizeTo - sizeFrom) * e;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = layerAlpha * (0.65 + 0.35 * e);
      ctx.fillRect(x, y, size, size);
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------
  // Engine setup: load stage photos, diff adjacent pairs, build particles.
  // ------------------------------------------------------------------
  private async setupEngine(): Promise<void> {
    try {
      const canvas = this.canvasRef?.nativeElement;
      const stageEl = document.querySelector<HTMLElement>('.dressing-stage');
      if (!canvas || !stageEl) return;

      this.canvasW = stageEl.clientWidth;
      this.canvasH = stageEl.clientHeight;
      canvas.width = this.canvasW;
      canvas.height = this.canvasH;
      this.ctx = canvas.getContext('2d');
      if (!this.ctx) throw new Error('no 2d context');

      const images = await Promise.all(
        this.stages.map(
          (s) =>
            new Promise<HTMLImageElement>((resolve, reject) => {
              const img = new Image();
              img.onload = () => resolve(img);
              img.onerror = () => reject(new Error(`load failed: ${s.image}`));
              img.src = `assets/${s.image}`;
            }),
        ),
      );

      // Sample at reduced resolution for cheap diffing, mapped back to
      // canvas space with the same cover math as the CSS images
      // (object-fit: cover; object-position: center 20%).
      const sampleW = this.isMobile ? 180 : 260;
      const sampleH = Math.round((sampleW * this.canvasH) / this.canvasW);
      const frames = images.map((img) => this.coverSample(img, sampleW, sampleH));

      const maxParticles = this.isMobile ? 1400 : 3200;
      this.pairs = [];
      for (let i = 0; i < frames.length - 1; i++) {
        this.pairs.push(
          this.buildParticles(frames[i], frames[i + 1], sampleW, sampleH, maxParticles),
        );
      }
      this.engineReady = true;
      this.lastDrawnKey = '';
      this.tick();
    } catch {
      // Fallback: plain crossfade keeps working; shopping never blocks.
      this.engineFailed = true;
    }
  }

  /** Draw an image with CSS-cover semantics into a small sampling canvas. */
  private coverSample(img: HTMLImageElement, w: number, h: number): Uint8ClampedArray {
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const octx = off.getContext('2d')!;
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    const dx = (w - dw) * 0.5;
    const dy = (h - dh) * 0.2; // matches object-position: center 20%
    octx.drawImage(img, dx, dy, dw, dh);
    return octx.getImageData(0, 0, w, h).data;
  }

  /**
   * Changed pixels between two stages = the garment → particles.
   * The stage photographs are separate scenes, so backgrounds differ
   * mildly everywhere; the garment must dominate. Strategy: keep only the
   * STRONGEST diffs, then prune spatial outliers around their centroid —
   * what survives is the clothing, not the concrete.
   */
  private buildParticles(
    prev: Uint8ClampedArray,
    next: Uint8ClampedArray,
    w: number,
    h: number,
    cap: number,
  ): Particle[] {
    let candidates: Array<{ x: number; y: number; r: number; g: number; b: number; score: number }> = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const score =
          Math.abs(next[i] - prev[i]) +
          Math.abs(next[i + 1] - prev[i + 1]) +
          Math.abs(next[i + 2] - prev[i + 2]);
        if (score > 105) {
          candidates.push({ x, y, r: next[i], g: next[i + 1], b: next[i + 2], score });
        }
      }
    }
    if (candidates.length === 0) return [];

    // Keep the strongest diffs — the garment changes hardest.
    candidates.sort((a, b) => b.score - a.score);
    candidates = candidates.slice(0, Math.min(candidates.length, cap * 3));

    // Score-weighted centroid, then prune spatial outliers (background flecks).
    let cx = 0;
    let cy = 0;
    let wsum = 0;
    for (const c of candidates) {
      cx += c.x * c.score;
      cy += c.y * c.score;
      wsum += c.score;
    }
    cx /= wsum;
    cy /= wsum;
    const dists = candidates.map((c) => Math.hypot(c.x - cx, c.y - cy));
    const meanD = dists.reduce((s, d) => s + d, 0) / dists.length;
    candidates = candidates.filter((_, i) => dists[i] < meanD * 1.75);

    // Subsample to the particle budget.
    const stride = Math.max(1, Math.floor(candidates.length / cap));
    const scaleX = this.canvasW / w;
    const scaleY = this.canvasH / h;
    const explodeR = Math.max(this.canvasW, this.canvasH) * 0.55;

    const particles: Particle[] = [];
    for (let i = 0; i < candidates.length; i += stride) {
      const c = candidates[i];
      const tx = c.x * scaleX;
      const ty = c.y * scaleY;
      // Explosion vector: radially outward from the garment centroid,
      // with jitter so the cloud reads organic, not geometric.
      let dxn = c.x - cx;
      let dyn = c.y - cy;
      const len = Math.hypot(dxn, dyn) || 1;
      dxn /= len;
      dyn /= len;
      const angleJitter = (Math.random() - 0.5) * 1.2;
      const cos = Math.cos(angleJitter);
      const sin = Math.sin(angleJitter);
      const ex = dxn * cos - dyn * sin;
      const ey = dxn * sin + dyn * cos;
      const radius = explodeR * (0.35 + Math.random() * 0.75);
      particles.push({
        tx,
        ty,
        sx: tx + ex * radius,
        sy: ty + ey * radius,
        color: `rgb(${c.r},${c.g},${c.b})`,
        delay: Math.random() * 0.35,
      });
    }
    return particles;
  }
}
