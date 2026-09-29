import { Routes } from '@angular/router';
import { LandingPage } from './pages/landing.page';

/**
 * Only the landing page is eager. Everything else loads on navigation: a
 * shopper who lands and reads the hero should not pay for checkout, account and
 * order-tracking code. Keeping these eager is what had the initial bundle
 * sitting on top of its budget.
 */
export const routes: Routes = [
  { path: '', component: LandingPage, title: 'SEENTAIR: Streetwear' },
  {
    path: 'shop',
    loadComponent: () => import('./pages/shop.page').then((m) => m.ShopPage),
    title: 'Seentair: Shop',
  },
  {
    path: 'product/:id',
    loadComponent: () => import('./pages/product.page').then((m) => m.ProductPage),
    title: 'Seentair: Product',
  },
  {
    path: 'cart',
    loadComponent: () => import('./pages/cart.page').then((m) => m.CartPage),
    title: 'Seentair: Cart',
  },
  {
    path: 'checkout',
    loadComponent: () => import('./pages/checkout.page').then((m) => m.CheckoutPage),
    title: 'Seentair: Checkout',
  },
  {
    path: 'account',
    loadComponent: () => import('./pages/account.page').then((m) => m.AccountPage),
    title: 'Seentair: Account',
  },
  {
    path: 'reset-password',
    loadComponent: () => import('./pages/reset-password.page').then((m) => m.ResetPasswordPage),
    title: 'Seentair: Reset password',
  },
  {
    path: 'orders/:id',
    loadComponent: () => import('./pages/order.page').then((m) => m.OrderPage),
    title: 'Seentair: Order tracking',
  },
  {
    path: 'verify-email',
    loadComponent: () => import('./pages/verify-email.page').then((m) => m.VerifyEmailPage),
    title: 'Seentair: Confirm your email',
  },
  {
    path: 'policies',
    loadComponent: () => import('./pages/policies.page').then((m) => m.PoliciesPage),
    title: 'Seentair: Store policies',
  },
  { path: '**', redirectTo: '' },
];
