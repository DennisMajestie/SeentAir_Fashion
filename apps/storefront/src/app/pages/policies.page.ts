import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Store policies — the rules the API already enforces, stated for shoppers.
    Content mirrors the approved business rules; keep the two in sync. */
@Component({
  selector: 'app-policies',
  imports: [RouterLink],
  template: `
    <div class="policies">
      <p class="page-kicker">Store policies</p>
      <h1 class="page-title">How ordering works</h1>

      <section id="shipping" class="policy-block">
        <h2>Shipping &amp; dispatch</h2>
        <p>Every order is packed at our Aba, Abia State atelier and dispatched with
          <strong>GIGL</strong> — parcels ship nationwide, and Lagos deliveries typically
          leave within 24 hours of payment.
          You get a tracking reference by notification as soon as your parcel is handed
          to the carrier, and every movement is visible on your
          <a routerLink="/account">order page</a>.</p>
      </section>

      <section id="returns" class="policy-block">
        <h2>Returns — the 12-hour window</h2>
        <p>If a piece arrives wrong or damaged, request a return
          <strong>within 12 hours of receiving it</strong> from your order page. Once
          accepted, the return completes within 24 hours. Items must be unworn with
          tags attached.</p>
        <p class="muted">Custom and made-to-order pieces are cut for you and are
          excluded from returns.</p>
      </section>

      <section id="payments" class="policy-block">
        <h2>Payments</h2>
        <p>We take <strong>full payment upfront</strong> — no part-payments or pay-on-delivery.
          Card and bank-transfer payments are processed securely by
          <strong>Paystack</strong>; we never see or store your card details. Prices are in
          Nigerian Naira (₦).</p>
      </section>

      <section id="contact" class="policy-block">
        <h2>Contact</h2>
        <p>Questions about an order, wholesale (20-unit minimum), or a custom
          commission:</p>
        <ul>
          <li>Email — <a href="mailto:hello@seentair.com">hello@seentair.com</a></li>
          <li>WhatsApp — order and dispatch updates arrive there automatically if
            you add your phone number at checkout</li>
          <li>Atelier — Yaba, Lagos (visits by appointment)</li>
        </ul>
      </section>
    </div>
  `,
})
export class PoliciesPage {}
