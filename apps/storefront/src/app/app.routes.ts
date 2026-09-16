import { Routes } from '@angular/router';
import { AccountPage } from './pages/account.page';
import { CartPage } from './pages/cart.page';
import { CheckoutPage } from './pages/checkout.page';
import { LandingPage } from './pages/landing.page';
import { OrderPage } from './pages/order.page';
import { ProductPage } from './pages/product.page';
import { ShopPage } from './pages/shop.page';

export const routes: Routes = [
  { path: '', component: LandingPage, title: 'SEENTAIR — Streetwear' },
  { path: 'shop', component: ShopPage, title: 'Seentair — Shop' },
  { path: 'product/:id', component: ProductPage, title: 'Seentair — Product' },
  { path: 'cart', component: CartPage, title: 'Seentair — Cart' },
  { path: 'checkout', component: CheckoutPage, title: 'Seentair — Checkout' },
  { path: 'account', component: AccountPage, title: 'Seentair — Account' },
  { path: 'orders/:id', component: OrderPage, title: 'Seentair — Order tracking' },
  { path: '**', redirectTo: '' },
];
