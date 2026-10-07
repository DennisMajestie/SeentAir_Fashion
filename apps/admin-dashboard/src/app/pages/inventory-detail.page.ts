import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import {
  SeActivityComponent,
  SeBannerComponent,
  SeButtonDirective,
  SeCardComponent,
  SeConfirmService,
  SeDrawerComponent,
  SeFieldComponent,
  SeInputDirective,
  SeKvDirective,
  SeKvItemComponent,
  SeMoneyPipe,
  SePageComponent,
  SeSkeletonComponent,
  SeStatusComponent,
  SeToastService,
} from '@seentair/ui';
import { AccessService } from '../access.service';
import { ApiService } from '../api.service';
import {
  LOAD_FAILED,
  StockMovement,
  categoryLabel,
  errorText,
  movementEntries,
  signed,
  stockState,
  units,
} from './stock-format';

interface Digest {
  currentQuantity: number;
  expectedQuantity: number;
  runningBalance: number;
  materialCount: number;
}

/**
 * One stock item: what is in stock, every movement that got it there, and the
 * form that records a new movement. Stock is never edited: a movement is a
 * permanent ledger entry, and one that removes stock needs an approval first.
 */
@Component({
  selector: 'app-inventory-detail',
  imports: [
    FormsModule,
    SeActivityComponent,
    SeBannerComponent,
    SeButtonDirective,
    SeCardComponent,
    SeDrawerComponent,
    SeFieldComponent,
    SeInputDirective,
    SeKvDirective,
    SeKvItemComponent,
    SeMoneyPipe,
    SePageComponent,
    SeSkeletonComponent,
    SeStatusComponent,
  ],
  template: `
    <se-page
      [title]="name()"
      [breadcrumbs]="[{ label: 'Inventory', link: '/inventory' }, { label: name() }]"
    >
      @if (quantity() !== null) {
        <se-status sePageStatus kind="stock" [value]="state()" />
      }
      @if (access.can('inventory', 'full') && quantity() !== null) {
        <button seButton variant="primary" sePageActions type="button" (click)="openForm()">
          Record movement
        </button>
      }
      <button seButton sePageActions type="button" [loading]="checking()" (click)="stockCheck()">
        Run stock check
      </button>

      @if (error()) {
        <se-banner
          tone="danger"
          title="This item could not be loaded"
          actionLabel="Try again"
          (action)="load()"
        >
          {{ error() }}
        </se-banner>
      } @else if (quantity() === null) {
        <div aria-busy="true"><se-skeleton shape="detail" /></div>
      } @else {
        <div class="se-detail">
          <div class="se-detail__main">
            @if (digest(); as d) {
              <se-card title="Stock check">
                <dl seKv>
                  <div seKvItem label="In stock now" numeric>{{ d.currentQuantity }}</div>
                  <div seKvItem label="Expected from the ledger" numeric>
                    {{ d.expectedQuantity }}
                  </div>
                  <div seKvItem label="Running balance" numeric>{{ d.runningBalance }}</div>
                  <div seKvItem label="Movements counted" numeric>{{ d.materialCount }}</div>
                </dl>
              </se-card>
            }
            <se-card title="Movement history">
              <se-activity [entries]="history()" emptyText="No movements recorded yet." />
            </se-card>
          </div>
          <aside class="se-detail__aside">
            <se-card title="Details">
              <dl seKv>
                <div seKvItem label="Type">
                  {{ itemType === 'variant' ? 'Finished goods' : 'Raw material' }}
                </div>
                <div seKvItem label="In stock" numeric>{{ units(quantity() ?? 0) }}</div>
                <div seKvItem label="Movements" numeric>{{ ledgerTotal() }}</div>
                @for (fact of facts(); track fact[0]) {
                  <div seKvItem [label]="fact[0]">{{ fact[1] }}</div>
                }
                @if (price() !== null) {
                  <div seKvItem label="Unit price" numeric>{{ price() | seMoney }}</div>
                  <div seKvItem label="Estimated value" numeric>
                    {{ (price() ?? 0) * (quantity() ?? 0) | seMoney }}
                  </div>
                }
              </dl>
            </se-card>
          </aside>
        </div>
      }

      @if (access.can('inventory', 'full')) {
        <se-drawer title="Record movement" [(open)]="formOpen">
          <form class="se-form" (ngSubmit)="submit()">
            @if (formError()) {
              <se-banner tone="danger" title="The movement was not recorded">{{
                formError()
              }}</se-banner>
            }
            @if (approvalId()) {
              <se-banner tone="info" title="Removal approval requested">
                Management decides in the approvals queue. Record the movement once it is approved.
              </se-banner>
            }
            <se-field
              label="Change in units"
              hint="A plus number adds stock, a minus number removes it. Removing stock needs approval."
              [error]="deltaError()"
            >
              <input seInput type="number" name="delta" [(ngModel)]="form.delta" />
            </se-field>
            <se-field label="Reference" hint="For example: stocktake correction" optional>
              <input seInput name="reference" [(ngModel)]="form.reference" />
            </se-field>
          </form>
          <ng-container seDrawerFooter>
            <button seButton type="button" (click)="formOpen.set(false)">Cancel</button>
            <button
              seButton
              variant="primary"
              type="button"
              [loading]="saving()"
              (click)="submit()"
            >
              {{ needsApproval() ? 'Request approval' : 'Record movement' }}
            </button>
          </ng-container>
        </se-drawer>
      }
    </se-page>
  `,
})
export class InventoryDetailPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly confirm = inject(SeConfirmService);
  private readonly toast = inject(SeToastService);
  readonly access = inject(AccessService);
  readonly units = units;

  readonly itemType = this.route.snapshot.paramMap.get('itemType') as 'variant' | 'material';
  readonly itemId = this.route.snapshot.paramMap.get('itemId') ?? '';

  readonly name = signal(this.itemId.slice(0, 8));
  /** Null until the first answer arrives. */
  readonly quantity = signal<number | null>(null);
  readonly movements = signal<StockMovement[]>([]);
  readonly ledgerTotal = signal(0);
  readonly error = signal('');
  readonly price = signal<number | null>(null);
  readonly facts = signal<Array<[string, string]>>([]);
  readonly digest = signal<Digest | null>(null);
  readonly checking = signal(false);
  readonly history = computed(() => movementEntries(this.movements()));
  readonly state = computed(() => stockState(this.quantity() ?? 0));

  readonly formOpen = signal(false);
  readonly saving = signal(false);
  readonly deltaError = signal('');
  readonly formError = signal('');
  readonly approvalId = signal('');
  form = { delta: 0, reference: '' };

  ngOnInit(): void {
    this.load();
    if (this.itemType === 'material') {
      this.api.material(this.itemId).subscribe((m) => {
        const mat = m as { name: string; category: string | null; storageLocation: string | null };
        this.name.set(mat.name);
        this.facts.set([
          ['Category', categoryLabel(mat.category)],
          ['Storage location', mat.storageLocation ?? 'Not set'],
        ]);
      });
    } else {
      this.api.products().subscribe((res) => {
        for (const p of res.data as unknown as Array<{
          name: string;
          basePrice: number;
          variants: Array<Record<string, unknown>>;
        }>) {
          const v = (p.variants ?? []).find((x) => x['id'] === this.itemId);
          if (!v) continue;
          this.name.set(String(v['sku']));
          this.price.set(Number(v['priceOverride'] ?? p.basePrice) || 0);
          this.facts.set([
            ['Product', p.name],
            ['Size', String(v['size'] ?? 'None')],
            ['Colour', String(v['colour'] ?? 'None')],
          ]);
        }
      });
    }
  }

  load(): void {
    this.api.movements(this.itemId, this.itemType).subscribe({
      next: (res) => {
        this.movements.set(res.data as unknown as StockMovement[]);
        this.quantity.set(res.currentQuantity);
        this.ledgerTotal.set(res.total);
        this.error.set('');
      },
      error: (err) => {
        if (this.quantity() === null) this.error.set(errorText(err, LOAD_FAILED));
      },
    });
  }

  stockCheck(): void {
    this.checking.set(true);
    this.api.stockCheckDigest(this.itemType, this.itemId).subscribe({
      next: (res) => {
        this.digest.set(res);
        this.checking.set(false);
      },
      error: () => {
        this.checking.set(false);
        this.toast.show('The stock check could not be run', {
          tone: 'danger',
          action: { label: 'Try again', run: () => this.stockCheck() },
        });
      },
    });
  }

  openForm(): void {
    this.form = { delta: 0, reference: '' };
    this.approvalId.set('');
    this.deltaError.set('');
    this.formError.set('');
    this.formOpen.set(true);
  }

  /** Removing stock is approval-gated: the request comes before the movement. */
  needsApproval(): boolean {
    return Number(this.form.delta) < 0 && !this.approvalId();
  }

  async submit(): Promise<void> {
    const delta = Number(this.form.delta);
    if (!Number.isInteger(delta) || delta === 0) {
      this.deltaError.set('Enter a whole number other than zero, such as 5 or -5.');
      return;
    }
    this.deltaError.set('');
    this.formError.set('');
    if (this.needsApproval()) {
      const ok = await this.confirm.ask({
        title: `Request approval to remove ${units(-delta)} of ${this.name()}?`,
        consequence:
          'Management decides in the approvals queue. No stock moves until the request is approved and you record the movement. The request is audited.',
        confirmLabel: 'Request approval',
      });
      if (!ok) return;
      this.saving.set(true);
      this.api
        .createApproval('stock_disposal', {
          item: this.name(),
          delta: this.form.delta,
          note: this.form.reference,
        })
        .subscribe({
          next: (r) => {
            this.saving.set(false);
            this.approvalId.set(r.id);
            this.toast.show('Removal approval requested');
          },
          error: (err) => this.failed(err, 'The approval could not be requested.'),
        });
      return;
    }
    const ok = await this.confirm.ask({
      title: `Record a movement of ${signed(delta)} on ${this.name()}?`,
      consequence: `Stock changes from ${this.quantity()} to ${(this.quantity() ?? 0) + delta}. A movement is a permanent, audited entry in the stock ledger: it cannot be edited or deleted, only corrected with another movement.`,
      confirmLabel: 'Record movement',
    });
    if (!ok) return;
    this.saving.set(true);
    this.api
      .recordMovement(this.itemId, this.itemType, {
        movementType: 'adjustment',
        quantityDelta: delta,
        referenceId: this.form.reference || undefined,
        approvalRequestId: this.approvalId() || undefined,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.formOpen.set(false);
          this.toast.show('Movement recorded');
          this.load();
        },
        error: (err) =>
          this.failed(err, 'The movement was refused. Removing stock needs an approved request.'),
      });
  }

  private failed(err: unknown, fallback: string): void {
    this.saving.set(false);
    this.formError.set(errorText(err, fallback));
  }
}
