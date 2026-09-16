import { Routes } from '@angular/router';
import { ApprovalsPage } from './pages/approvals.page';
import { AuditPage } from './pages/audit.page';
import { DashboardPage } from './pages/dashboard.page';
import { OrdersPage } from './pages/orders.page';
import { ProductionPage } from './pages/production.page';
import { ReturnsPage } from './pages/returns.page';

export const routes: Routes = [
  { path: '', component: DashboardPage, title: 'Seentair Ops — Dashboard' },
  { path: 'approvals', component: ApprovalsPage, title: 'Seentair Ops — Approvals' },
  { path: 'production', component: ProductionPage, title: 'Seentair Ops — Production' },
  { path: 'orders', component: OrdersPage, title: 'Seentair Ops — Orders' },
  { path: 'returns', component: ReturnsPage, title: 'Seentair Ops — Returns' },
  { path: 'audit', component: AuditPage, title: 'Seentair Ops — Audit log' },
  { path: '**', redirectTo: '' },
];
