import { Routes } from '@angular/router';
import { DashboardPage } from './pages/dashboard.page';

/**
 * Only the dashboard is eager, it is the landing route, so every operator
 * pays for it. The other 21 pages are loaded on navigation, which is what keeps
 * the initial bundle inside its budget: eagerly importing all of them shipped
 * ~750 kB up front for a handful of screens any single operator ever opens.
 */
export const routes: Routes = [
  { path: '', component: DashboardPage, title: 'Seentair Ops: Dashboard' },
  {
    path: 'approvals',
    loadComponent: () => import('./pages/approvals.page').then((m) => m.ApprovalsPage),
    title: 'Seentair Ops: Approvals',
  },
  {
    path: 'production',
    loadComponent: () => import('./pages/production.page').then((m) => m.ProductionPage),
    title: 'Seentair Ops: Production',
  },
  {
    path: 'orders',
    loadComponent: () => import('./pages/orders.page').then((m) => m.OrdersPage),
    title: 'Seentair Ops: Orders',
  },
  {
    path: 'orders/:id',
    loadComponent: () => import('./pages/order-detail.page').then((m) => m.OrderDetailPage),
    title: 'Seentair Ops: Order',
  },
  {
    path: 'returns',
    loadComponent: () => import('./pages/returns.page').then((m) => m.ReturnsPage),
    title: 'Seentair Ops: Returns',
  },
  {
    path: 'catalogue',
    loadComponent: () => import('./pages/catalogue.page').then((m) => m.CatalogueAdminPage),
    title: 'Seentair Ops: Catalogue',
  },
  {
    path: 'inventory',
    loadComponent: () => import('./pages/inventory.page').then((m) => m.InventoryAdminPage),
    title: 'Seentair Ops: Inventory',
  },
  {
    path: 'reviews',
    loadComponent: () => import('./pages/reviews.page').then((m) => m.ReviewsAdminPage),
    title: 'Seentair Ops: Reviews',
  },
  {
    path: 'partners',
    loadComponent: () => import('./pages/partners.page').then((m) => m.PartnersAdminPage),
    title: 'Seentair Ops: Partners',
  },
  {
    path: 'materials',
    loadComponent: () => import('./pages/materials.page').then((m) => m.MaterialsAdminPage),
    title: 'Seentair Ops: Materials',
  },
  {
    path: 'wholesale',
    loadComponent: () => import('./pages/wholesale.page').then((m) => m.WholesaleAdminPage),
    title: 'Seentair Ops: Wholesale',
  },
  {
    path: 'custom-orders',
    loadComponent: () => import('./pages/custom-orders.page').then((m) => m.CustomAdminPage),
    title: 'Seentair Ops: Custom orders',
  },
  {
    path: 'accounting',
    loadComponent: () => import('./pages/accounting.page').then((m) => m.AccountingAdminPage),
    title: 'Seentair Ops: Accounting',
  },
  {
    path: 'staff',
    loadComponent: () => import('./pages/staff.page').then((m) => m.StaffAdminPage),
    title: 'Seentair Ops: Staff',
  },
  {
    path: 'logistics',
    loadComponent: () => import('./pages/logistics.page').then((m) => m.LogisticsAdminPage),
    title: 'Seentair Ops: Logistics',
  },
  {
    path: 'marketing',
    loadComponent: () => import('./pages/marketing.page').then((m) => m.MarketingAdminPage),
    title: 'Seentair Ops: Marketing',
  },
  {
    path: 'tech-pack',
    loadComponent: () => import('./pages/tech-pack.page').then((m) => m.TechPackPage),
    title: 'Seentair Ops: Tech pack',
  },
  {
    path: 'vendors',
    loadComponent: () => import('./pages/vendors.page').then((m) => m.VendorsAdminPage),
    title: 'Seentair Ops: Procurement',
  },
  {
    path: 'floor-kiosk',
    loadComponent: () => import('./pages/floor-kiosk.page').then((m) => m.FloorKioskPage),
    title: 'Seentair Ops: Floor kiosk',
  },
  {
    path: 'messages',
    loadComponent: () => import('./pages/messages.page').then((m) => m.MessagesPage),
    title: 'Seentair Ops: Messages',
  },
  {
    path: 'audit',
    loadComponent: () => import('./pages/audit.page').then((m) => m.AuditPage),
    title: 'Seentair Ops: Audit log',
  },
  {
    path: 'security',
    loadComponent: () => import('./pages/security.page').then((m) => m.SecurityPage),
    title: 'Seentair Ops: Security',
  },
  { path: '**', redirectTo: '' },
];
