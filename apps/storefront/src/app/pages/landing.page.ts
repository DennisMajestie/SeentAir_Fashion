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
  line1: string;    // black headline line
  line2: string;    // vermilion headline line
  caption: string;  // short description under the title
  tag: string;      // small card tag, e.g. "₦ CURATED"
  /** Vertical cover anchor (0=top … 1=bottom). Per-frame headroom trim. */
  posY?: number;
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
    <section class="dressing-scroll" #scrollRoot>
        <div class="dressing-stage">
          <div class="stage-frame">
            <!-- One persistent scene: the bare mannequin never swaps; garments
                 are layered onto it by the canvas. The stack below only
                 crossfades if the panel engine cannot start. -->
            @for (stage of stages; track stage.image; let i = $index) {
              <img
                class="stage-image"
                [class.active]="i === 0 || (engineBroken() && i <= activeStage())"
                [src]="'assets/' + (i === 0 ? baseImage() : stage.image)"
                [alt]="stage.line1"
                [loading]="i === 0 ? 'eager' : 'lazy'"
                [style.object-position]="'center ' + (i === 0 ? basePosY() : (stage.posY ?? 0.1)) * 100 + '%'"
              />
            }
          </div>
          <canvas class="stage-canvas" #particleCanvas></canvas>
          <div class="hero-wrap">
            <div class="hero-grid">
              <div class="hero-main">
                <h1 class="stage-label rise">{{ stages[activeStage()].line1 }}@if (stages[activeStage()].line2) { <em>{{ stages[activeStage()].line2 }}</em> }</h1>
                <p class="stage-lede rise">{{ stages[activeStage()].caption }}</p>
                <div class="hero-actions rise">
                  <a class="btn btn-primary" routerLink="/shop">Shop the drop</a>
                </div>
                <div class="trust-row rise">
                  <span>Full payment</span>
                  <span>Tracked dispatch</span>
                  <span>12h returns</span>
                </div>
              </div>
              <aside class="hero-card rise">
                <p class="card-kicker">Series Archive</p>
                <p class="card-tag">{{ stages[activeStage()].tag }}</p>
                <span class="card-rule"></span>
                <p class="card-title">{{ stages[activeStage()].line1 }}@if (stages[activeStage()].line2) { {{ stages[activeStage()].line2 }} }</p>
                <p class="card-desc">{{ stages[activeStage()].caption }}</p>
              </aside>
            </div>
            <div
              class="hero-slider rise"
              [class.paused]="paused()"
              (mouseenter)="pauseAuto()"
              (mouseleave)="resumeAuto()"
            >
              <button type="button" class="slider-arrow" (click)="prev()" aria-label="Previous act">←</button>
              <div class="slider-track">
                @for (stage of stages; track stage.index; let i = $index) {
                  <button
                    type="button"
                    class="slider-seg"
                    [class.active]="i === activeStage()"
                    [attr.aria-label]="'Go to act ' + (i + 1)"
                    (click)="goTo(i)"
                  ><span class="fill"></span></button>
                }
              </div>
              <span class="slider-count">[{{ stages[activeStage()].index }} / 05]</span>
              <button type="button" class="slider-arrow" (click)="next()" aria-label="Next act">→</button>
            </div>
          </div>
        </div>
      </section>

    <section id="drops" class="grid-wrap">
      <div class="wrap-col">
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
      </div>
    </section>
  `,
})
export class LandingPage implements OnInit, AfterViewInit, OnDestroy {
  private readonly api = inject(ApiService);

  @ViewChild('particleCanvas') canvasRef?: ElementRef<HTMLCanvasElement>;

  readonly paused = signal(false);
  private autoInterval: ReturnType<typeof setInterval> | undefined;

  readonly stages: Stage[] = [
    { image: 'series-1.jpg', index: '01', act: '[ACT 01: ORIGIN FORM]',
      line1: 'BE WORN.', line2: '',
      caption: 'Architectural silhouettes. Raw luxury calibrated for the continental vanguard.',
      tag: '₦ CURATED' },
    { image: 'series-2.jpg', index: '02', act: '[ACT 02: FOUNDATION LAYER]',
      line1: 'THE TEE.', line2: '',
      caption: '280GSM Lagos loomed cotton. Dropped shoulder, boxy construct.',
      tag: 'BOX FIT — 280 GSM' },
    { image: 'series-3.jpg', index: '03', act: '[ACT 03: LOWER STRUCTURE]',
      line1: 'THE JOGGER.', line2: '',
      caption: 'Heavyweight French terry. Tapered, dust-resistant.',
      tag: 'TAPERED — 30-36' },
    { image: 'series-4.jpg', index: '04', act: '[ACT 04: OUTER SHELL]',
      line1: 'THE HOOD.', line2: '',
      caption: 'Lagos Proto Hood. Raw edges, heavyweight terry.',
      tag: 'HOOD — S-XXL' },
    { image: 'series-5.jpg', index: '05', act: '[STAGE 05 / 05 — CURATED REVEAL]',
      line1: 'THE LOOK.', line2: '',
      caption: 'Drop 04 archival assembly. Edition of 180 pieces.',
      tag: '3 ITEMS' },
  ];

  readonly activeStage = signal(0);
  /** Engine failure flips the base <img> stack back to plain crossfades. */
  readonly engineBroken = signal(false);
  /** Prologue: the mannequin walks in, scrubbed by scroll. */
  readonly baseImage = signal('series-1.jpg');
  /** Vertical anchor of the base frame. The walk shots are framed very
      differently (distant figure low, close strides tall), so each walk
      beat carries its own anchor, easing down to the standing 0.1. */
  readonly basePosY = signal(0.1);
  /** Approach: far away → alternating mid strides → close heel-strike;
      the standing series-1 frame is the final "she stops" beat. */
  private readonly walkFrames: Array<{ img: string; posY: number }> = [
    { img: 'walk-1.jpg', posY: 0.22 },
    { img: 'walk-2.jpg', posY: 0.14 },
    { img: 'walk-3.jpg', posY: 0.14 },
    { img: 'walk-2.jpg', posY: 0.14 },
    { img: 'walk-3.jpg', posY: 0.14 },
    { img: 'walk-4.jpg', posY: 0.1 },
  ];
  private walkReady = false;
  /** Fraction of the scroll spent walking in (0 when frames unavailable). */
  private get walkEnd(): number {
    return this.walkReady ? 0.22 : 0;
  }
  readonly products = signal<Product[]>([]);

  private readonly fallbacks = ['shop-1.jpg', 'shop-2.jpg', 'shop-3.jpg', 'shop-5.jpg', 'shop-6.jpg'];

  // --- particle engine state ---
  private ctx: CanvasRenderingContext2D | null = null;
  private canvasW = 0;
  private canvasH = 0;
  /** garments[i] = masked garment-only image for transition i → i+1 */
  private garments: Array<HTMLCanvasElement | null> = [];
  /** piecesByPair[i] = the cut fabric panels for that transition */
  private piecesByPair: FabricPiece[][] = [];
  /** Full stage photographs + their registration shifts (sample space).
      Settled scenes draw the real photo — composites only ever fly. */
  private stageImgs: HTMLImageElement[] = [];
  private frameShifts: Array<{ dx: number; dy: number }> = [];
  private sampleW = 0;
  private sampleH = 0;
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
    window.addEventListener('scroll', this.onScroll, { passive: true });
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeydown);
    this.startAutoAdvance();
  }

  ngAfterViewInit(): void {
    void this.setupEngine();
  }

  ngOnDestroy(): void {
    window.removeEventListener('scroll', this.onScroll);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeydown);
    clearTimeout(this.resizeTimer);
    this.stopAutoAdvance();
  }

  fallbackImage(index: number): string {
    return this.fallbacks[index % this.fallbacks.length];
  }

  // ------------------------------------------------------------------
  // Hero slider control: prev/next, segmented progress, keyboard arrows.
  // Auto-advances every 6s; pauses on hover and under reduced motion.
  // ------------------------------------------------------------------
  private readonly onKeydown = (e: KeyboardEvent) => {
    const hero = document.querySelector<HTMLElement>('.dressing-stage');
    if (!hero) return;
    const rect = hero.getBoundingClientRect();
    if (rect.top > window.innerHeight || rect.bottom < 0) return;
    if (e.key === 'ArrowRight') { this.next(); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { this.prev(); e.preventDefault(); }
  };

  private startAutoAdvance(): void {
    this.stopAutoAdvance();
    this.autoInterval = setInterval(() => this.next(), 6000);
  }

  private stopAutoAdvance(): void {
    if (this.autoInterval) {
      clearInterval(this.autoInterval);
      this.autoInterval = undefined;
    }
  }

  pauseAuto(): void {
    this.paused.set(true);
    this.stopAutoAdvance();
  }

  resumeAuto(): void {
    this.paused.set(false);
    this.startAutoAdvance();
  }

  goTo(i: number): void {
    const idx = Math.max(0, Math.min(this.stages.length - 1, i));
    this.activeStage.set(idx);
    this.lastDrawnKey = '';
  }

  prev(): void {
    this.goTo(this.activeStage() - 1);
  }

  next(): void {
    this.goTo((this.activeStage() + 1) % this.stages.length);
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

    // --- Prologue: the mannequin walks in; the tee's cut pieces take to
    //     the air during the final strides and seat once it stops. ---
    const walkEnd = this.walkEnd;
    if (walkEnd > 0 && progress < walkEnd) {
      const wp = progress / walkEnd;
      const idx = Math.min(this.walkFrames.length - 1, Math.floor(wp * this.walkFrames.length));
      const frame = this.walkFrames[idx];
      if (this.baseImage() !== frame.img) this.baseImage.set(frame.img);
      if (this.basePosY() !== frame.posY) this.basePosY.set(frame.posY);
      if (this.activeStage() !== 0) this.activeStage.set(0);
      // Pieces launch halfway through the walk, hovering at ≤35% flight.
      const hover = wp > 0.5 ? ((wp - 0.5) / 0.5) * 0.35 : 0;
      this.drawPieces(0, hover);
      return;
    }
    if (this.baseImage() !== 'series-1.jpg') this.baseImage.set('series-1.jpg');
    if (this.basePosY() !== (this.stages[0].posY ?? 0.1)) this.basePosY.set(this.stages[0].posY ?? 0.1);

    const dressed = walkEnd > 0 ? (progress - walkEnd) / (1 - walkEnd) : progress;
    const segments = this.stages.length - 1; // 4 transitions
    const stageFloat = Math.min(0.9999, dressed) * segments;
    const seg = Math.min(segments - 1, Math.floor(stageFloat));
    let t = stageFloat - seg;
    // Act 1 resumes from the hover the walk left behind — no jump back.
    if (seg === 0 && walkEnd > 0) t = 0.35 + t * 0.65;

    const settled = t >= 0.88 ? seg + 1 : seg;
    if (settled !== this.activeStage()) this.activeStage.set(settled);

    this.drawPieces(seg, t);
  }

  /**
   * Persistent dressing: completed garments stay on the mannequin at full
   * opacity; only the CURRENT act's garment is mid-flight as cut panels.
   * Nothing ever crossfades — it is one scene being dressed layer by layer
   * (and undressed in reverse on scroll-up).
   */
  private drawPieces(seg: number, t: number): void {
    if (!this.ctx) return;
    const key = `${seg}:${t.toFixed(3)}:${this.engineReady}`;
    if (key === this.lastDrawnKey) return;
    this.lastDrawnKey = key;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvasW, this.canvasH);
    if (!this.engineReady || this.engineFailed) return;

    // 1. Completed acts: draw the real photograph of that dressed state
    //    (registered onto the base mannequin). No stacked diff composites —
    //    settled cloth is always solid, true fabric.
    if (seg > 0) this.drawFullFrame(ctx, seg);

    const garment = this.garments[seg];
    const pieces = this.piecesByPair[seg];
    if (!garment || !pieces || pieces.length === 0) return;

    // 2. Fully scrolled past this act → its dressed photo is the scene.
    if (t >= 0.999) {
      this.drawFullFrame(ctx, seg + 1);
      return;
    }
    if (t <= 0.001) return;

    // 3. Under the seating panels, crossfade to the next dressed photo so
    //    panel seams and rejected slivers resolve into real cloth, no pop.
    if (t > 0.8) {
      ctx.globalAlpha = (t - 0.8) / 0.2;
      this.drawFullFrame(ctx, seg + 1);
      ctx.globalAlpha = 1;
    }

    // 4. The current act's cut panels, mid-flight.
    ctx.save();
    for (const p of pieces) {
      const tp = Math.min(1, Math.max(0, (t - p.delay) / (1 - p.delay)));
      const e = 1 - Math.pow(1 - tp, 3); // ease-out: fast flight, gentle seating
      const dx = p.sdx * (1 - e);
      const dy = p.sdy * (1 - e);
      const rot = p.srot * (1 - e);

      ctx.save();
      ctx.globalAlpha = Math.min(1, 0.25 + tp * 2.5);
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

  /**
   * Cover-draw a full stage photograph at its registered offset — identical
   * math to the garment canvases, so seated overlays and full frames align.
   */
  private drawFullFrame(ctx: CanvasRenderingContext2D, idx: number): void {
    const img = this.stageImgs[idx];
    if (!img) return;
    const posY = this.stages[idx].posY ?? 0.1;
    const shift = this.frameShifts[idx] ?? { dx: 0, dy: 0 };
    const scale = Math.max(this.canvasW / img.naturalWidth, this.canvasH / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    ctx.drawImage(
      img,
      (this.canvasW - dw) * 0.5 + shift.dx * (this.canvasW / this.sampleW),
      (this.canvasH - dh) * posY + shift.dy * (this.canvasH / this.sampleH),
      dw,
      dh,
    );
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
      const sampleW = this.isMobile ? 240 : 400;
      const sampleH = Math.round((sampleW * this.canvasH) / this.canvasW);
      const frames = images.map((img, i) =>
        this.coverSample(img, sampleW, sampleH, this.stages[i].posY ?? 0.1),
      );

      // Register every frame to frame 1: the generated series drifts a few
      // pixels per frame, so we anchor on the FEET (bare in all frames) and
      // the body centroid, and align before diffing. Garments then land
      // exactly on the persistent base mannequin.
      const anchors = frames.map((f) => this.bodyAnchor(f, sampleW, sampleH));
      const shifts = anchors.map((a) => ({
        dx: Math.round(anchors[0].cx - a.cx),
        dy: Math.round(anchors[0].feetY - a.feetY),
      }));
      this.stageImgs = images;
      this.frameShifts = shifts;
      this.sampleW = sampleW;
      this.sampleH = sampleH;

      this.garments = [];
      this.piecesByPair = [];
      for (let i = 0; i < frames.length - 1; i++) {
        const built = this.buildGarmentPanels(
          frames[i], frames[i + 1], images[i + 1], sampleW, sampleH,
          this.stages[i + 1].posY ?? 0.1, shifts[i], shifts[i + 1],
        );
        this.garments.push(built.garment);
        this.piecesByPair.push(built.pieces);
      }
      this.engineReady = true;
      this.lastDrawnKey = '';
      // Walk-in prologue frames (optional: prologue is skipped if missing).
      try {
        await Promise.all(
          this.walkFrames.map(
            (f) =>
              new Promise<void>((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve();
                img.onerror = () => reject(new Error(f.img));
                img.src = `assets/${f.img}`;
              }),
          ),
        );
        this.walkReady = true;
      } catch {
        this.walkReady = false;
      }
      this.tick();
    } catch {
      // Fallback: plain crossfade keeps working; shopping never blocks.
      this.engineFailed = true;
      this.engineBroken.set(true);
    }
  }

  /**
   * Locate the mannequin in a sampled frame: background color is read from
   * the corners; the body is everything that differs from it. Returns the
   * body centroid x and the lowest body row (the feet — bare in every
   * frame, hence a stable registration anchor).
   */
  private bodyAnchor(f: Uint8ClampedArray, w: number, h: number): { cx: number; feetY: number } {
    const corner = (x: number, y: number) => {
      const i = (y * w + x) * 4;
      return [f[i], f[i + 1], f[i + 2]];
    };
    const cs = [corner(2, 2), corner(w - 3, 2), corner(2, h - 3), corner(w - 3, h - 3)];
    const bg = [0, 1, 2].map((c) => cs.reduce((s2, v) => s2 + v[c], 0) / 4);
    let sumX = 0;
    let count = 0;
    let feetY = 0;
    for (let y = 0; y < h; y++) {
      let rowHits = 0;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const d =
          Math.abs(f[i] - bg[0]) + Math.abs(f[i + 1] - bg[1]) + Math.abs(f[i + 2] - bg[2]);
        if (d > 45) {
          sumX += x;
          count++;
          rowHits++;
        }
      }
      if (rowHits >= 3) feetY = y;
    }
    return { cx: count ? sumX / count : w / 2, feetY };
  }

  /** Draw an image with CSS-cover semantics into a small sampling canvas. */
  private coverSample(img: HTMLImageElement, w: number, h: number, posY = 0.2): Uint8ClampedArray {
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const octx = off.getContext('2d')!;
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    const dx = (w - dw) * 0.5;
    const dy = (h - dh) * posY; // matches the per-stage object-position
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
    posY = 0.2,
    prevShift: { dx: number; dy: number } = { dx: 0, dy: 0 },
    nextShift: { dx: number; dy: number } = { dx: 0, dy: 0 },
  ): { garment: HTMLCanvasElement | null; pieces: FabricPiece[] } {
    // -- 1. binary diff mask at sample resolution --
    const mask = new Uint8Array(w * h);
    const scored: Array<{ x: number; y: number; score: number }> = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // Reference-space diff: read each frame at its registered offset.
        const xp = x - prevShift.dx, yp = y - prevShift.dy;
        const xn = x - nextShift.dx, yn = y - nextShift.dy;
        if (xp < 0 || xp >= w || yp < 0 || yp >= h) continue;
        if (xn < 0 || xn >= w || yn < 0 || yn >= h) continue;
        const ip = (yp * w + xp) * 4;
        const im = (yn * w + xn) * 4;
        const score =
          Math.abs(next[im] - prev[ip]) +
          Math.abs(next[im + 1] - prev[ip + 1]) +
          Math.abs(next[im + 2] - prev[ip + 2]);
        if (score > 80) scored.push({ x, y, score });
      }
    }
    if (scored.length < 40) return { garment: null, pieces: [] };
    // Keep only the strongest 40% of diffs — the garment, not scene lighting.
    scored.sort((a, b) => b.score - a.score);
    scored.length = Math.max(40, Math.floor(scored.length * 0.75));

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

    // --- Solidify the garment: fill enclosed holes so seated cloth never
    //     shows the body through it (flood-fill the outside; whatever the
    //     outside cannot reach is interior garment), then one dilation. ---
    {
      const outside = new Uint8Array(w * h);
      const stack: number[] = [];
      const push = (x: number, y: number) => {
        const i = y * w + x;
        if (!outside[i] && !mask[i]) { outside[i] = 1; stack.push(i); }
      };
      for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
      for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
      while (stack.length) {
        const i = stack.pop()!;
        const x = i % w, y = (i / w) | 0;
        if (x > 0) push(x - 1, y);
        if (x < w - 1) push(x + 1, y);
        if (y > 0) push(x, y - 1);
        if (y < h - 1) push(x, y + 1);
      }
      for (let i = 0; i < mask.length; i++) {
        if (!mask[i] && !outside[i]) mask[i] = 1; // enclosed hole → garment
      }
      const dilated = new Uint8Array(mask);
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          if (!mask[i] && (mask[i - 1] || mask[i + 1] || mask[i - w] || mask[i + w])) dilated[i] = 1;
        }
      }
      mask.set(dilated);
    }

    // -- 2. garment-only image: full-res cover draw, masked by the diff --
    const garment = document.createElement('canvas');
    garment.width = this.canvasW;
    garment.height = this.canvasH;
    const gctx = garment.getContext('2d')!;
    const scale = Math.max(this.canvasW / nextImg.naturalWidth, this.canvasH / nextImg.naturalHeight);
    const dw = nextImg.naturalWidth * scale;
    const dh = nextImg.naturalHeight * scale;
    // Draw the source frame at its registered offset so its garment sits
    // exactly on the base mannequin (reference space = frame 1).
    gctx.drawImage(
      nextImg,
      (this.canvasW - dw) * 0.5 + nextShift.dx * (this.canvasW / w),
      (this.canvasH - dh) * posY + nextShift.dy * (this.canvasH / h),
      dw,
      dh,
    );
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
    gctx.filter = 'blur(3px)'; // soften cut edges — fabric, not pixel stairs
    gctx.drawImage(maskCanvas, 0, 0, this.canvasW, this.canvasH);
    gctx.filter = 'none';

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
