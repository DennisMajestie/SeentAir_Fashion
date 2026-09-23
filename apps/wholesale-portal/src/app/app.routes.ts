import { Routes } from '@angular/router';
import { CartPage } from './pages/cart.page';
import { CataloguePage } from './pages/catalogue.page';
import { CustomPage } from './pages/custom.page';
import { CustomStatusPage } from './pages/custom-status.page';
import { HomePage } from './pages/home.page';
import { InvoiceDetailPage } from './pages/invoice-detail.page';
import { MatrixPage } from './pages/matrix.page';
import { OrdersPage } from './pages/orders.page';
import { TrackingPage } from './pages/tracking.page';

export const routes: Routes = [
  { path: '', component: HomePage, title: 'Seentair Wholesale — Home' },
  { path: 'catalogue', component: CataloguePage, title: 'Seentair Wholesale — Catalogue' },
  { path: 'catalogue/:id/matrix', component: MatrixPage, title: 'Seentair Wholesale — Bulk Order Form' },
  { path: 'cart', component: CartPage, title: 'Seentair Wholesale — Bulk Cart & Checkout' },
  { path: 'orders', component: OrdersPage, title: 'Seentair Wholesale — Orders & Invoices' },
  { path: 'orders/:id/invoice', component: InvoiceDetailPage, title: 'Seentair Wholesale — Invoice' },
  { path: 'orders/:id/tracking', component: TrackingPage, title: 'Seentair Wholesale — Order Tracking' },
  { path: 'custom', component: CustomPage, title: 'Seentair Wholesale — Custom Designs' },
  { path: 'custom/:id', component: CustomStatusPage, title: 'Seentair Wholesale — Custom Request' },
  { path: 'invoices', redirectTo: 'orders' },
  { path: '**', redirectTo: '' },
];
