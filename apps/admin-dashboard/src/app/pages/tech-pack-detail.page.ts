import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  SeActivityComponent,
  SeActivityEntry,
  SeBadgeComponent,
  SeBannerComponent,
  SeButtonDirective,
  SeCardComponent,
  SeColumn,
  SeConfirmService,
  SeCurrencyService,
  SeDrawerComponent,
  SeEmptyStateComponent,
  SeFieldComponent,
  SeInputDirective,
  SeKvDirective,
  SeKvItemComponent,
  SeMoneyPipe,
  SePageComponent,
  SeSkeletonComponent,
  SeStatusComponent,
  SeTableComponent,
  SeToastService,
} from '@seentair/ui';
import { forkJoin } from 'rxjs';
import { AccessService } from '../access.service';
import { ApiService } from '../api.service';
import {
  MeasurementRow,
  PACK_STATES,
  ProductRow,
  TechPack,
  VariantRow,
  countOf,
  measurementTable,
  packState,
  packVariantId,
  revisionNumber,
  variantLabel,
} from './tech-pack-format';

const COST_LINES = [
  { key: 'materialCost', label: 'Raw materials' },
  { key: 'sewingCost', label: 'Sewing and assembly' },
  { key: 'brandingCost', label: 'Branding and hardware' },
  { key: 'packagingCost', label: 'Packaging' },
];

/**
 * The tech pack of one variant: graded measurements, the seam and laydown
 * protocols, the pattern file, what a unit costs to make, and every revision.
 *
 * Each save writes a new revision. Only an approved pack is the shop-floor
 * reference, so approving is confirmed first, and so is saving over an
 * approved pack, because that returns it to draft.
 */
@Component({
  selector: 'app-tech-pack-detail',
  imports: [
    FormsModule,
    RouterLink,
    SeActivityComponent,
    SeBadgeComponent,
    SeBannerComponent,
    SeButtonDirective,
    SeCardComponent,
    SeDrawerComponent,
    SeEmptyStateComponent,
    SeFieldComponent,
    SeInputDirective,
    SeKvDirective,
    SeKvItemComponent,
    SeMoneyPipe,
    SePageComponent,
    SeSkeletonComponent,
    SeStatusComponent,
    SeTableComponent,
  ],
  styles: [
    // A protocol is typed as several lines; keep its line breaks.
    '.tech-pack-protocol { white-space: pre-wrap; overflow-wrap: anywhere; }',
  ],
  template: `
    <se-page [title]="title()" [breadcrumbs]="crumbs()">
      @if (variant()) {
        <ng-container sePageStatus>
          @if (state() === 'approved') {
            <se-status kind="approval" value="approved" />
          } @else {
            <se-badge [tone]="state() === 'draft' ? 'info' : 'neutral'">{{
              stateLabel()
            }}</se-badge>
          }
        </ng-container>
      }
      @if (product(); as p) {
        <p sePageMeta>
          {{ p.name }}{{ label() ? ', ' + label() : ''
          }}{{ pack() ? ', revision ' + revision() : '' }}
        </p>
      }
      @if (variant()) {
        <ng-container sePageActions>
          @if (pack() && canEdit()) {
            <button seButton type="button" (click)="openSpec()">Edit spec</button>
          }
          @if (pack() && state() !== 'approved' && canApprove()) {
            <button
              seButton
              variant="primary"
              type="button"
              [loading]="busy() === 'approve'"
              (click)="approve()"
            >
              Approve tech pack
            </button>
          }
          @if (!pack() && canEdit()) {
            <button
              seButton
              variant="primary"
              type="button"
              [loading]="busy() === 'create'"
              (click)="create()"
            >
              Create tech pack
            </button>
          }
        </ng-container>
      }

      @if (loading()) {
        <div class="se-detail" aria-busy="true">
          <div class="se-detail__main">
            <se-card><se-skeleton shape="table" [rows]="4" [columns]="5" /></se-card>
          </div>
          <aside class="se-detail__aside">
            <se-card><se-skeleton shape="detail" [rows]="4" /></se-card>
          </aside>
        </div>
      } @else if (loadError()) {
        <se-banner
          tone="danger"
          title="The tech pack could not be loaded"
          actionLabel="Try again"
          (action)="load()"
        >
          {{ loadError() }}
        </se-banner>
      } @else if (missing()) {
        <se-card>
          <se-empty-state
            heading="This variant does not exist"
            text="It may have been removed from the catalogue, or the link may be wrong."
            actionLabel="Back to tech packs"
            (action)="back()"
          />
        </se-card>
      } @else if (product(); as p) {
        <div class="se-detail">
          <div class="se-detail__main">
            @if (pack(); as tp) {
              <se-card title="Graded measurements" flush>
                @if (canEdit()) {
                  <button seButton size="sm" seCardActions type="button" (click)="openMeasures()">
                    Edit measurements
                  </button>
                }
                <se-table
                  caption="Graded measurements by size"
                  [columns]="measureColumns()"
                  [rows]="measures().rows"
                  hideDensity
                  emptyHeading="No measurements recorded yet"
                  emptyText="Points of measure appear here once they are saved, one column per size."
                />
              </se-card>

              <se-card title="Seam, thread and laydown">
                <dl seKv>
                  <div seKvItem label="Stitch protocol">
                    <span class="tech-pack-protocol">{{ text(tp, 'stitchProtocol') }}</span>
                  </div>
                  <div seKvItem label="Laydown protocol">
                    <span class="tech-pack-protocol">{{ text(tp, 'laydownProtocol') }}</span>
                  </div>
                </dl>
              </se-card>
            } @else {
              <se-card>
                <se-empty-state
                  heading="No tech pack for this variant yet"
                  [text]="
                    canEdit()
                      ? 'Create one to record its measurements, protocols and pattern file.'
                      : 'Someone with full access to the catalogue can create one.'
                  "
                />
              </se-card>
            }

            <se-card [title]="'Sizes and colours of ' + p.name" flush>
              <se-table
                caption="Sizes and colours of this product"
                [columns]="variantColumns"
                [rows]="p.variants"
                hideDensity
                emptyHeading="This product has no variants"
              />
            </se-card>
          </div>

          <aside class="se-detail__aside">
            <se-card title="Details">
              <dl seKv>
                <div seKvItem label="Product">{{ p.name }}</div>
                <div seKvItem label="Retail price" numeric>{{ p.basePrice | seMoney }}</div>
                @if (pack(); as tp) {
                  <div seKvItem label="Silhouette">{{ text(tp, 'silhouette') }}</div>
                  <div seKvItem label="Target yield" numeric>
                    {{ tp['targetYieldUnits'] != null ? tp['targetYieldUnits'] + ' units' : '–' }}
                  </div>
                  <div seKvItem label="Cutting efficiency" numeric>
                    {{
                      tp['cuttingEfficiencyPct'] != null ? tp['cuttingEfficiencyPct'] + '%' : '–'
                    }}
                  </div>
                  <div seKvItem label="Pattern file">
                    @if (patternLink(); as href) {
                      <a [href]="href" target="_blank" rel="noopener">{{ href }}</a>
                    } @else {
                      <span class="tech-pack-protocol">{{ text(tp, 'dxfUrl') }}</span>
                    }
                  </div>
                }
              </dl>
            </se-card>

            <se-card title="Cost per unit">
              <a seButton size="sm" seCardActions routerLink="/catalogue"
                >Edit costs in catalogue</a
              >
              @if (costError()) {
                <se-banner
                  tone="danger"
                  title="The batch cost could not be read"
                  actionLabel="Try again"
                  (action)="loadCost()"
                >
                  {{ costError() }}
                </se-banner>
              } @else if (cost(); as c) {
                <dl seKv>
                  @for (line of c.lines; track line.label) {
                    <div seKvItem [label]="line.label" numeric>{{ line.amount | seMoney: 2 }}</div>
                  }
                  <div seKvItem label="Standard unit cost" numeric>{{ c.total | seMoney: 2 }}</div>
                </dl>
                <p>From the recorded cost of production batch #{{ c.batchRef }}.</p>
              } @else {
                <p>No batch costs yet. Record one in production to fill this in.</p>
              }
            </se-card>

            @if (pack()) {
              <se-card [title]="revisionCount()">
                <se-activity
                  [entries]="activity()"
                  emptyText="Revisions appear here each time the pack is saved."
                />
              </se-card>
            }
          </aside>
        </div>
      }
    </se-page>

    <!-- The spec: six fields, so a drawer. Measurements have their own, opened from their card. -->
    <se-drawer [title]="'Spec for ' + sku()" [(open)]="specOpen">
      @if (saveError()) {
        <se-banner
          tone="danger"
          title="The revision was not saved"
          actionLabel="Try again"
          (action)="saveSpec()"
        >
          {{ saveError() }} What you typed is still here.
        </se-banner>
      }
      <form class="se-form" (submit)="$event.preventDefault(); saveSpec()">
        <se-field label="Silhouette" hint="For example: relaxed tee" optional>
          <input seInput name="silhouette" [(ngModel)]="spec.silhouette" autocomplete="off" />
        </se-field>
        <div class="se-form__row">
          <se-field label="Target yield" hint="In units" [error]="specError('yield')" optional>
            <input seInput type="number" min="0" name="yield" [(ngModel)]="spec.targetYieldUnits" />
          </se-field>
          <se-field
            label="Cutting efficiency"
            hint="Percent, 0 to 100"
            [error]="specError('efficiency')"
            optional
          >
            <input
              seInput
              type="number"
              min="0"
              max="100"
              name="efficiency"
              [(ngModel)]="spec.cuttingEfficiencyPct"
            />
          </se-field>
        </div>
        <se-field label="Pattern file" hint="Address of the DXF or cut-pattern file" optional>
          <input seInput name="dxf" [(ngModel)]="spec.dxfUrl" autocomplete="off" />
        </se-field>
        <se-field label="Stitch protocol" hint="Stitch density and thread matching" optional>
          <textarea seInput rows="3" name="stitch" [(ngModel)]="spec.stitchProtocol"></textarea>
        </se-field>
        <se-field label="Laydown protocol" optional>
          <textarea seInput rows="3" name="laydown" [(ngModel)]="spec.laydownProtocol"></textarea>
        </se-field>
      </form>
      <ng-container seDrawerFooter>
        <button seButton type="button" (click)="specOpen.set(false)">Cancel</button>
        <button seButton variant="primary" type="button" [loading]="saving()" (click)="saveSpec()">
          Save revision {{ revision() + 1 }}
        </button>
      </ng-container>
    </se-drawer>

    <se-drawer [title]="'Measurements for ' + sku()" [(open)]="measuresOpen">
      @if (saveError()) {
        <se-banner
          tone="danger"
          title="The revision was not saved"
          actionLabel="Try again"
          (action)="saveMeasures()"
        >
          {{ saveError() }} What you typed is still here.
        </se-banner>
      }
      <form class="se-form" (submit)="$event.preventDefault(); saveMeasures()">
        <se-field
          label="Graded measurements"
          hint='JSON keyed by size, for example {"S": {"chest": 52}, "M": {"chest": 54}}'
          [error]="measuresError()"
        >
          <textarea seInput rows="10" name="measures" [(ngModel)]="measuresJson"></textarea>
        </se-field>
      </form>
      <ng-container seDrawerFooter>
        <button seButton type="button" (click)="measuresOpen.set(false)">Cancel</button>
        <button
          seButton
          variant="primary"
          type="button"
          [loading]="saving()"
          (click)="saveMeasures()"
        >
          Save revision {{ revision() + 1 }}
        </button>
      </ng-container>
    </se-drawer>
  `,
})
export class TechPackDetailPage {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly confirm = inject(SeConfirmService);
  private readonly toast = inject(SeToastService);
  private readonly currency = inject(SeCurrencyService);
  private readonly access = inject(AccessService);

  /** The variant's id: a pack is kept per variant, and a variant may not have one yet. */
  private readonly id = this.route.snapshot.paramMap.get('id') ?? '';

  readonly product = signal<ProductRow | null>(null);
  readonly variant = signal<VariantRow | null>(null);
  readonly pack = signal<TechPack | null>(null);
  private readonly revisions = signal<TechPack[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly missing = signal(false);
  /** Which page action is running, for its button's loading state. */
  readonly busy = signal<'' | 'create' | 'approve'>('');

  /** Per-unit cost, from the first batch of this product that has a cost recorded. */
  readonly cost = signal<{
    lines: { label: string; amount: number }[];
    total: number;
    batchRef: string;
  } | null>(null);
  readonly costError = signal('');

  // POST and PUT need full access to the catalogue; approving needs approve.
  readonly canEdit = computed(() => this.access.can('catalogue', 'full'));
  readonly canApprove = computed(() => this.access.can('catalogue', 'approve'));

  readonly sku = computed(() => this.variant()?.sku ?? '');
  readonly label = computed(() => {
    const v = this.variant();
    return v ? variantLabel(v) : '';
  });
  readonly title = computed(() => (this.sku() ? `Tech pack ${this.sku()}` : 'Tech pack'));
  readonly crumbs = computed(() => [
    { label: 'Tech packs', link: '/tech-pack' },
    { label: this.sku() || 'Tech pack' },
  ]);
  readonly state = computed(() => packState(this.pack()));
  readonly stateLabel = computed(() => PACK_STATES[this.state()] ?? this.state());
  readonly revision = computed(() => revisionNumber(this.pack()));
  readonly measures = computed(() => measurementTable(this.pack()?.['gradedMeasurements']));
  readonly measureColumns = computed<SeColumn<MeasurementRow>[]>(() => [
    { key: 'id', header: 'Point of measure' },
    ...this.measures().sizes.map((size) => ({ key: size, header: size, numeric: true })),
  ]);
  readonly patternLink = computed(() => {
    const url = String(this.pack()?.['dxfUrl'] ?? '');
    return /^https?:\/\//.test(url) ? url : '';
  });

  readonly revisionCount = computed(() => countOf(this.revisions().length, 'revision'));
  /** Saved revisions, newest first. */
  readonly activity = computed<SeActivityEntry[]>(() =>
    [...this.revisions()]
      .sort((a, b) => String(b['createdAt']).localeCompare(String(a['createdAt'])))
      .map((r) => {
        const status = String((r['snapshot'] as TechPack | null)?.['status'] ?? '');
        return {
          at: String(r['createdAt'] ?? ''),
          text: `Revision ${r['revision']}${status ? ', ' + (PACK_STATES[status] ?? status).toLowerCase() : ''}`,
          tone: status === 'approved' ? ('success' as const) : undefined,
        };
      }),
  );

  readonly variantColumns: SeColumn<VariantRow>[] = [
    { key: 'sku', header: 'SKU' },
    { key: 'size', header: 'Size', value: (v) => v.size || '–' },
    { key: 'colour', header: 'Colour', value: (v) => v.colour || '–' },
    {
      key: 'price',
      header: 'Price',
      numeric: true,
      value: (v) => Number(v.priceOverride ?? this.product()?.basePrice ?? 0),
      format: (v) => this.currency.format(v as number),
    },
  ];

  constructor() {
    this.load();
  }

  load(): void {
    this.loadError.set('');
    this.missing.set(false);
    forkJoin([this.api.products(), this.api.techPacks()]).subscribe({
      next: ([products, packs]) => {
        const all = products.data as unknown as ProductRow[];
        const product = all.find((p) => (p.variants ?? []).some((v) => v.id === this.id)) ?? null;
        const found = (packs ?? []).find((p) => packVariantId(p) === this.id) ?? null;
        this.product.set(product);
        this.variant.set(product?.variants.find((v) => v.id === this.id) ?? null);
        this.pack.set(found);
        this.missing.set(!product);
        this.loading.set(false);
        if (found) this.loadRevisions();
        if (product) this.loadCost();
      },
      error: (err) => {
        this.loading.set(false);
        this.loadError.set(
          err?.error?.message ?? 'The server did not respond. Nothing has been changed.',
        );
      },
    });
  }

  private loadRevisions(): void {
    const id = this.pack()?.['id'] as string | undefined;
    if (!id) return;
    this.api.techPackRevisions(id).subscribe({
      next: (revs) => this.revisions.set(revs ?? []),
      error: (err) =>
        this.toast.show(err?.error?.message ?? 'The revisions could not be loaded', {
          tone: 'danger',
          action: { label: 'Try again', run: () => this.loadRevisions() },
        }),
    });
  }

  loadCost(): void {
    const skus = new Set((this.product()?.variants ?? []).map((v) => v.sku));
    this.costError.set('');
    const failed = (err: { error?: { message?: string } }): void =>
      this.costError.set(err?.error?.message ?? 'The server did not respond.');
    this.api.batches().subscribe({
      next: (res) => {
        for (const b of res.data.filter((x) => skus.has(x.variant.sku))) {
          this.api.batchCost(b.id).subscribe({
            next: (c) => {
              if (!c || this.cost() !== null || b.quantity <= 0) return;
              this.cost.set({
                lines: COST_LINES.map((l) => ({
                  label: l.label,
                  amount: Number(c[l.key] ?? 0) / b.quantity,
                })),
                total: Number(c['totalCost'] ?? 0) / b.quantity,
                batchRef: b.id.slice(0, 8).toUpperCase(),
              });
            },
            // 404 means this batch has no cost recorded yet. Anything else is a
            // failed read, and showing that as "no cost" would hide a real cost.
            error: (err) => {
              if (err?.status !== 404) failed(err);
            },
          });
        }
      },
      error: failed,
    });
  }

  text(pack: TechPack, key: string): string {
    return String(pack[key] ?? '') || '–';
  }

  back(): void {
    void this.router.navigate(['/tech-pack']);
  }

  // ---- page actions ----
  create(): void {
    this.busy.set('create');
    this.api.createTechPack({ variantId: this.id }).subscribe({
      next: (pack) => {
        this.busy.set('');
        this.pack.set(pack);
        this.revisions.set([]);
        this.toast.show(`Tech pack created for ${this.sku()} as draft revision 1`);
      },
      error: (err) => this.failed(err, 'The tech pack could not be created', () => this.create()),
    });
  }

  async approve(): Promise<void> {
    const pack = this.pack();
    if (!pack) return;
    const ok = await this.confirm.ask({
      title: `Approve tech pack for ${this.sku()}?`,
      consequence: `Revision ${this.revision()} becomes the shop-floor reference for this variant. The approval is recorded in the audit log. Saving a later revision returns the pack to draft.`,
      confirmLabel: 'Approve tech pack',
    });
    if (!ok) return;
    this.busy.set('approve');
    this.api.approveTechPack(pack['id'] as string).subscribe({
      next: (updated) => {
        this.busy.set('');
        this.pack.set(updated);
        this.loadRevisions();
        this.toast.show(`Tech pack for ${this.sku()} approved`);
      },
      error: (err) =>
        this.failed(err, 'The tech pack could not be approved', () => void this.approve()),
    });
  }

  /** A page action failed and there is no form to hold a banner: a toast with a retry. */
  private failed(err: { error?: { message?: string } }, fallback: string, retry: () => void): void {
    this.busy.set('');
    this.toast.show(err?.error?.message ?? fallback, {
      tone: 'danger',
      action: { label: 'Try again', run: retry },
    });
  }

  // ---- drawers ----
  readonly specOpen = signal(false);
  readonly measuresOpen = signal(false);
  readonly saving = signal(false);
  readonly saveError = signal('');
  private readonly submitted = signal(false);

  spec = {
    silhouette: '',
    targetYieldUnits: null as number | null,
    cuttingEfficiencyPct: null as number | null,
    dxfUrl: '',
    stitchProtocol: '',
    laydownProtocol: '',
  };
  measuresJson = '';

  openSpec(): void {
    const p = this.pack() ?? {};
    const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
    this.spec = {
      silhouette: String(p['silhouette'] ?? ''),
      targetYieldUnits: num(p['targetYieldUnits']),
      cuttingEfficiencyPct: num(p['cuttingEfficiencyPct']),
      dxfUrl: String(p['dxfUrl'] ?? ''),
      stitchProtocol: String(p['stitchProtocol'] ?? ''),
      laydownProtocol: String(p['laydownProtocol'] ?? ''),
    };
    this.resetForm();
    this.specOpen.set(true);
  }

  specError(field: 'yield' | 'efficiency'): string {
    if (!this.submitted()) return '';
    const y = this.spec.targetYieldUnits;
    const e = this.spec.cuttingEfficiencyPct;
    if (field === 'yield') return y !== null && y < 0 ? 'Enter zero or more units.' : '';
    return e !== null && (e < 0 || e > 100) ? 'Enter a percentage from 0 to 100.' : '';
  }

  saveSpec(): void {
    this.submitted.set(true);
    if (this.specError('yield') || this.specError('efficiency')) return;
    const s = this.spec;
    void this.save(
      {
        silhouette: s.silhouette.trim() || undefined,
        targetYieldUnits: s.targetYieldUnits ?? undefined,
        cuttingEfficiencyPct: s.cuttingEfficiencyPct ?? undefined,
        dxfUrl: s.dxfUrl.trim() || undefined,
        stitchProtocol: s.stitchProtocol.trim() || undefined,
        laydownProtocol: s.laydownProtocol.trim() || undefined,
      },
      this.specOpen,
    );
  }

  openMeasures(): void {
    const graded = this.pack()?.['gradedMeasurements'];
    this.measuresJson = graded ? JSON.stringify(graded, null, 2) : '';
    this.resetForm();
    this.measuresOpen.set(true);
  }

  /** The measurements as an object keyed by size, or null when what was typed is not one. */
  private parsedMeasures(): Record<string, unknown> | null {
    try {
      const parsed: unknown = JSON.parse(this.measuresJson);
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  measuresError(): string {
    if (!this.submitted()) return '';
    if (!this.measuresJson.trim()) return 'Enter the measurements.';
    return this.parsedMeasures()
      ? ''
      : 'This is not valid JSON. Check the brackets, quotes and commas.';
  }

  saveMeasures(): void {
    this.submitted.set(true);
    const gradedMeasurements = this.parsedMeasures();
    if (!gradedMeasurements) return;
    void this.save({ gradedMeasurements }, this.measuresOpen);
  }

  /** Every save is a new revision. Saving over an approved pack un-approves it, so that is confirmed. */
  private async save(
    body: Record<string, unknown>,
    drawer: { set(open: boolean): void },
  ): Promise<void> {
    const pack = this.pack();
    if (!pack) return;
    if (this.state() === 'approved') {
      const ok = await this.confirm.ask({
        title: `Save a new revision of the approved tech pack for ${this.sku()}?`,
        consequence: `The pack returns to draft, so revision ${this.revision()} stops being the shop-floor reference until the new revision is approved. Revision ${this.revision()} stays in the history.`,
        confirmLabel: 'Save revision',
      });
      if (!ok) return;
    }
    this.saving.set(true);
    this.saveError.set('');
    this.api.updateTechPack(pack['id'] as string, body).subscribe({
      next: (updated) => {
        this.saving.set(false);
        drawer.set(false);
        this.pack.set(updated);
        this.loadRevisions();
        this.toast.show(`Revision ${revisionNumber(updated)} saved`);
      },
      error: (err) => {
        this.saving.set(false);
        this.saveError.set(err?.error?.message ?? 'The server did not respond.');
      },
    });
  }

  private resetForm(): void {
    this.submitted.set(false);
    this.saveError.set('');
  }
}
