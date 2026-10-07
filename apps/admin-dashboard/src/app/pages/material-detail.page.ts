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
  MaterialRow,
  StockMovement,
  categoryLabel,
  errorText,
  movementEntries,
  stockState,
  units,
} from './stock-format';

const NEW_PURCHASE = { quantity: 0, cost: 0, note: '', supplierName: '', leadTimeDays: 0 };

/**
 * One raw material: its stock, its purchase and usage history (the movement
 * ledger), and the two things recorded against it. A purchase is
 * approval-gated: the request is raised first, then the purchase is recorded.
 */
@Component({
  selector: 'app-material-detail',
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
      [title]="material()?.name ?? 'Material'"
      [breadcrumbs]="[
        { label: 'Materials', link: '/materials' },
        { label: material()?.name ?? '' },
      ]"
    >
      @if (material()) {
        <se-status sePageStatus kind="stock" [value]="state()" />
      }
      @if (material() && access.can('raw_materials', 'full')) {
        <ng-container sePageActions>
          <button seButton type="button" (click)="open('usage')">Record usage</button>
          <button seButton variant="primary" type="button" (click)="open('purchase')">
            Record purchase
          </button>
        </ng-container>
      }
      @if (material(); as m) {
        <div class="se-detail">
          <div class="se-detail__main">
            <se-card title="Purchase and usage history">
              <se-activity [entries]="history()" emptyText="No purchases or usage recorded yet." />
            </se-card>
          </div>
          <aside class="se-detail__aside">
            <se-card title="Details">
              <dl seKv>
                <div seKvItem label="Available" numeric>{{ units(m.currentQuantity, m.unit) }}</div>
                <div seKvItem label="Minimum stock level" numeric>
                  {{ units(m.reorderThreshold, m.unit) }}
                </div>
                <div seKvItem label="Category">{{ categoryLabel(m.category) }}</div>
                <div seKvItem label="Storage location">{{ m.storageLocation ?? 'Not set' }}</div>
                @if (lastUnitCost() !== null) {
                  <div seKvItem label="Last unit cost" numeric>{{ lastUnitCost() | seMoney }}</div>
                }
                <div seKvItem label="Stock value" numeric>{{ stockValue() | seMoney }}</div>
              </dl>
            </se-card>
          </aside>
        </div>
      } @else if (error()) {
        <se-banner
          tone="danger"
          title="This material could not be loaded"
          actionLabel="Try again"
          (action)="load()"
        >
          {{ error() }}
        </se-banner>
      } @else {
        <div aria-busy="true"><se-skeleton shape="detail" /></div>
      }

      @if (access.can('raw_materials', 'full')) {
        <se-drawer title="Record purchase" [(open)]="purchaseOpen">
          <form class="se-form" (ngSubmit)="purchase()">
            @if (formError()) {
              <se-banner tone="danger" title="The purchase was not recorded">{{
                formError()
              }}</se-banner>
            }
            @if (approvalId()) {
              <se-banner tone="info" title="Purchase approval requested">
                Management decides in the approvals queue. Record the purchase once it is approved.
              </se-banner>
            }
            <div class="se-form__row">
              <se-field label="Quantity" [hint]="material()?.unit ?? ''" [error]="quantityError()">
                <input seInput type="number" min="1" name="quantity" [(ngModel)]="pu.quantity" />
              </se-field>
              <se-field label="Total cost" [error]="costError()">
                <input seInput type="number" min="0" name="cost" [(ngModel)]="pu.cost" />
              </se-field>
            </div>
            <se-field label="Supplier" optional>
              <input seInput name="supplier" [(ngModel)]="pu.supplierName" />
            </se-field>
            <se-field label="Lead time" hint="Days from order to delivery" optional>
              <input seInput type="number" min="0" name="lead" [(ngModel)]="pu.leadTimeDays" />
            </se-field>
            <se-field label="Note" optional>
              <input seInput name="note" [(ngModel)]="pu.note" />
            </se-field>
          </form>
          <ng-container seDrawerFooter>
            <button seButton type="button" (click)="purchaseOpen.set(false)">Cancel</button>
            <button
              seButton
              variant="primary"
              type="button"
              [loading]="saving()"
              (click)="purchase()"
            >
              {{ approvalId() ? 'Record purchase' : 'Request approval' }}
            </button>
          </ng-container>
        </se-drawer>

        <se-drawer title="Record usage" [(open)]="usageOpen">
          <form class="se-form" (ngSubmit)="usage()">
            <se-field label="Quantity used" [hint]="material()?.unit ?? ''" [error]="usedError()">
              <input seInput type="number" min="1" name="used" [(ngModel)]="us.quantityUsed" />
            </se-field>
            <se-field label="Production batch ID" optional>
              <input seInput name="batch" [(ngModel)]="us.batchId" />
            </se-field>
          </form>
          <ng-container seDrawerFooter>
            <button seButton type="button" (click)="usageOpen.set(false)">Cancel</button>
            <button seButton variant="primary" type="button" [loading]="saving()" (click)="usage()">
              Record usage
            </button>
          </ng-container>
        </se-drawer>
      }
    </se-page>
  `,
})
export class MaterialDetailPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly confirm = inject(SeConfirmService);
  private readonly toast = inject(SeToastService);
  readonly access = inject(AccessService);
  readonly categoryLabel = categoryLabel;
  readonly units = units;
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';

  readonly material = signal<MaterialRow | null>(null);
  readonly movements = signal<StockMovement[]>([]);
  readonly error = signal('');
  readonly lastUnitCost = signal<number | null>(null);
  readonly stockValue = signal(0);
  readonly history = computed(() => movementEntries(this.movements(), this.material()?.unit));
  readonly state = computed(() => {
    const m = this.material();
    return m ? stockState(m.currentQuantity, m.lowStock) : '';
  });

  readonly purchaseOpen = signal(false);
  readonly usageOpen = signal(false);
  readonly saving = signal(false);
  readonly quantityError = signal('');
  readonly costError = signal('');
  readonly usedError = signal('');
  readonly formError = signal('');
  readonly approvalId = signal('');
  pu = { ...NEW_PURCHASE };
  us = { quantityUsed: 0, batchId: '' };

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.api.material(this.id).subscribe({
      next: (m) => {
        this.material.set(m as unknown as MaterialRow);
        this.error.set('');
      },
      error: (err) => {
        if (!this.material()) this.error.set(errorText(err, LOAD_FAILED));
      },
    });
    this.api.movements(this.id, 'material').subscribe({
      next: (res) => this.movements.set(res.data as unknown as StockMovement[]),
      error: () => undefined,
    });
    this.api.materialsValuation().subscribe({
      next: (res) => {
        const v = res.find((row) => row.id === this.id);
        this.lastUnitCost.set(v?.lastUnitCost ?? null);
        this.stockValue.set(Number(v?.currentValue) || 0);
      },
      error: () => undefined,
    });
  }

  open(form: 'purchase' | 'usage'): void {
    this.formError.set('');
    this.quantityError.set('');
    this.costError.set('');
    this.usedError.set('');
    (form === 'purchase' ? this.purchaseOpen : this.usageOpen).set(true);
  }

  async purchase(): Promise<void> {
    const m = this.material();
    if (!m) return;
    const quantity = Number(this.pu.quantity);
    this.quantityError.set(quantity > 0 ? '' : 'Enter how much was bought.');
    this.costError.set(Number(this.pu.cost) >= 0 ? '' : 'Enter what it cost.');
    if (this.quantityError() || this.costError()) return;
    this.formError.set('');
    const what = `${units(quantity, m.unit)} of ${m.name}`;
    if (!this.approvalId()) {
      const ok = await this.confirm.ask({
        title: `Request approval to buy ${what}?`,
        consequence:
          'Purchasing is approval-gated. The request goes to the approvals queue; nothing is bought and no stock changes until management approves it and you record the purchase. The request is audited.',
        confirmLabel: 'Request approval',
      });
      if (!ok) return;
      this.saving.set(true);
      this.api
        .createApproval('purchasing', {
          material: m.name,
          quantity: this.pu.quantity,
          cost: this.pu.cost,
        })
        .subscribe({
          next: (res) => {
            this.saving.set(false);
            this.approvalId.set(res.id);
            this.toast.show('Purchase approval requested');
          },
          error: (err) => this.failed(err, 'The approval could not be requested.'),
        });
      return;
    }
    const ok = await this.confirm.ask({
      title: `Record the purchase of ${what}?`,
      consequence: `Stock rises by ${units(quantity, m.unit)}. The purchase is a permanent, audited entry in the stock ledger: it cannot be edited or deleted afterwards.`,
      confirmLabel: 'Record purchase',
    });
    if (!ok) return;
    this.saving.set(true);
    this.api
      .recordPurchase(m.id, {
        quantity,
        cost: Number(this.pu.cost),
        note: this.pu.note || undefined,
        approvalRequestId: this.approvalId(),
        supplierName: this.pu.supplierName || undefined,
        leadTimeDays: this.pu.leadTimeDays ? Number(this.pu.leadTimeDays) : undefined,
      })
      .subscribe({
        next: () => {
          this.pu = { ...NEW_PURCHASE };
          this.approvalId.set('');
          this.done(this.purchaseOpen, 'Purchase recorded');
        },
        error: (err) =>
          this.failed(err, 'The purchase is not approved yet. Check the approvals queue.'),
      });
  }

  async usage(): Promise<void> {
    const m = this.material();
    if (!m) return;
    const used = Number(this.us.quantityUsed);
    this.usedError.set(used > 0 ? '' : 'Enter how much was used.');
    if (this.usedError()) return;
    const ok = await this.confirm.ask({
      title: `Record usage of ${units(used, m.unit)} of ${m.name}?`,
      consequence: `Stock falls by ${units(used, m.unit)}. Usage is a permanent, audited entry in the stock ledger: it cannot be edited or deleted afterwards.`,
      confirmLabel: 'Record usage',
    });
    if (!ok) return;
    this.saving.set(true);
    this.api
      .recordUsage(m.id, { quantityUsed: used, batchId: this.us.batchId || undefined })
      .subscribe({
        next: () => {
          this.us = { quantityUsed: 0, batchId: '' };
          this.done(this.usageOpen, 'Usage recorded');
        },
        error: (err) => {
          this.saving.set(false);
          this.usedError.set(errorText(err, 'The usage could not be recorded. Try again.'));
        },
      });
  }

  private done(drawer: { set(open: boolean): void }, text: string): void {
    this.saving.set(false);
    drawer.set(false);
    this.toast.show(text);
    this.load();
  }

  private failed(err: unknown, fallback: string): void {
    this.saving.set(false);
    this.formError.set(errorText(err, fallback));
  }
}
