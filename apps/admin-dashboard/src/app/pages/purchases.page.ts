import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  SeButtonDirective,
  SeColumn,
  SeDatePipe,
  SeMoneyPipe,
  SePageComponent,
  SeTableComponent,
} from '@seentair/ui';
import { AdminMaterialPurchase, ApiService } from '../api.service';
import { AccessService } from '../access.service';

@Component({
  selector: 'app-purchases',
  imports: [RouterLink, SeButtonDirective, SeDatePipe, SeMoneyPipe, SePageComponent, SeTableComponent],
  template: `
    <se-page title="Purchasing">
      <a seButton sePageActions routerLink="/materials">Materials</a>
      <se-table
        caption="Material purchases"
        [columns]="columns"
        [rows]="purchases()"
        [loading]="loading()"
        [error]="error()"
        (retry)="load()"
        [pageSize]="25"
        emptyHeading="No material purchases yet"
        emptyText="Approved material receipts will appear here after they are recorded."
      >
        <ng-template seCell="purchasedAt" let-row>
          {{ row.purchasedAt | seDate: 'datetime' }}
        </ng-template>
        <ng-template seCell="material" let-row>
          <a [routerLink]="['/materials', row.material.id]">{{ row.material.name }}</a>
        </ng-template>
        <ng-template seCell="cost" let-row>{{ row.cost | seMoney }}</ng-template>
      </se-table>
      <p class="se-muted">
        Purchases are recorded against materials after approval and update the stock ledger.
        Supplier directories and purchase-order workflows are not part of this section.
      </p>
    </se-page>
  `,
})
export class PurchasesPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly access = inject(AccessService);
  private readonly router = inject(Router);

  readonly purchases = signal<AdminMaterialPurchase[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  readonly columns: SeColumn<AdminMaterialPurchase>[] = [
    { key: 'purchasedAt', header: 'Purchased', sortable: true, value: (row) => row.purchasedAt },
    { key: 'material', header: 'Material', sortable: true, value: (row) => row.material.name },
    {
      key: 'quantity',
      header: 'Quantity',
      numeric: true,
      sortable: true,
      value: (row) => `${row.quantity} ${row.material.unit}`,
    },
    { key: 'cost', header: 'Cost', numeric: true, sortable: true, value: (row) => row.cost },
    { key: 'note', header: 'Note', value: (row) => row.note ?? '' },
  ];

  ngOnInit(): void {
    if (!this.access.can('raw_materials', 'view')) {
      void this.router.navigate(['/']);
      return;
    }
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.materialPurchases().subscribe({
      next: (res) => {
        this.purchases.set(res.data);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Material purchases could not be loaded.');
        this.loading.set(false);
      },
    });
  }
}
