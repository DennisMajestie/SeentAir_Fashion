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
      <div class="w1-app" [attr.data-mode]="mode()">
        <header class="w1-topbar">
          @if (mode() === 'apply' || mode() === 'success') {
            <button type="button" class="w1-toplink" (click)="mode() === 'success' ? showApplyForm() : showSignInForm()">
              <span class="material-symbols-outlined">arrow_back</span>
              {{ mode() === 'success' ? 'Back' : 'Sign in' }}
            </button>
          } @else {
            <div class="w1-topstatus">
              <span class="w1-dot" aria-hidden="true"></span>
              <span class="material-symbols-outlined w1-lock">lock</span>
              <span>256-bit TLS Aba Hub Verified</span>
            </div>
          }
          <div class="w1-topright">
            <span class="w1-chip">{{ mode() === 'apply' ? 'APPLICATION DESK' : mode() === 'success' ? 'RECEIVED' : 'PORTAL 01' }}</span>
            @if (mode() !== 'success') {
              <button
                type="button"
                class="w1-iconbtn"
                [attr.aria-label]="theme.theme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
                (click)="theme.toggle()"
              >
                <span class="material-symbols-outlined">{{ theme.theme() === 'dark' ? 'light_mode' : 'dark_mode' }}</span>
              </button>
            }
          </div>
        </header>

        <main class="w1-main">
          @if (mode() === 'signin') {
            <section class="w1-hero">
              <div class="w1-heroicon"><span class="material-symbols-outlined">precision_manufacturing</span></div>
              <h1>SEENTAIR</h1>
              <p>Aba B2B Wholesale Portal</p>
            </section>

            <div class="w1-notice">
              <span class="material-symbols-outlined">verified_user</span>
              <p><strong>Authorised access only.</strong> Direct manufacturer pricing and Aba line batch allocations are reserved for verified wholesale buyers.</p>
            </div>

            <section class="w1-card">
              <div>
                <h2>Sign in to your desk</h2>
                <p class="w1-sub">Access wholesale catalog, bulk matrices &amp; orders</p>
              </div>

              <form class="w1-form" (ngSubmit)="signIn()" novalidate>
                <label class="w1-field">
                  <span>Registered corporate email</span>
                  <div class="w1-inputwrap">
                    <span class="material-symbols-outlined">business</span>
                    <input
                      type="email"
                      [(ngModel)]="email"
                      name="email"
                      autocomplete="email"
                      inputmode="email"
                      placeholder="buyer@domain.com"
                      [attr.aria-invalid]="touched() && !emailValid() ? 'true' : null"
                    />
                  </div>
                  @if (touched() && !emailValid()) { <p class="w1-error">Enter a valid email address.</p> }
                </label>

                <label class="w1-field">
                  <div class="w1-labelrow">
                    <span>Password</span>
                    <button type="button" class="w1-link" (click)="forgot()">Forgot password?</button>
                  </div>
                  <div class="w1-inputwrap">
                    <span class="material-symbols-outlined">lock</span>
                    <input
                      [type]="showPassword() ? 'text' : 'password'"
                      [(ngModel)]="password"
                      name="password"
                      autocomplete="current-password"
                      placeholder="••••••••••••"
                    />
                    <button type="button" class="w1-affix" [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'" (click)="showPassword.set(!showPassword())">
                      <span class="material-symbols-outlined">{{ showPassword() ? 'visibility_off' : 'visibility' }}</span>
                    </button>
                  </div>
                  @if (touched() && !password) { <p class="w1-error">Enter your password.</p> }
                </label>

                <div class="w1-actions">
                  <button class="w1-btn w1-btn--primary" type="submit" [disabled]="busy()">
                    <span>{{ busy() ? 'Signing in…' : 'Sign in to Wholesale' }}</span>
                    <span class="material-symbols-outlined">arrow_forward</span>
                  </button>
                  <button class="w1-btn w1-btn--secondary" type="button" (click)="showApplyForm()">Apply for Wholesale Access</button>
                </div>

                @if (error()) { <p class="w1-banner w1-banner--error" role="alert">{{ error() }}</p> }
                @if (info()) { <p class="w1-banner w1-banner--info" role="status">{{ info() }}</p> }
              </form>
            </section>

            <section class="w1-criteria">
              <div class="w1-criteria-head">
                <span><span class="material-symbols-outlined">fact_check</span> Aba Factory Criteria</span>
                <span class="w1-mono">MOQ 20 / SILHOUETTE</span>
              </div>
              <div class="w1-criteria-grid">
                <div class="w1-mini">
                  <span class="w1-mono">VOLUME RATE</span>
                  <strong>₦8,500 – ₦16,000</strong>
                  <small>Ex-factory Aba unit cost</small>
                </div>
                <div class="w1-mini">
                  <span class="w1-mono">VERIFICATION</span>
                  <strong>CAC / Tin Required</strong>
                  <small>24hr Desk appraisal</small>
                </div>
              </div>
              <p>Freight handled via GIG Logistics &amp; Red Star Aba Central Hub. 100% upfront invoice settlement prior to cut-and-sew scheduling.</p>
            </section>
          } @else if (mode() === 'apply' && !applyDone()) {
            <section class="w1-intro">
              <span class="w1-pill">WHOLESALE ONBOARDING</span>
              <h1>Apply for Wholesale Access</h1>
              <p>Verified bulk buyers receive tier discounts &amp; dedicated batch scheduling at Aba Mills.</p>
            </section>

            <section class="w1-card">
              <form class="w1-form" (ngSubmit)="submitApplication()" novalidate>
                <label class="w1-field"><span>Full contact name</span><input name="apName" autocomplete="name" [(ngModel)]="apply.name" placeholder="e.g. Chinedu Okafor" /></label>
                <label class="w1-field"><span>Business / Entity name</span><input name="apBusiness" autocomplete="organization" [(ngModel)]="apply.businessName" placeholder="Registered CAC brand name" /></label>
                <div class="w1-grid2">
                  <label class="w1-field"><span>Corporate email</span><input name="apEmail" type="email" inputmode="email" autocomplete="email" [(ngModel)]="email" placeholder="buyer@domain.com" /></label>
                  <label class="w1-field"><span>Phone (WhatsApp)</span><input name="apPhone" type="tel" inputmode="tel" autocomplete="tel" [(ngModel)]="apply.phone" placeholder="+234 803 000 0000" /></label>
                </div>
                <label class="w1-field"><span>Create portal password</span><input name="apPassword" [type]="showPassword() ? 'text' : 'password'" autocomplete="new-password" [(ngModel)]="password" placeholder="At least 8 characters" /></label>
                <label class="w1-field">
                  <span>Buyer type</span>
                  <select name="apType" [(ngModel)]="apply.buyerType">
                    @for (t of buyerTypes; track t.value) { <option [value]="t.value">{{ t.label }}</option> }
                  </select>
                </label>
                <div class="w1-grid2">
                  <label class="w1-field"><span>City</span><input name="apCity" autocomplete="address-level2" [(ngModel)]="apply.city" placeholder="Aba" /></label>
                  <label class="w1-field">
                    <span>State</span>
                    <select name="apState" [(ngModel)]="apply.state">
                      <option value="">Select…</option>
                      @for (s of states; track s) { <option [value]="s">{{ s }}</option> }
                    </select>
                  </label>
                </div>
                <label class="w1-field">
                  <div class="w1-labelrow"><span>Opening order estimate (Units)</span><span class="w1-accent">Min 20 units/silhouette</span></div>
                  <input name="apVolume" type="number" inputmode="numeric" min="1" step="1" [(ngModel)]="apply.openingVolume" placeholder="20" />
                </label>

                <button class="w1-btn w1-btn--primary" type="submit" [disabled]="applyBusy()">
                  <span>{{ applyBusy() ? 'Submitting…' : 'Submit Application' }}</span>
                  <span class="material-symbols-outlined">send</span>
                </button>

                @if (error()) { <p class="w1-banner w1-banner--error" role="alert">{{ error() }}</p> }
              </form>
            </section>
            <p class="w1-terms">By applying, you agree to Seentair B2B wholesale terms: 100% invoice settlement prior to cut-and-sew, verified commercial dispatch, and factory defect exchange window.</p>
          } @else {
            <section class="w1-success-hero">
              <div class="w1-success-icon"><span class="material-symbols-outlined">task_alt</span></div>
              <h1>Application Received</h1>
              <p>Our Aba wholesale desk vets all CAC credentials and commercial references within <strong>24 operational hours</strong>.</p>
            </section>

            <section class="w1-card w1-receipt">
              <div class="w1-receipt-head">
                <span>SUBMITTED DETAILS</span>
                <span class="w1-mono">PENDING REVIEW</span>
              </div>
              <dl class="w1-kv">
                <div><dt>Business</dt><dd>{{ apply.businessName || '—' }}</dd></div>
                <div><dt>Contact</dt><dd>{{ apply.name || '—' }}</dd></div>
                <div><dt>Email</dt><dd class="w1-mono">{{ applyDone() || email }}</dd></div>
                <div><dt>Hub Destination</dt><dd>{{ apply.city || '—' }}, {{ apply.state || '—' }}</dd></div>
                <div><dt>Opening Batch</dt><dd class="w1-accent">{{ apply.openingVolume || '—' }} Units (Estimated)</dd></div>
              </dl>
              <div class="w1-inline-note">
                <span class="material-symbols-outlined">mail</span>
                <span>A temporary activation link will be delivered to your corporate inbox once vetting completes.</span>
              </div>
            </section>

            <div class="w1-actions w1-actions--stack">
              <button class="w1-btn w1-btn--primary" type="button" (click)="showSignInForm()">
                <span>Back to Sign In</span>
                <span class="material-symbols-outlined">arrow_forward</span>
              </button>
            </div>
          }
        </main>

        <footer class="w1-footer">
          @if (mode() === 'signin') {
            <div><span class="w1-dot w1-dot--ok"></span><span>ABA SEWING MILL ACTIVE</span></div>
            <span>SEENTAIR IND. v2.4</span>
          } @else if (mode() === 'apply') {
            <span>SEENTAIR ABA ONBOARDING</span>
            <span>VETTING: 24H SLA</span>
          } @else {
            <span>ABA FACTORY DESK: +234 814 200 9010</span>
            <span>STATUS: PENDING</span>
          }
        </footer>
      </div>
    }
  `,
  styles: [
    `
      :host { display: block; }
      .w1-app {
        min-height: 100vh;
        background: #f7f2ea;
        color: #1b1916;
        display: flex;
        flex-direction: column;
        font-family: 'Urbanist', sans-serif;
      }
      .w1-topbar {
        position: sticky;
        top: 0;
        z-index: 20;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 16px 12px;
        border-bottom: 1px solid rgba(232,225,211,.7);
        background: rgba(247,242,234,.88);
        backdrop-filter: blur(10px);
      }
      .w1-topstatus, .w1-topright { display: flex; align-items: center; gap: 8px; }
      .w1-topstatus { font-size: 12px; color: #7b756a; font-weight: 500; }
      .w1-lock { font-size: 14px; color: #23804d; }
      .w1-dot { width: 8px; height: 8px; border-radius: 999px; background: #23804d; box-shadow: 0 0 0 4px rgba(35,128,77,.12); }
      .w1-dot--ok { display:inline-block; margin-right: 6px; width: 6px; height: 6px; box-shadow:none; }
      .w1-chip {
        font: 600 11px/1.2 'JetBrains Mono', monospace;
        padding: 4px 8px;
        border-radius: 999px;
        border: 1px solid #e8e1d3;
        background: #efe3c8;
        color: #1b1916;
        letter-spacing: .02em;
      }
      .w1-iconbtn, .w1-toplink {
        border: 1px solid #e8e1d3;
        background: #fffdf9;
        color: #7b756a;
        border-radius: 999px;
        height: 32px;
        min-width: 32px;
        padding: 0 10px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        font: 600 13px/1 Urbanist, sans-serif;
      }
      .w1-toplink { height: auto; padding: 6px 10px; }
      .material-symbols-outlined { font-size: 18px; line-height: 1; }
      .w1-main {
        flex: 1;
        width: 100%;
        max-width: 390px;
        margin: 0 auto;
        padding: 20px 16px 16px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .w1-hero, .w1-success-hero { text-align: center; padding-top: 4px; }
      .w1-heroicon, .w1-success-icon {
        width: 48px; height: 48px; margin: 0 auto 10px; border-radius: 16px;
        display: inline-flex; align-items: center; justify-content: center;
        background: #1b1916; color: #c88a12; border: 1px solid #e8e1d3;
      }
      .w1-success-icon { border-radius: 999px; background: rgba(35,128,77,.12); color: #23804d; border-color: rgba(35,128,77,.25); width: 56px; height: 56px; }
      .w1-hero h1 { margin: 0; font: 700 26px/1.1 Urbanist, sans-serif; letter-spacing: -.02em; }
      .w1-success-hero h1, .w1-intro h1 { margin: 4px 0 0; font: 700 22px/1.15 Urbanist, sans-serif; }
      .w1-hero p, .w1-success-hero p, .w1-intro p { margin: 4px 0 0; color: #7b756a; font-size: 13px; }
      .w1-notice, .w1-inline-note {
        display: flex; gap: 10px; align-items: flex-start;
        padding: 14px; border-radius: 12px; border: 1px solid #e8e1d3; background: rgba(239,227,200,.7);
        font-size: 12px; line-height: 1.5;
      }
      .w1-notice .material-symbols-outlined { color: #93600a; }
      .w1-inline-note .material-symbols-outlined { color: #93600a; font-size: 18px; }
      .w1-card {
        background: #fffdf9; border: 1px solid #e8e1d3; border-radius: 12px; padding: 20px;
        box-shadow: 0 8px 24px -4px rgba(27,25,22,.06);
        display: flex; flex-direction: column; gap: 14px;
      }
      .w1-card h2 { margin: 0; font: 700 18px/1.2 Urbanist, sans-serif; }
      .w1-sub { margin: 2px 0 0; color: #7b756a; font-size: 13px; }
      .w1-form { display: flex; flex-direction: column; gap: 12px; }
      .w1-field { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 600; color: #1b1916; }
      .w1-field > span, .w1-labelrow span:first-child { font-size: 12px; font-weight: 600; }
      .w1-labelrow { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .w1-inputwrap { position: relative; display: flex; align-items: center; }
      .w1-inputwrap > .material-symbols-outlined { position: absolute; left: 12px; color: #7b756a; font-size: 18px; }
      .w1-inputwrap input { padding-left: 38px; padding-right: 40px; }
      .w1-field input, .w1-field select, .w1-inputwrap input {
        width: 100%; border: 1px solid #e8e1d3; background: rgba(247,242,234,.6); color: #1b1916;
        border-radius: 10px; padding: 11px 14px; font: 400 14px/1.3 Urbanist, sans-serif; min-height: 44px;
      }
      .w1-field input:focus, .w1-field select:focus { outline: none; border-color: #c88a12; background: #fffdf9; }
      .w1-affix { position: absolute; right: 8px; border: 0; background: none; color: #7b756a; padding: 6px; }
      .w1-link { border: 0; background: none; color: #93600a; font: 500 12px/1 Urbanist, sans-serif; padding: 0; }
      .w1-actions { display: flex; flex-direction: column; gap: 10px; padding-top: 4px; }
      .w1-btn {
        width: 100%; min-height: 48px; border-radius: 999px; border: 1px solid transparent;
        display: inline-flex; align-items: center; justify-content: center; gap: 8px;
        font: 600 15px/1 Urbanist, sans-serif; padding: 12px 16px;
      }
      .w1-btn--primary { background: #c88a12; color: #1a1405; box-shadow: 0 1px 2px rgba(27,25,22,.08); }
      .w1-btn--secondary { background: #fffdf9; color: #1b1916; border-color: #e8e1d3; font-size: 14px; }
      .w1-btn:disabled { opacity: .6; }
      .w1-banner { margin: 0; padding: 10px 12px; border-radius: 10px; font-size: 12px; }
      .w1-banner--error { background: rgba(191,58,45,.1); color: #8f2b21; border: 1px solid rgba(191,58,45,.25); }
      .w1-banner--info { background: rgba(35,128,77,.1); color: #1d6840; border: 1px solid rgba(35,128,77,.2); }
      .w1-error { margin: 0; color: #bf3a2d; font-size: 12px; font-weight: 500; }
      .w1-criteria {
        background: rgba(255,253,249,.75); border: 1px solid #e8e1d3; border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 12px;
      }
      .w1-criteria-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; font-weight: 600; }
      .w1-criteria-head > span:first-child { display: inline-flex; align-items: center; gap: 6px; }
      .w1-criteria-head .material-symbols-outlined { color: #c88a12; font-size: 16px; }
      .w1-criteria-grid, .w1-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .w1-mini { background: #f7f2ea; border: 1px solid rgba(232,225,211,.8); border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 2px; }
      .w1-mini strong { font-size: 12px; }
      .w1-mini small, .w1-criteria p, .w1-terms { color: #7b756a; font-size: 11px; line-height: 1.45; margin: 0; }
      .w1-mono { font-family: 'JetBrains Mono', monospace; }
      .w1-intro .w1-pill { display:inline-flex; padding:4px 10px; border-radius:999px; background:rgba(200,138,18,.15); color:#93600a; font:600 11px/1.2 'JetBrains Mono',monospace; }
      .w1-accent { color: #93600a; font-weight: 600; font-size: 11px; }
      .w1-terms { text-align: center; }
      .w1-receipt-head { display:flex; justify-content:space-between; gap:8px; font-size:12px; color:#7b756a; border-bottom:1px solid #e8e1d3; padding-bottom:10px; font-weight:600; }
      .w1-kv { margin:0; display:flex; flex-direction:column; gap:0; }
      .w1-kv div { display:flex; justify-content:space-between; gap:12px; padding:8px 0; border-bottom:1px solid rgba(232,225,211,.5); font-size:13px; }
      .w1-kv div:last-child { border-bottom:0; }
      .w1-kv dt { color:#7b756a; margin:0; }
      .w1-kv dd { margin:0; font-weight:600; text-align:right; }
      .w1-footer {
        display:flex; align-items:center; justify-content:space-between; gap:8px;
        padding: 10px 20px calc(10px + env(safe-area-inset-bottom, 0px));
        border-top:1px solid #e8e1d3; background: rgba(239,227,200,.6); color:#7b756a;
        font: 500 11px/1.2 'JetBrains Mono', monospace;
      }
      .w1-footer div { display:flex; align-items:center; }
      @media (max-width: 360px) {
        .w1-grid2, .w1-criteria-grid { grid-template-columns: 1fr; }
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
  readonly mode = signal<'signin' | 'apply' | 'success'>('signin');
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
          this.applyDone.set(this.email.trim()); this.mode.set('success');
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
