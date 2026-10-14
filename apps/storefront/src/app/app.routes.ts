import { Routes } from '@angular/router';
import { LandingPage } from './pages/landing.page';

/**
 * Only the landing page is eager. Everything else loads on navigation: a
 * shopper who lands and reads the hero should not pay for checkout, account and
 * order-tracking code. Keeping these eager is what had the initial bundle
 * sitting on top of its budget.
 */
export const routes: Routes = [
  {
    path: '',
    component: LandingPage,
    title: 'SEENTAIR: Streetwear',
    // The campaign carousel belongs to the landing page only. Declaring it here
    // rather than in the shell is what stops it appearing above the cart,
    // checkout, account, order-tracking and policy screens.
    data: { hero: true },
  },
  {
    path: 'shop',
    loadComponent: () => import('./pages/shop.page').then((m) => m.ShopPage),
    title: 'Seentair: Shop',
    // Not immersive: shop keeps the full site chrome (mobile or desktop header)
    // so a shopper can reach the cart, account and search directly from a
    // product listing instead of backing out first. It previously opted out via
    // `immersive: true` and showed a compact back-link bar instead.
    // ...but it opts out of the promises tiles: the listing is already a dense
    // filter/sort surface and those four links push the grid further down.
    data: { promises: false },
  },
  {
    path: 'product/:id',
    loadComponent: () => import('./pages/product.page').then((m) => m.ProductPage),
    title: 'Seentair: Product',
    // Not immersive: the product page keeps the full site chrome (mobile or
    // desktop header plus the promises row) so a shopper can reach the cart,
    // account and search without going back first. It no longer renders its
    // own app-back-header bar.
    // ...but it opts out of the promises tiles: a shopper reading a product is
    // already looking at what those four links advertise.
    data: { promises: false },
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
