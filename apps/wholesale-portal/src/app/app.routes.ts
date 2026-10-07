import { Routes } from '@angular/router';

/**
 * Every page is lazily loaded. The portal is one signed-in journey but a buyer
 * only visits a couple of screens per session, so keeping all nine page bundles
 * out of the initial download matters — the eager version pushed the initial
 * bundle past its size budget.
 */
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home.page').then((m) => m.HomePage),
    title: 'Seentair Wholesale: Home',
  },
  {
    path: 'catalogue',
    loadComponent: () => import('./pages/catalogue.page').then((m) => m.CataloguePage),
    title: 'Seentair Wholesale: Catalogue',
  },
  {
    path: 'catalogue/:id/matrix',
    loadComponent: () => import('./pages/matrix.page').then((m) => m.MatrixPage),
    title: 'Seentair Wholesale: Bulk Order Form',
  },
  {
    path: 'cart',
    loadComponent: () => import('./pages/cart.page').then((m) => m.CartPage),
    title: 'Seentair Wholesale: Bulk Cart & Checkout',
  },
  {
    path: 'orders',
    loadComponent: () => import('./pages/orders.page').then((m) => m.OrdersPage),
    title: 'Seentair Wholesale: Orders & Invoices',
  },
  {
    path: 'orders/:id/invoice',
    loadComponent: () => import('./pages/invoice-detail.page').then((m) => m.InvoiceDetailPage),
    title: 'Seentair Wholesale: Invoice',
  },
  {
    path: 'orders/:id/tracking',
    loadComponent: () => import('./pages/tracking.page').then((m) => m.TrackingPage),
    title: 'Seentair Wholesale: Order Tracking',
  },
  {
    path: 'custom',
    loadComponent: () => import('./pages/custom.page').then((m) => m.CustomPage),
    title: 'Seentair Wholesale: Custom Designs',
  },
  {
    path: 'custom/:id',
    loadComponent: () => import('./pages/custom-status.page').then((m) => m.CustomStatusPage),
    title: 'Seentair Wholesale: Custom Request',
  },
  { path: 'invoices', redirectTo: 'orders' },
  { path: '**', redirectTo: '' },
];
