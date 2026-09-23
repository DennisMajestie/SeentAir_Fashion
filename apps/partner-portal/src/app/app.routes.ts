import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { TokenStore } from './auth-token.store';

/** Session restore happens in the app initializer, so the guard sees the final state. */
const authGuard: CanActivateFn = () => {
  const store = inject(TokenStore);
  const router = inject(Router);
  return store.token() ? true : router.createUrlTree(['/login']);
};

const guestGuard: CanActivateFn = () => {
  const store = inject(TokenStore);
  const router = inject(Router);
  return store.token() ? router.createUrlTree(['/overview']) : true;
};

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login.page').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./shell/portal-shell').then((m) => m.PortalShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'overview' },
      {
        path: 'overview',
        loadComponent: () => import('./pages/overview.page').then((m) => m.OverviewPage),
      },
      {
        path: 'investment',
        loadComponent: () => import('./pages/investment.page').then((m) => m.InvestmentPage),
      },
      {
        path: 'performance',
        loadComponent: () => import('./pages/performance.page').then((m) => m.PerformancePage),
      },
      {
        path: 'inventory',
        loadComponent: () => import('./pages/inventory.page').then((m) => m.InventoryPage),
      },
      {
        path: 'reports',
        loadComponent: () => import('./pages/reports.page').then((m) => m.ReportsPage),
      },
      {
        path: 'profit-sharing',
        loadComponent: () => import('./pages/profit-sharing.page').then((m) => m.ProfitSharingPage),
      },
      {
        path: 'documents',
        loadComponent: () => import('./pages/documents.page').then((m) => m.DocumentsPage),
      },
      {
        path: 'settings',
        loadComponent: () => import('./pages/settings.page').then((m) => m.SettingsPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
