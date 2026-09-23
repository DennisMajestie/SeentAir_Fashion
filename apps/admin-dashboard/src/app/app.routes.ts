import { Routes } from '@angular/router';
import { AccountingAdminPage } from './pages/accounting.page';
import { ApprovalsPage } from './pages/approvals.page';
import { AuditPage } from './pages/audit.page';
import { CatalogueAdminPage } from './pages/catalogue.page';
import { CustomAdminPage } from './pages/custom-orders.page';
import { DashboardPage } from './pages/dashboard.page';
import { InventoryAdminPage } from './pages/inventory.page';
import { PartnersAdminPage } from './pages/partners.page';
import { ReviewsAdminPage } from './pages/reviews.page';
import { LogisticsAdminPage } from './pages/logistics.page';
import { MarketingAdminPage } from './pages/marketing.page';
import { MaterialsAdminPage } from './pages/materials.page';
import { OrdersPage } from './pages/orders.page';
import { ProductionPage } from './pages/production.page';
import { ReturnsPage } from './pages/returns.page';
import { SecurityPage } from './pages/security.page';
import { StaffAdminPage } from './pages/staff.page';
import { TechPackPage } from './pages/tech-pack.page';
import { VendorsAdminPage } from './pages/vendors.page';
import { FloorKioskPage } from './pages/floor-kiosk.page';
import { MessagesPage } from './pages/messages.page';
import { WholesaleAdminPage } from './pages/wholesale.page';

export const routes: Routes = [
  { path: '', component: DashboardPage, title: 'Seentair Ops — Dashboard' },
  { path: 'approvals', component: ApprovalsPage, title: 'Seentair Ops — Approvals' },
  { path: 'production', component: ProductionPage, title: 'Seentair Ops — Production' },
  { path: 'orders', component: OrdersPage, title: 'Seentair Ops — Orders' },
  { path: 'returns', component: ReturnsPage, title: 'Seentair Ops — Returns' },
  { path: 'catalogue', component: CatalogueAdminPage, title: 'Seentair Ops — Catalogue' },
  { path: 'inventory', component: InventoryAdminPage, title: 'Seentair Ops — Inventory' },
  { path: 'reviews', component: ReviewsAdminPage, title: 'Seentair Ops — Reviews' },
  { path: 'partners', component: PartnersAdminPage, title: 'Seentair Ops — Partners' },
  { path: 'materials', component: MaterialsAdminPage, title: 'Seentair Ops — Materials' },
  { path: 'wholesale', component: WholesaleAdminPage, title: 'Seentair Ops — Wholesale' },
  { path: 'custom-orders', component: CustomAdminPage, title: 'Seentair Ops — Custom orders' },
  { path: 'accounting', component: AccountingAdminPage, title: 'Seentair Ops — Accounting' },
  { path: 'staff', component: StaffAdminPage, title: 'Seentair Ops — Staff' },
  { path: 'logistics', component: LogisticsAdminPage, title: 'Seentair Ops — Logistics' },
  { path: 'marketing', component: MarketingAdminPage, title: 'Seentair Ops — Marketing' },
  { path: 'tech-pack', component: TechPackPage, title: 'Seentair Ops — Tech pack' },
  { path: 'vendors', component: VendorsAdminPage, title: 'Seentair Ops — Procurement' },
  { path: 'floor-kiosk', component: FloorKioskPage, title: 'Seentair Ops — Floor kiosk' },
  { path: 'messages', component: MessagesPage, title: 'Seentair Ops — Messages' },
  { path: 'audit', component: AuditPage, title: 'Seentair Ops — Audit log' },
  { path: 'security', component: SecurityPage, title: 'Seentair Ops — Security' },
  { path: '**', redirectTo: '' },
];
