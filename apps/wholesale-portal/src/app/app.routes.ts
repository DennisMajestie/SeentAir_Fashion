import { Routes } from '@angular/router';
import { CataloguePage } from './pages/catalogue.page';
import { CustomPage } from './pages/custom.page';
import { InvoicesPage } from './pages/invoices.page';

export const routes: Routes = [
  { path: '', component: CataloguePage, title: 'Seentair Wholesale — Catalogue' },
  { path: 'invoices', component: InvoicesPage, title: 'Seentair Wholesale — Invoices' },
  { path: 'custom', component: CustomPage, title: 'Seentair Wholesale — Custom Designs' },
  { path: '**', redirectTo: '' },
];
