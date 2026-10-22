import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterOutlet } from '@angular/router';
import {
  SeButtonDirective,
  SeConfirmService,
  SeIconComponent,
  SeNavGroup,
  SeShellComponent,
  SeToastService,
} from '@seentair/ui';
import { ApiService } from './api.service';
import { CartService } from './cart.service';
import { ThemeService } from './theme.service';

/**
 * Wholesale portal shell. Signed in, the buyer gets the shared shell with one
 * flat list of destinations and the bulk cart's unit count on its item. The
 * sign-in / apply screen below it is the approved W1 screen and keeps its own
 * styles.
 */
@Component({
  selector: 'app-root',
  imports: [FormsModule, RouterLink, RouterOutlet, SeButtonDirective, SeIconComponent, SeShellComponent],
  template: `
    @if (api.isLoggedIn) {
      <se-shell
        appName="Seentair Wholesale"
        [nav]="nav()"
        [user]="shellUser()"
        [(collapsed)]="collapsed"
        (signOut)="logout()"
      >
        <button
          seButton
          variant="ghost"
          iconOnly
          seShellActions
          type="button"
          [attr.aria-label]="
            theme.theme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
          "
          (click)="theme.toggle()"
        >
          <se-icon [name]="theme.theme() === 'dark' ? 'sun' : 'moon'" />
        </button>
        <router-outlet />
      </se-shell>
    } @else {
      <main class="auth-main">
        <section class="auth-screen">
          <header class="ws-header" [class.scrolled]="scrolled()">
            <div class="wordmark-row">
              <!-- Copied from the storefront's site header: sticky bar, solid
                   theme-following surface, hairline underneath, wordmark
                   leading, controls trailing. Each app keeps its own controls
                   and its own logo asset. -->
              <!-- Logo removed -->
              <!-- The site header is hidden while logged out, so the theme
                   toggle has to live here too or a dark-mode visitor has no
                   way to switch before signing in. -->
              <div class="header-actions">
                <button
                  class="theme-toggle"
                  type="button"
                  [attr.aria-label]="
                    theme.theme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
                  "
                  [attr.title]="theme.theme() === 'dark' ? 'Light mode' : 'Dark mode'"
                  (click)="theme.toggle()"
                >
                  @if (theme.theme() === 'dark') {
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.6"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <circle cx="12" cy="12" r="4" />
                      <path
                        d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
                      />
                    </svg>
                  } @else {
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.6"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
                    </svg>
                  }
                </button>
                <div class="secure">
                  <span class="material-symbols-outlined" aria-hidden="true">lock</span>
                  <span>Secured connection</span>
                </div>
              </div>
            </div>
          </header>

          <div class="auth-card">
            <!--
              Branded half. Gated on a signal rather than a media query: nothing
              in it is an image (this app has no sign-in photograph at all), but
              the gate keeps the DOM honest about which layout is live. Both
              circles are brand-tinted discs for the same reason -- there is no
              product photography to crop in this app, and none may be generated.
            -->
            @if (isDesktop()) {
              <aside class="auth-brand" aria-hidden="true">
                <span class="auth-brand__cloud auth-brand__cloud--a"></span>
                <span class="auth-brand__cloud auth-brand__cloud--b"></span>
                <span class="auth-brand__cloud auth-brand__cloud--c"></span>

                <div class="auth-brand__copy">
                  <p class="auth-brand__hello">WELCOME</p>
                  <p class="auth-brand__name">SEENTAIR</p>
                  <p class="auth-brand__lede">Sign in to your wholesale account.</p>
                </div>

                <span class="auth-brand__photo auth-brand__photo--seam"></span>
                <span class="auth-brand__photo auth-brand__photo--corner"></span>
                <span class="auth-brand__dot"></span>
              </aside>
            }

            <div class="auth-panel">
              <!-- Logo removed -->

              <div class="auth-tagbar"><span>Wholesale buyers</span></div>

              @if (mode() === 'signin') {
                <h1 class="auth-title">Sign in</h1>
                <p class="auth-sub">Access the bulk order terminal</p>
              } @else {
                <h1 class="auth-title">Apply for wholesale access.</h1>
                <p class="auth-sub">Tell us about your business</p>
              }

            @if (mode() === 'signin') {
              <form class="auth-form" (ngSubmit)="signIn()" novalidate>
                <div class="field">
                  <label for="ws-email">Email</label>
                  <input
                    id="ws-email"
                    type="email"
                    [(ngModel)]="email"
                    name="email"
                    autocomplete="email"
                    inputmode="email"
                    placeholder="orders@store.ng"
                    [attr.aria-invalid]="touched() && !emailValid() ? 'true' : null"
                  />
                  @if (touched() && !emailValid()) {
                    <p class="field-error">Enter a valid email address.</p>
                  }
                </div>

                <div class="field">
                  <div class="label-row">
                    <label for="ws-password">Password</label>
                    <button class="link-inline" type="button" (click)="forgot()">Forgot?</button>
                  </div>
                  <div class="input-affix">
                    <input
                      id="ws-password"
                      [type]="showPassword() ? 'text' : 'password'"
                      [(ngModel)]="password"
                      name="password"
                      autocomplete="current-password"
                      placeholder="••••••••••••"
                    />
                    <button
                      class="affix-btn"
                      type="button"
                      [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'"
                      (click)="showPassword.set(!showPassword())"
                    >
                      {{ showPassword() ? 'Hide' : 'Show' }}
                    </button>
                  </div>
                  @if (touched() && !password) {
                    <p class="field-error">Enter your password.</p>
                  }
                </div>

                <button class="cta auth-submit" type="submit" [disabled]="busy()">
                  <span>{{ busy() ? 'Signing in…' : 'Sign in' }}</span>
                  <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
                </button>

                <p class="auth-fine">Secured connection. Authorised users only.</p>

                @if (error()) {
                  <p class="auth-error" role="alert">{{ error() }}</p>
                }
                @if (info()) {
                  <p class="auth-info" role="status">{{ info() }}</p>
                }
              </form>

              <div class="auth-utilities">
                <button class="link-inline" (click)="forgot()">Forgot password?</button>
                <span class="muted small">|</span>
                <button
                  class="link-inline"
                  (click)="
                    info.set('Support desk is reached on +234 1 888 7400 during operational hours.')
                  "
                >
                  Trouble logging in?
                </button>
              </div>
              <p class="auth-desk">Direct desk: Aba desk +234 1 888 7400</p>
            } @else {
              @if (applyDone(); as submitted) {
                <div class="auth-form">
                  <p class="auth-info" role="status">
                    Application received. Sign in any time to track the review; the Aba desk vets
                    applications within 24 operational hours.
                  </p>
                  <dl class="apply-receipt small">
                    <dt>Applicant</dt>
                    <dd>{{ apply.businessName }}</dd>
                    <dt>Email</dt>
                    <dd>{{ submitted }}</dd>
                    <dt>Location</dt>
                    <dd>{{ apply.city }}, {{ apply.state }}</dd>
                    <dt>Buyer type</dt>
                    <dd>{{ apply.buyerType }}</dd>
                  </dl>
                  <button class="cta auth-submit" type="button" (click)="showSignInForm()">
                    <span>Back to sign in</span>
                    <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
                  </button>
                </div>
              } @else {
                <form class="auth-form" (ngSubmit)="submitApplication()" novalidate>
                  <div class="field">
                    <label for="ap-name">Full name</label>
                    <input
                      id="ap-name"
                      name="apName"
                      autocomplete="name"
                      [(ngModel)]="apply.name"
                      placeholder="Ada Okeke"
                    />
                  </div>

                  <div class="field">
                    <label for="ap-business">Business name</label>
                    <input
                      id="ap-business"
                      name="apBusiness"
                      autocomplete="organization"
                      [(ngModel)]="apply.businessName"
                      placeholder="Okeke Fashion Boutique"
                    />
                  </div>

                  <div class="field">
                    <label for="ap-email">Email</label>
                    <input
                      id="ap-email"
                      name="apEmail"
                      type="email"
                      inputmode="email"
                      autocomplete="email"
                      [(ngModel)]="email"
                      placeholder="orders@store.ng"
                    />
                  </div>

                  <div class="field">
                    <label for="ap-password">Password</label>
                    <input
                      id="ap-password"
                      name="apPassword"
                      [type]="showPassword() ? 'text' : 'password'"
                      autocomplete="new-password"
                      [(ngModel)]="password"
                      placeholder="At least 8 characters"
                    />
                  </div>

                  <div class="field">
                    <label for="ap-type">Buyer type</label>
                    <select id="ap-type" name="apType" [(ngModel)]="apply.buyerType">
                      @for (t of buyerTypes; track t.value) {
                        <option [value]="t.value">{{ t.label }}</option>
                      }
                    </select>
                  </div>

                  <div class="field">
                    <label for="ap-phone">Phone <span class="muted">(optional)</span></label>
                    <input
                      id="ap-phone"
                      name="apPhone"
                      type="tel"
                      inputmode="tel"
                      autocomplete="tel"
                      [(ngModel)]="apply.phone"
                      placeholder="+234 800 000 0000"
                    />
                  </div>

                  <div class="field-pair">
                    <div class="field">
                      <label for="ap-city">City</label>
                      <input
                        id="ap-city"
                        name="apCity"
                        autocomplete="address-level2"
                        [(ngModel)]="apply.city"
                        placeholder="Aba"
                      />
                    </div>
                    <div class="field">
                      <label for="ap-state">State</label>
                      <select id="ap-state" name="apState" [(ngModel)]="apply.state">
                        <option value="">Select…</option>
                        @for (s of states; track s) {
                          <option [value]="s">{{ s }}</option>
                        }
                      </select>
                    </div>
                  </div>

                  <div class="field">
                    <label for="ap-volume">
                      Opening order estimate
                      <span class="muted">(units, optional)</span>
                    </label>
                    <input
                      id="ap-volume"
                      name="apVolume"
                      type="number"
                      inputmode="numeric"
                      min="1"
                      step="1"
                      [(ngModel)]="apply.openingVolume"
                      placeholder="20"
                    />
                    <p class="field-hint">Minimum batch is 20 units per silhouette.</p>
                  </div>

                  <button class="cta auth-submit" type="submit" [disabled]="applyBusy()">
                    <span>{{ applyBusy() ? 'Submitting…' : 'Submit application' }}</span>
                    <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
                  </button>

                  <p class="auth-fine">
                    Your account is created with this application and stays read-only until the
                    factory approves it.
                  </p>

                  @if (error()) {
                    <p class="auth-error" role="alert">{{ error() }}</p>
                  }
                  <p class="apply-back">
                    <button class="link-inline" type="button" (click)="showSignInForm()">
                      Already applied? Back to sign in
                    </button>
                  </p>
                </form>
              }
            }
            </div>
          </div>

          @if (mode() === 'signin') {
            <div class="apply-panel">
              <div class="apply-head">
                <h2 class="muted">Not a wholesale buyer yet?</h2>
                <span class="chip">B2B Criteria</span>
              </div>
              <p class="small muted apply-copy">
                Access is strictly reserved for fashion retailers, streetwear boutiques and verified
                merchandise operators procuring in bulk quantities direct from our Aba factory
                floor.
              </p>
              <div class="criteria">
                <div class="crit">
                  <span class="n">01</span>
                  <div class="txt">
                    <span class="t">Minimum Batch Size</span>
                    <span class="d"
                      >A strict per-silhouette minimum, set by the factory and shown in your rate
                      card once your tier is assigned.</span
                    >
                  </div>
                </div>
                <div class="crit">
                  <span class="n">02</span>
                  <div class="txt">
                    <span class="t">Tiered Manufacturer Rates</span>
                    <span class="d"
                      >Live production pricing calibrated directly in Nigerian Naira
                      (&#8358;).</span
                    >
                  </div>
                </div>
                <div class="crit">
                  <span class="n">03</span>
                  <div class="txt">
                    <span class="t">CAC &amp; Corporate Verification</span>
                    <span class="d"
                      >Requires valid Corporate Affairs Commission (CAC) business credentials.</span
                    >
                  </div>
                </div>
                <div class="crit">
                  <span class="n">04</span>
                  <div class="txt">
                    <span class="t">Dedicated Freight &amp; Logistics</span>
                    <span class="d"
                      >Priority dispatched via intra-state dispatch &amp; interstate haulage
                      routes.</span
                    >
                  </div>
                </div>
              </div>
              <button class="cta outline" type="button" (click)="showApplyForm()">
                <span>Apply for Wholesale Access</span>
                <span class="material-symbols-outlined" aria-hidden="true">assignment_ind</span>
              </button>
              <span class="small muted apply-note"
                >Applications typically vetted within 24 operational hours</span
              >
            </div>
          }

          <div class="status-strip">
            <div class="status-line">
              <span class="dot"></span><span>Aba Mill Status: Online</span>
            </div>
            <span class="run">RUN 04 // 420GSM FLEECE READY</span>
          </div>

          <footer class="auth-footer">
            <p class="legal">Seentair Garments Nigeria Ltd. Aba, Abia State. Strictly B2B.</p>
            <p class="sub">
              All industrial pattern rights and batch allocations reserved. Orders processed in
              Nigerian Naira (&#8358;).
            </p>
          </footer>
        </section>
      </main>
    }
  `,
  styles: [
    `
      /*
       * Split-card sign-in. On the component rather than in styles.scss because it
       * belongs to the logged-out shell only, and because :host-scoped selectors
       * outrank the global .auth-card rules that described the previous
       * frosted-over-photo treatment.
       */

      /* ---------- sign-in bar ----------
         Copied from the storefront's site header: sticky, a theme-following
         surface rather than a frosted wash over a photograph, a hairline
         underneath, the wordmark leading and the controls trailing. z-index 30
         is the storefront's value, and it must stay different from the card's,
         which app.spec.ts asserts. */
      :host .ws-header {
        position: sticky;
        top: 0;
        z-index: 30;
        display: block;
        background: var(--surface-lowest);
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
        border-bottom: 1px solid var(--surface-dim);
        transition: none;
        /* The global rule pads the bar itself; the row carries the measure
           now, so the bar's own padding would double the top gap. */
        padding: 0;
        /* This bar lives inside .auth-main, which is capped at 1060px, so
           without escaping it the bar measured 1028px instead of spanning the
           window. Same escape the storefront uses on its full-bleed surfaces;
           width:auto with negative inline margins rather than 100vw, so a
           scrollbar cannot open a horizontal scrollbar. */
        width: auto;
        margin-inline: calc(50% - 50vw);
        padding-inline: calc(max(0px, (100vw - 1150px) / 2) + clamp(20px, 4vw, 56px));
        padding-top: calc(14px + env(safe-area-inset-top, 0px));
        padding-bottom: 14px;
      }
      :host .ws-header.scrolled {
        border-bottom-color: var(--surface-dim);
      }
      /* The bar now owns the measure, so the row is a plain flex line. */
      :host .ws-header .wordmark-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        width: 100%;
        padding: 0;
        max-width: none;
        margin: 0;
      }
      :host .ws-header .strip-logo {
        display: block;
        line-height: 0;
        flex: none;
      }
      :host .ws-header .strip-logo img {
        display: block;
        /* 50px, aligned across all four apps. */
        height: 50px;
        width: auto;
      }

      /* The old layout was a 620px flex column over a full-bleed photograph: the
         photo is requested by the global rule's ::before, and there is no such
         asset in this app's public folder at all -- styles.scss still asks for
         /assets/form-bg.jpg and gets a 404. The cap and the pseudo-element both
         go, so the card can be the full width the split design wants. */
      :host .auth-screen {
        /* The global .auth-screen rule exists to sit text on a photograph, so it
           reassigns --ink / --muted / --surface-low / --surface-lowest to
           translucent on-photo values inside this subtree. With the photograph
           gone those overrides are actively harmful: --ink becomes near-white
           (invisible on the panel) and --surface-lowest becomes 42% opaque.
           They are restored here to the palette they name at :root. */
        --ink: #1b1c19;
        --muted: #5f5e5e;
        --muted-faint: #c8c6c5;
        --hairline: #e4e2dd;
        --surface-low: #f6f3ee;
        --surface-lowest: #ffffff;

        max-width: none;
        width: 100%;
        display: block;
        min-height: 0;
        margin: 0;
        padding-block: 0;
        isolation: auto;
        color: var(--ink);
        background-image: none;
        background-color: var(--surface);
      }
      :host .auth-screen::before {
        display: none;
      }
      :host .auth-card {
        background: var(--surface-lowest);
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
        border: 0;
        padding: 0;
        display: grid;
        grid-template-columns: 1fr;
        border-radius: 28px;
        overflow: hidden;
        box-shadow:
          0 30px 70px -22px rgb(0 0 0 / 0.26),
          0 8px 24px -14px rgb(0 0 0 / 0.16);
      }
      :host .auth-main {
        width: 100%;
        max-width: 1060px;
        margin: 0 auto;
        /* No top padding: it pushed the bar down to y=38, so the header did not
           sit flush at the viewport top the way the other three do. The card
           below carries its own spacing instead. */
        padding: 0 1rem 2rem;
      }
      :host .auth-split {
        margin-top: clamp(1.2rem, 4vw, 2.4rem);
      }

      /* ---------- branded half ---------- */
      /* No overflow:hidden: the seam disc overhangs onto the form half, and the
         card is what clips at its rounded edge. */
      :host .auth-brand {
        position: relative;
        display: flex;
        flex-direction: column;
        justify-content: center;
        padding: 36px;
        background: linear-gradient(160deg, #1f1a14 0%, #14110e 55%, #100d0b 100%);
        color: #fff;
      }
      :host .auth-brand__cloud {
        position: absolute;
        border-radius: 50%;
        filter: blur(26px);
        pointer-events: none;
      }
      :host .auth-brand__cloud--a {
        width: 210px;
        height: 150px;
        top: -46px;
        left: -34px;
        background: rgb(255 255 255 / 0.07);
      }
      :host .auth-brand__cloud--b {
        width: 180px;
        height: 130px;
        top: 26px;
        right: -56px;
        background: rgb(201 162 75 / 0.12);
      }
      :host .auth-brand__cloud--c {
        width: 200px;
        height: 140px;
        top: 118px;
        left: 52px;
        background: rgb(255 255 255 / 0.045);
      }
      :host .auth-brand__copy {
        position: relative;
        z-index: 2;
      }
      :host .auth-brand__hello {
        margin: 0;
        font-size: clamp(2.4rem, 5.2vw, 3.5rem);
        font-weight: 800;
        line-height: 0.9;
        color: #fff;
        text-shadow: 0 10px 30px rgb(0 0 0 / 0.45);
      }
      :host .auth-brand__name {
        margin: 0.6rem 0 0;
        font-size: 1.125rem;
        font-weight: 700;
        letter-spacing: 0.25em;
        text-transform: uppercase;
        color: #c9a24b;
      }
      /* Narrower than the copy block so the sentence can never run under the
         seam disc, whatever the panel width does. */
      :host .auth-brand__lede {
        margin: 0.85rem 0 0;
        max-width: 240px;
        font-size: 0.8125rem;
        line-height: 1.5;
        color: rgb(255 255 255 / 0.78);
      }
      /* Brand-tinted discs: this app ships no photography and the brief forbids
         generating any, so these stand in for the catalogue photos the other
         two sign-ins use. */
      :host .auth-brand__photo {
        position: absolute;
        z-index: 3;
        border-radius: 50%;
        box-shadow: 0 18px 44px -12px rgb(0 0 0 / 0.6);
      }
      :host .auth-brand__photo--seam {
        width: 152px;
        height: 152px;
        right: -76px;
        top: 40%;
        transform: translateY(-50%);
        border: 3px solid rgb(255 255 255 / 0.85);
        background:
          radial-gradient(circle at 32% 28%, rgb(240 220 174 / 0.9), rgb(201 162 75 / 0.25) 60%),
          linear-gradient(150deg, #2e2718, #14110e);
      }
      :host .auth-brand__photo--corner {
        width: 198px;
        height: 198px;
        left: -66px;
        bottom: -74px;
        border: 3px solid rgb(255 255 255 / 0.22);
        background:
          radial-gradient(circle at 38% 32%, rgb(255 255 255 / 0.16), transparent 58%),
          linear-gradient(150deg, #2a2419, #14110e);
      }
      :host .auth-brand__dot {
        position: absolute;
        z-index: 1;
        left: 44%;
        bottom: 28px;
        width: 106px;
        height: 106px;
        border-radius: 50%;
        background: rgb(255 255 255 / 0.12);
      }

      /* ---------- form half ---------- */
      :host .auth-panel {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        padding: 36px 44px 30px;
        background: var(--surface-lowest);
      }
      :host .auth-logo {
        display: block;
        line-height: 0;
      }
      :host .auth-logo img {
        display: block;
        height: 60px;
        width: auto;
      }
      :host .auth-tagbar {
        margin: 14px 0 0;
      }
      :host .auth-title {
        margin: 0.7rem 0 0;
        font-size: 2rem;
        font-weight: 700;
        line-height: 1.1;
        letter-spacing: -0.02em;
        color: var(--ink);
      }
      :host .auth-sub {
        margin: 0.35rem 0 0;
        font-size: 0.8125rem;
        color: var(--muted);
      }

      :host .auth-form {
        width: 100%;
        max-width: 380px;
        margin-top: 1.4rem;
        text-align: left;
      }
      :host .auth-card input,
      :host .auth-card select {
        height: 48px;
        border-radius: 14px;
        background: var(--surface-low);
        border: 1px solid transparent;
        padding-inline: 44px 16px;
      }
      :host .auth-card select {
        padding-inline: 16px;
      }
      :host .auth-card input:focus-visible,
      :host .auth-card select:focus-visible {
        outline: 2px solid var(--gold-ink);
        outline-offset: 1px;
      }
      :host .auth-card input[aria-invalid='true'] {
        border-color: #ba1a1a;
      }
      :host .auth-card label {
        display: block;
        margin-bottom: 6px;
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--muted);
      }
      :host .auth-card .field,
      :host .auth-card .field-pair {
        margin-bottom: 16px;
      }
      :host .auth-card .field-pair {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0 12px;
      }
      :host .auth-card .field-hint,
      :host .auth-card .field-error {
        margin: 6px 0 0;
        font-size: 0.75rem;
      }
      :host .auth-card .input-affix input {
        padding-right: 48px;
      }
      :host .auth-card .affix-btn {
        min-width: 36px;
        min-height: 36px;
        padding: 0;
        border: 0;
        border-radius: 10px;
        background: none;
        color: var(--muted);
        cursor: pointer;
      }
      :host .auth-card .affix-btn:focus-visible {
        outline: 2px solid var(--gold-ink);
        outline-offset: 1px;
      }

      :host .auth-card .auth-submit {
        width: 100%;
        min-height: 48px;
        border-radius: 12px;
        border: 0;
        font-weight: 700;
        /* Gold fill carries the app's ink, not white: white on #c9a24b is about
           2.1:1 and fails AA, while ink on gold measures 6.9:1. */
        background: var(--gold);
        color: var(--ink);
      }
      :host .auth-card .auth-submit:disabled {
        background: color-mix(in srgb, var(--gold) 42%, var(--surface-low));
        color: var(--muted);
        cursor: not-allowed;
      }

      @media (min-width: 900px) {
        :host .auth-card {
          grid-template-columns: 46% 54%;
        }
      }
      @media (max-width: 1100px) {
        :host .auth-brand {
          padding: 30px;
        }
        :host .auth-brand__photo--seam {
          width: 124px;
          height: 124px;
          right: -62px;
        }
        :host .auth-brand__photo--corner {
          width: 160px;
          height: 160px;
          left: -54px;
          bottom: -60px;
        }
        :host .auth-brand__dot {
          width: 88px;
          height: 88px;
        }
        :host .auth-panel {
          padding: 32px 30px 26px;
        }
      }
      @media (max-width: 899px) {
        :host .auth-panel {
          padding: 24px;
        }
        :host .auth-card .field-pair {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class App implements OnInit {
  readonly api = inject(ApiService);
  readonly cart = inject(CartService);
  readonly theme = inject(ThemeService);
  private readonly confirm = inject(SeConfirmService);
  private readonly toast = inject(SeToastService);
  private readonly onScroll = () => {
    this.scrolled.set((window.scrollY ?? 0) > 10);
  };
/** The sign-in header tightens once the page has scrolled. */
    readonly scrolled = signal(false);
    readonly collapsed = signal(false);
    /** Desktop gate for the sign-in card's branded half. */
    readonly isDesktop = signal(false);
  readonly buyerName = signal<string | null>(null);

  readonly nav = computed<SeNavGroup[]>(() => [
    {
      items: [
        { label: 'Home', icon: 'home', link: '/', exact: true },
        { label: 'Catalogue', icon: 'tag', link: '/catalogue' },
        { label: 'Bulk cart', icon: 'cart', link: '/cart', badge: this.cart.units() || undefined },
        { label: 'Orders & invoices', icon: 'receipt', link: '/orders' },
        { label: 'Custom designs', icon: 'edit', link: '/custom' },
      ],
    },
  ]);
  readonly shellUser = computed(() =>
    this.api.isLoggedIn
      ? { name: this.buyerName() ?? 'Wholesale buyer', role: 'Wholesale buyer' }
      : null,
  );

  constructor() {
    if (typeof window !== 'undefined') {
      this.onScroll();
      window.addEventListener('scroll', this.onScroll, { passive: true });
      // Desktop-only gate for the branded half of the sign-in card. Declared
      // here because this app has no shared ViewportService, and the three
      // frontends have independent node_modules.
      const mql = window.matchMedia('(min-width: 900px)');
      this.isDesktop.set(mql.matches);
      mql.addEventListener('change', (e) => this.isDesktop.set(e.matches));
    }
  }

  ngOnInit(): void {
    if (this.api.isLoggedIn) this.loadProfile();
  }

  private loadProfile(): void {
    this.api.me().subscribe({ next: (m) => this.buyerName.set(m.name), error: () => undefined });
  }

  readonly error = signal<string | null>(null);
  readonly info = signal<string | null>(null);
  readonly showPassword = signal(false);
  readonly busy = signal(false);
  readonly touched = signal(false);
  email = '';
  password = '';

  /**
   * The sign-in card doubles as the application form. A first-time bulk buyer
   * has no account, so making them sign in first dead-ends at the login screen
   * -- which is what the old "Apply for Wholesale Access" button did: it only
   * printed an instruction to sign in and come back.
   */
  readonly mode = signal<'signin' | 'apply'>('signin');
  readonly applyBusy = signal(false);
  readonly applyTouched = signal(false);
  readonly applyDone = signal<string | null>(null);
  apply = {
    name: '',
    businessName: '',
    city: '',
    state: '',
    phone: '',
    buyerType: 'retailer',
    openingVolume: '',
  };

  readonly buyerTypes = [
    { value: 'retailer', label: 'Fashion retailer / boutique' },
    { value: 'online_reseller', label: 'Online reseller' },
    { value: 'institution', label: 'Institution / uniform buyer' },
    { value: 'distributor', label: 'Distributor' },
    { value: 'other', label: 'Other' },
  ];

  readonly states = [
    'Abia',
    'Adamawa',
    'Akwa Ibom',
    'Anambra',
    'Bauchi',
    'Bayelsa',
    'Benue',
    'Borno',
    'Cross River',
    'Delta',
    'Ebonyi',
    'Edo',
    'Ekiti',
    'Enugu',
    'Gombe',
    'Imo',
    'Jigawa',
    'Kaduna',
    'Kano',
    'Katsina',
    'Kebbi',
    'Kogi',
    'Kwara',
    'Lagos',
    'Nasarawa',
    'Niger',
    'Ogun',
    'Ondo',
    'Osun',
    'Oyo',
    'Plateau',
    'Rivers',
    'Sokoto',
    'Taraba',
    'Yobe',
    'Zamfara',
  ];

  /** Returns the first problem, or null when the form is ready to send. */
  applyError(): string | null {
    if (!this.apply.name.trim()) return 'Enter your full name.';
    if (!this.emailValid()) return 'Enter a valid email address.';
    if (this.password.length < 8) return 'Choose a password of at least 8 characters.';
    if (!this.apply.businessName.trim()) return 'Enter your business name.';
    if (!this.apply.city.trim()) return 'Enter your city.';
    if (!this.apply.state) return 'Select your state.';
    if (
      this.apply.openingVolume &&
      (!/^\d+$/.test(this.apply.openingVolume) || +this.apply.openingVolume < 1)
    ) {
      return 'Opening volume must be a whole number of units.';
    }
    return null;
  }

  showApplyForm(): void {
    this.mode.set('apply');
    this.error.set(null);
    this.info.set(null);
    this.applyTouched.set(false);
    this.applyDone.set(null);
  }

  showSignInForm(): void {
    this.mode.set('signin');
    this.error.set(null);
    this.info.set(null);
    this.applyTouched.set(false);
  }

  submitApplication(): void {
    this.applyTouched.set(true);
    this.error.set(null);
    this.info.set(null);
    const problem = this.applyError();
    if (problem) {
      this.error.set(problem);
      return;
    }

    this.applyBusy.set(true);
    const volume = this.apply.openingVolume.trim();
    this.api
      .applyForAccess({
        name: this.apply.name.trim(),
        email: this.email.trim(),
        password: this.password,
        businessName: this.apply.businessName.trim(),
        buyerType: this.apply.buyerType,
        businessPhone: this.apply.phone.trim() || undefined,
        city: this.apply.city.trim(),
        state: this.apply.state,
        openingVolume: volume ? +volume : undefined,
      })
      .subscribe({
        next: () => {
          this.applyBusy.set(false);
          this.applyDone.set(this.email.trim());
          this.password = '';
          this.error.set(null);
        },
        error: (e: { status?: number; error?: { message?: string | string[] } }) => {
          this.applyBusy.set(false);
          const raw = e?.error?.message;
          const first = Array.isArray(raw) ? raw[0] : raw;
          this.error.set(
            e?.status === 429
              ? 'Too many applications from this device. Wait a minute, then try again.'
              : (first ?? 'That application could not be submitted. Try again.'),
          );
        },
      });
  }

  emailValid(): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim());
  }

  signIn(): void {
    this.touched.set(true);
    this.error.set(null);
    this.info.set(null);
    if (!this.emailValid() || !this.password) return;

    this.busy.set(true);
    this.api.login(this.email.trim(), this.password).subscribe({
      next: () => {
        this.busy.set(false);
        this.password = '';
        this.touched.set(false);
        this.error.set(null);
        this.loadProfile();
      },
      error: (e: { status?: number }) => {
        this.busy.set(false);
        this.error.set(
          e?.status === 429
            ? 'Too many attempts. Wait a minute, then try again.'
            : 'That email and password do not match. Try again, or use Forgot.',
        );
      },
    });
  }

  forgot(): void {
    this.error.set(null);
    this.info.set(null);
    if (!this.emailValid()) {
      this.touched.set(true);
      this.error.set('Enter your email address first, then tap Forgot.');
      return;
    }
    this.api.forgotPassword(this.email.trim()).subscribe({
      next: () => this.info.set('If that email is registered, a reset link has been sent.'),
      error: () => this.info.set('If that email is registered, a reset link has been sent.'),
    });
  }

  async logout(): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Sign out?',
      consequence:
        'This wholesale session ends. Your bulk cart and open orders stay in your account for the next sign-in.',
      confirmLabel: 'Sign out',
      cancelLabel: 'Stay',
    });
    if (!ok) return;
    this.api.logout();
    this.buyerName.set(null);
    this.error.set(null);
    this.info.set(null);
    this.password = '';
    this.showPassword.set(false);
    this.toast.show('Signed out of the wholesale portal');
  }
}
