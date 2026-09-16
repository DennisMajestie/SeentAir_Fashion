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
  act: string;      // "[ACT 01: ORIGIN FORM]"
  metaRight: string; // "DROP 004 SPECIMEN"
  line1: string;    // black headline line
  line2: string;    // vermilion headline line
  caption: string;
  tag: string;      // small card tag, e.g. "₦ CURATED"
}

interface FabricPiece {
  /** Canvas-space polygon — the cut shape of this fabric panel. */
  poly: Array<[number, number]>;
  cx: number; // centroid: the piece rotates/settles about this point
  cy: number;
  sdx: number; // exploded offset (where the cut piece hangs in space)
  sdy: number;
  srot: number; // exploded rotation in radians
  delay: number; // per-piece stagger — panels seat one after another
}

/**
 * The cinematic scroll-dressing landing (Design Spec §15.2) with the
 * client-requested EXPLODED GARMENT-CONSTRUCTION assembly:
 *
 * The garment is isolated by diffing the two stage photographs (the
 * changed pixels are the clothing), then CUT into pattern-piece panels —
 * sleeves, chest, body, hem — like fabric coming off the cutting table.
 * The pieces hang exploded in space, rotated apart; scroll flies each
 * panel in and seats it in place, constructing the garment exactly as it
 * is sewn in the factory. Scroll-up takes it apart again (position is a
 * pure function of scroll). At full assembly the real photograph resolves.
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
          <div class="stage-meta">
            <div class="meta-left">
              <span>{{ stages[activeStage()].act }}</span>
              <span>LAGOS / EDN. 2025</span>
            </div>
            <div class="meta-right">
              <span>{{ stages[activeStage()].metaRight }}</span>
              <span>SERIES ARCHIVE</span>
            </div>
          </div>
          <div class="stage-copy">
            <h1 class="stage-label">{{ stages[activeStage()].line1 }} <em>{{ stages[activeStage()].line2 }}</em></h1>
            <div class="stage-card">
              <p>{{ stages[activeStage()].caption }}</p>
              <span class="card-tag">{{ stages[activeStage()].tag }}</span>
            </div>
            <div class="stage-rail">
              @for (stage of stages; track stage.index; let i = $index) {
                <span class="rail-tick" [class.done]="i <= activeStage()"></span>
              }
              <span class="rail-count">[{{ stages[activeStage()].index }} / 05]</span>
            </div>
            @if (activeStage() === stages.length - 1) {
              <a class="cta" routerLink="/shop">Shop the look</a>
            }
          </div>
          <a class="skip-link" href="#drops">Explore ↓</a>
        </div>
      </section>
    } @else {
      <!-- prefers-reduced-motion: the same story, told statically. -->
      <section class="dressing-static">
        <h1 class="stage-label">The look, assembled.</h1>
        @for (stage of stages; track stage.image) {
          <figure>
            <img [src]="'assets/' + stage.image" [alt]="stage.caption" loading="lazy" />
            <figcaption><span>{{ stage.act }}</span> {{ stage.caption }}</figcaption>
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
    { image: 'act-1.jpg', index: '01', act: '[ACT 01: ORIGIN FORM]', metaRight: 'DROP 004 SPECIMEN',
      line1: 'Built to', line2: 'Be worn.',
      caption: 'Architectural silhouettes. Raw luxury calibrated for the continental vanguard.', tag: '₦ CURATED' },
    { image: 'act-2.jpg', index: '02', act: '[ACT 02: FOUNDATION LAYER]', metaRight: 'PIECE SPEC 01',
      line1: 'Start with', line2: 'The tee.',
      caption: 'Architectural silhouette cut from 280GSM Lagos loomed cotton. Dropped shoulder, boxy construct.', tag: 'BOX FIT — 280 GSM' },
    { image: 'shop-3.jpg', index: '03', act: '[ACT 03: LOWER STRUCTURE]', metaRight: 'PIECE SPEC 02',
      line1: 'Anchor the', line2: 'Silhouette.',
      caption: 'Utility jogger in charcoal. Heavyweight French terry, dust-resistant tailoring.', tag: 'TAPERED — 30-36' },
    { image: 'shop-1.jpg', index: '04', act: '[ACT 04: OUTER SHELL]', metaRight: 'PIECE SPEC 03',
      line1: 'Layer the', line2: 'Hood.',
      caption: 'Lagos Proto Hood. Heavyweight French terry, raw-edge seams, dust-resistant tailoring.', tag: 'HOOD — S-XXL' },
    { image: 'act-5.jpg', index: '05', act: '[STAGE 05 / 05 — CURATED REVEAL]', metaRight: 'LAGOS STUDIO',
      line1: 'The complete', line2: 'Look.',
      caption: 'Drop 04 archival assembly · edition of 180 pieces. Every silhouette constructed in Yaba, Lagos.', tag: '3 ITEMS' },
  ];

  readonly activeStage = signal(0);
  readonly products = signal<Product[]>([]);
  readonly reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  private readonly fallbacks = ['shop-1.jpg', 'shop-2.jpg', 'shop-3.jpg', 'shop-5.jpg', 'shop-6.jpg'];

  // --- particle engine state ---
  private ctx: CanvasRenderingContext2D | null = null;
  private canvasW = 0;
  private canvasH = 0;
  /** garments[i] = masked garment-only image for transition i → i+1 */
  private garments: Array<HTMLCanvasElement | null> = [];
  /** piecesByPair[i] = the cut fabric panels for that transition */
  private piecesByPair: FabricPiece[][] = [];
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
  // scroll, so scrolling up takes the garment apart panel by panel.
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

    this.drawPieces(seg, t);
  }

  private drawPieces(seg: number, t: number): void {
    if (!this.ctx) return;
    const key = `${seg}:${t.toFixed(3)}:${this.engineReady}`;
    if (key === this.lastDrawnKey) return;
    this.lastDrawnKey = key;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvasW, this.canvasH);
    if (!this.engineReady || this.engineFailed) return;

    const pieces = this.piecesByPair[seg];
    const garment = this.garments[seg];
    if (!pieces || pieces.length === 0 || !garment || t <= 0.001 || t >= 0.999) return;

    // Panel layer fades out as the real photograph resolves (0.85 → 1).
    const layerAlpha = t < 0.85 ? 1 : Math.max(0, 1 - (t - 0.85) / 0.15);

    ctx.save();
    for (const p of pieces) {
      const tp = Math.min(1, Math.max(0, (t - p.delay) / (1 - p.delay)));
      const e = 1 - Math.pow(1 - tp, 3); // ease-out: fast flight, gentle seating
      const dx = p.sdx * (1 - e);
      const dy = p.sdy * (1 - e);
      const rot = p.srot * (1 - e);

      ctx.save();
      // Pieces materialize quickly, then stay solid — it's fabric, not dust.
      ctx.globalAlpha = layerAlpha * Math.min(1, 0.25 + tp * 2.5);
      // Airborne pieces cast a soft shadow that dies as they seat flush.
      ctx.shadowColor = `rgba(28, 27, 27, ${0.35 * (1 - e)})`;
      ctx.shadowBlur = 22 * (1 - e);
      ctx.shadowOffsetY = 14 * (1 - e);
      ctx.translate(p.cx + dx, p.cy + dy);
      ctx.rotate(rot);
      ctx.translate(-p.cx, -p.cy);
      ctx.beginPath();
      p.poly.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(garment, 0, 0);
      ctx.restore();
    }
    ctx.restore();
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
      const sampleW = this.isMobile ? 220 : 340;
      const sampleH = Math.round((sampleW * this.canvasH) / this.canvasW);
      const frames = images.map((img) => this.coverSample(img, sampleW, sampleH));

      this.garments = [];
      this.piecesByPair = [];
      for (let i = 0; i < frames.length - 1; i++) {
        const built = this.buildGarmentPanels(
          frames[i], frames[i + 1], images[i + 1], sampleW, sampleH,
        );
        this.garments.push(built.garment);
        this.piecesByPair.push(built.pieces);
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
   * Isolate the garment (strongest pixel diffs between the two stage
   * photographs, outliers pruned) and CUT it into pattern-piece panels:
   * a jittered grid over the garment's bounding box, keeping only cells
   * that actually contain fabric. Returns the masked garment-only image
   * plus the cut pieces with their exploded start poses.
   */
  private buildGarmentPanels(
    prev: Uint8ClampedArray,
    next: Uint8ClampedArray,
    nextImg: HTMLImageElement,
    w: number,
    h: number,
  ): { garment: HTMLCanvasElement | null; pieces: FabricPiece[] } {
    // -- 1. binary diff mask at sample resolution --
    const mask = new Uint8Array(w * h);
    const scored: Array<{ x: number; y: number; score: number }> = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const score =
          Math.abs(next[i] - prev[i]) +
          Math.abs(next[i + 1] - prev[i + 1]) +
          Math.abs(next[i + 2] - prev[i + 2]);
        if (score > 105) scored.push({ x, y, score });
      }
    }
    if (scored.length < 40) return { garment: null, pieces: [] };
    // Keep only the strongest 40% of diffs — the garment, not scene lighting.
    scored.sort((a, b) => b.score - a.score);
    scored.length = Math.max(40, Math.floor(scored.length * 0.4));

    // Outlier pruning about the score-weighted centroid (kills background flecks).
    let cx = 0, cy = 0, wsum = 0;
    for (const c of scored) { cx += c.x * c.score; cy += c.y * c.score; wsum += c.score; }
    cx /= wsum; cy /= wsum;
    const dists = scored.map((c) => Math.hypot(c.x - cx, c.y - cy));
    const meanD = dists.reduce((s, d) => s + d, 0) / dists.length;
    let minX = w, minY = h, maxX = 0, maxY = 0;
    scored.forEach((c, i) => {
      if (dists[i] < meanD * 1.45) {
        mask[c.y * w + c.x] = 1;
        if (c.x < minX) minX = c.x;
        if (c.x > maxX) maxX = c.x;
        if (c.y < minY) minY = c.y;
        if (c.y > maxY) maxY = c.y;
      }
    });
    if (maxX - minX < 6 || maxY - minY < 6) return { garment: null, pieces: [] };

    // -- 2. garment-only image: full-res cover draw, masked by the diff --
    const garment = document.createElement('canvas');
    garment.width = this.canvasW;
    garment.height = this.canvasH;
    const gctx = garment.getContext('2d')!;
    const scale = Math.max(this.canvasW / nextImg.naturalWidth, this.canvasH / nextImg.naturalHeight);
    const dw = nextImg.naturalWidth * scale;
    const dh = nextImg.naturalHeight * scale;
    gctx.drawImage(nextImg, (this.canvasW - dw) * 0.5, (this.canvasH - dh) * 0.2, dw, dh);
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = w;
    maskCanvas.height = h;
    const mctx = maskCanvas.getContext('2d')!;
    const mdata = mctx.createImageData(w, h);
    for (let i = 0; i < mask.length; i++) {
      // Slight dilation: a pixel survives if it or a neighbour is fabric.
      const x = i % w, y = (i / w) | 0;
      const on = mask[i] ||
        (x > 0 && mask[i - 1]) || (x < w - 1 && mask[i + 1]) ||
        (y > 0 && mask[i - w]) || (y < h - 1 && mask[i + w]);
      mdata.data[i * 4 + 3] = on ? 255 : 0;
    }
    mctx.putImageData(mdata, 0, 0);
    gctx.globalCompositeOperation = 'destination-in';
    gctx.imageSmoothingEnabled = true;
    gctx.drawImage(maskCanvas, 0, 0, this.canvasW, this.canvasH);

    // -- 3. cut the garment into pattern-piece panels --
    const sx = this.canvasW / w;
    const sy = this.canvasH / h;
    const bx = minX * sx, by = minY * sy;
    const bw = (maxX - minX + 1) * sx, bh = (maxY - minY + 1) * sy;
    const cols = this.isMobile ? 2 : 3;
    const rows = 3;
    // Jittered node grid → organic, cut-by-hand panel shapes.
    const nodes: Array<Array<[number, number]>> = [];
    for (let r = 0; r <= rows; r++) {
      nodes.push([]);
      for (let c = 0; c <= cols; c++) {
        let nx = bx + (bw * c) / cols;
        let ny = by + (bh * r) / rows;
        if (r > 0 && r < rows) ny += (Math.random() - 0.5) * (bh / rows) * 0.45;
        if (c > 0 && c < cols) nx += (Math.random() - 0.5) * (bw / cols) * 0.45;
        nodes[r].push([nx, ny]);
      }
    }
    const centerX = bx + bw / 2;
    const centerY = by + bh / 2;
    const explodeR = Math.max(this.canvasW, this.canvasH) * 0.42;
    const pieces: FabricPiece[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const poly: Array<[number, number]> = [
          nodes[r][c], nodes[r][c + 1], nodes[r + 1][c + 1], nodes[r + 1][c],
        ];
        // Keep only panels that actually contain fabric (≥ 6% coverage).
        let hit = 0, total = 0;
        for (let iy = 0; iy < 5; iy++) {
          for (let ix = 0; ix < 5; ix++) {
            const px = poly[0][0] + ((poly[1][0] - poly[0][0]) * (ix + 0.5)) / 5 +
                       ((poly[3][0] - poly[0][0]) * (iy + 0.5)) / 5;
            const py = poly[0][1] + ((poly[1][1] - poly[0][1]) * (ix + 0.5)) / 5 +
                       ((poly[3][1] - poly[0][1]) * (iy + 0.5)) / 5;
            const mx = Math.min(w - 1, Math.max(0, Math.round(px / sx)));
            const my = Math.min(h - 1, Math.max(0, Math.round(py / sy)));
            total++;
            if (mask[my * w + mx]) hit++;
          }
        }
        if (hit / total < 0.06) continue;

        const pcx = (poly[0][0] + poly[1][0] + poly[2][0] + poly[3][0]) / 4;
        const pcy = (poly[0][1] + poly[1][1] + poly[2][1] + poly[3][1]) / 4;
        let dxn = pcx - centerX;
        let dyn = pcy - centerY;
        const len = Math.hypot(dxn, dyn) || 1;
        dxn /= len; dyn /= len;
        const jitter = (Math.random() - 0.5) * 0.9;
        const cos = Math.cos(jitter), sin = Math.sin(jitter);
        const ex = dxn * cos - dyn * sin;
        const ey = dxn * sin + dyn * cos;
        const dist = explodeR * (0.5 + Math.random() * 0.6);
        pieces.push({
          poly,
          cx: pcx,
          cy: pcy,
          sdx: ex * dist,
          sdy: ey * dist,
          srot: (Math.random() - 0.5) * 1.15,
          delay: Math.random() * 0.3,
        });
      }
    }
    return { garment: pieces.length > 0 ? garment : null, pieces };
  }
}
