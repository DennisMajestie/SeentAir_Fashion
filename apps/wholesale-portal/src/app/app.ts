import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterOutlet } from '@angular/router';
import { ApiService } from './api.service';
import { ThemeService } from './theme.service';

/**
 * Wholesale portal root. Unauthenticated: W1 Sign In / Apply / Apply Success,
 * carried verbatim from the Stitch screens (project 11876445789761593512) with
 * the screen's own Tailwind tokens. Authenticated: the route outlet — every
 * screen renders its own Stitch-verbatim mobile layout and nav.
 */
@Component({
  selector: 'app-root',
  imports: [FormsModule, RouterOutlet],
  template: `
    @if (api.isLoggedIn) {
      <router-outlet />
    } @else {
      <div class="stitch">
        @if (mode() === 'signin') {
          <div class="bg-canvas text-light-on-surface min-h-screen flex flex-col justify-between antialiased selection:bg-accent/20">
            <header class="ws-topbar px-5 pt-4 pb-3 flex items-center justify-between border-b border-border/70 bg-canvas/80 backdrop-blur-md sticky top-0 z-20">
              <div class="flex items-center gap-2">
                <div class="w-2 h-2 rounded-full bg-success animate-pulse"></div>
                <span class="text-[12px] font-medium tracking-tight text-light-secondary flex items-center gap-1">
                  <span class="material-symbols-outlined text-[14px] text-success">lock</span>
                  256-bit TLS Aba Hub Verified
                </span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-[11px] font-mono uppercase px-2 py-0.5 rounded-full bg-canvas-tint text-light-primary border border-border">Portal 01</span>
                <button type="button" aria-label="Toggle theme" class="w-8 h-8 rounded-full flex items-center justify-center bg-light-surface border border-border text-light-secondary hover:text-light-primary" (click)="theme.toggle()">
                  <span class="material-symbols-outlined text-[16px]">{{ theme.theme() === 'dark' ? 'light_mode' : 'dark_mode' }}</span>
                </button>
              </div>
            </header>

            <main class="flex-1 px-4 py-5 flex flex-col gap-5 max-w-[390px] mx-auto w-full md:max-w-md">
              <div class="pt-2 text-center">
                <img src="assets/logo.png" alt="SeentAir" width="132" height="78" class="logo-mark h-11 w-auto mx-auto mb-3" />
                <h1 class="sr-only">SEENTAIR</h1>
                <p class="text-[13px] text-light-secondary font-medium tracking-wide uppercase mt-0.5">Aba B2B Wholesale Portal</p>
              </div>

              <div class="p-3.5 rounded-xl bg-canvas-tint/70 border border-border flex items-start gap-2.5">
                <span class="material-symbols-outlined text-warning text-[18px] mt-0.5">verified_user</span>
                <div class="text-[12px] leading-relaxed text-light-primary">
                  <strong class="font-semibold text-light-primary">Authorised access only.</strong> Direct manufacturer pricing and Aba line batch allocations are reserved for verified wholesale buyers.
                </div>
              </div>

              <section class="ws-signin-card bg-light-surface rounded-xl p-5 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.06)] flex flex-col gap-4">
                <div>
                  <h2 class="text-[18px] font-bold text-light-primary">Sign in to your desk</h2>
                  <p class="text-[13px] text-light-secondary mt-0.5">Access wholesale catalog, bulk matrices &amp; orders</p>
                </div>

                <form class="flex flex-col gap-3.5" (ngSubmit)="signIn()" novalidate>
                  <label class="flex flex-col gap-1.5">
                    <span class="text-[13px] font-semibold text-light-primary">Registered corporate email</span>
                    <div class="relative flex items-center">
                      <span class="absolute left-3.5 text-light-secondary material-symbols-outlined text-[18px]">business</span>
                      <input id="ws-email" type="email" [(ngModel)]="email" name="email" autocomplete="email" inputmode="email" placeholder="buyer@domain.com" class="w-full pl-10 pr-3.5 py-3 rounded-md bg-canvas/60 border border-border text-[14px] text-light-primary focus:outline-none focus:border-accent focus:bg-light-surface font-normal" />
                    </div>
                    @if (touched() && !emailValid()) { <p class="auth-error text-[12px] text-danger">Enter a valid email address.</p> }
                  </label>

                  <label class="flex flex-col gap-1.5">
                    <div class="flex items-center justify-between">
                      <span class="text-[13px] font-semibold text-light-primary">Password</span>
                      <a href="#" class="text-[12px] text-warning font-medium hover:underline" (click)="$event.preventDefault(); forgot()">Forgot password?</a>
                    </div>
                    <div class="relative flex items-center">
                      <span class="absolute left-3.5 text-light-secondary material-symbols-outlined text-[18px]">lock</span>
                      <input id="ws-password" [type]="showPassword() ? 'text' : 'password'" [(ngModel)]="password" name="password" autocomplete="current-password" placeholder="••••••••••••" class="w-full pl-10 pr-10 py-3 rounded-md bg-canvas/60 border border-border text-[14px] text-light-primary focus:outline-none focus:border-accent focus:bg-light-surface font-mono" />
                      <button type="button" aria-label="Toggle password visibility" class="absolute right-3.5 text-light-secondary hover:text-light-primary" (click)="showPassword.set(!showPassword())">
                        <span class="material-symbols-outlined text-[18px]">{{ showPassword() ? 'visibility_off' : 'visibility' }}</span>
                      </button>
                    </div>
                    @if (touched() && !password) { <p class="auth-error text-[12px] text-danger">Enter your password.</p> }
                  </label>

                  <div class="flex flex-col gap-2.5 pt-2">
                    <button type="submit" [disabled]="busy()" class="w-full py-3.5 rounded-full bg-accent text-on-accent font-semibold text-[15px] flex items-center justify-center gap-2 shadow-sm hover:brightness-105 active:scale-[0.99] transition-all disabled:opacity-60">
                      <span>{{ busy() ? 'Signing in…' : 'Sign in to Wholesale' }}</span>
                      <span class="material-symbols-outlined text-[18px]">arrow_forward</span>
                    </button>
                    <button id="apply-cta" type="button" (click)="showApplyForm()" class="w-full py-3 rounded-full bg-light-surface border border-border text-light-primary font-semibold text-[14px] text-center hover:bg-canvas-tint/40 active:scale-[0.99] transition-all">
                      Apply for Wholesale Access
                    </button>
                  </div>
                  @if (error()) { <p class="auth-error text-[12px] text-danger" role="alert">{{ error() }}</p> }
                  @if (info()) { <p class="auth-info text-[12px] text-success" role="status">{{ info() }}</p> }
                </form>
              </section>

              <section class="bg-light-surface/70 rounded-xl p-4 border border-border flex flex-col gap-3">
                <div class="flex items-center justify-between text-[12px] font-semibold text-light-primary">
                  <span class="flex items-center gap-1.5">
                    <span class="material-symbols-outlined text-[16px] text-accent">fact_check</span>
                    Aba Factory Criteria
                  </span>
                  <span class="text-light-secondary font-mono text-[11px]">MOQ 20 / SILHOUETTE</span>
                </div>
                <div class="grid grid-cols-2 gap-2 text-[12px]">
                  <div class="p-2.5 rounded-lg bg-canvas border border-border/80">
                    <span class="text-light-secondary text-[10px] uppercase font-mono block">Volume Rate</span>
                    <span class="font-bold text-light-primary">₦8,500 – ₦16,000</span>
                    <span class="text-[10px] text-light-secondary block">Ex-factory Aba unit cost</span>
                  </div>
                  <div class="p-2.5 rounded-lg bg-canvas border border-border/80">
                    <span class="text-light-secondary text-[10px] uppercase font-mono block">Verification</span>
                    <span class="font-bold text-light-primary">CAC / Tin Required</span>
                    <span class="text-[10px] text-light-secondary block">24hr Desk appraisal</span>
                  </div>
                </div>
                <p class="text-[11px] text-light-secondary leading-normal">
                  Freight handled via GIG Logistics &amp; Red Star Aba Central Hub. 100% upfront invoice settlement prior to cut-and-sew scheduling.
                </p>
              </section>
            </main>

            <footer class="px-5 py-3 bg-canvas-tint/60 border-t border-border flex items-center justify-between text-[11px] font-mono text-light-secondary">
              <div class="flex items-center gap-1.5">
                <span class="w-1.5 h-1.5 rounded-full bg-success"></span>
                <span>ABA SEWING MILL ACTIVE</span>
              </div>
              <span>SEENTAIR IND. v2.4</span>
            </footer>
          </div>
        } @else if (mode() === 'apply') {
          <div class="bg-canvas text-light-on-surface min-h-screen flex flex-col justify-between antialiased selection:bg-accent/20">
            <header class="px-5 pt-4 pb-3 flex items-center justify-between border-b border-border/70 bg-canvas/80 backdrop-blur-md sticky top-0 z-20">
              <button id="apply-back" type="button" class="flex items-center gap-1.5 text-[13px] font-semibold text-light-secondary hover:text-light-primary" (click)="showSignInForm()">
                <span class="material-symbols-outlined text-[18px]">arrow_back</span>
                Sign in
              </button>
              <span class="text-[12px] font-mono text-light-secondary">APPLICATION DESK</span>
            </header>

            <main class="flex-1 px-4 py-5 flex flex-col gap-4 max-w-[390px] mx-auto w-full md:max-w-lg">
              <div>
                <div class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-accent/15 text-warning text-[11px] font-mono font-semibold mb-1">WHOLESALE ONBOARDING</div>
                <h1 class="text-[22px] font-bold text-light-primary">Apply for Wholesale Access</h1>
                <p class="text-[13px] text-light-secondary mt-0.5">Verified bulk buyers receive tier discounts &amp; dedicated batch scheduling at Aba Mills.</p>
              </div>

              <section class="bg-light-surface rounded-xl p-5 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.06)] flex flex-col gap-3.5">
                <form class="flex flex-col gap-3" (ngSubmit)="submitApplication()" novalidate>
                  <label class="flex flex-col gap-1">
                    <span class="text-[12px] font-semibold text-light-primary">Full contact name</span>
                    <input type="text" required name="apName" autocomplete="name" [(ngModel)]="apply.name" placeholder="e.g. Chinedu Okafor" class="px-3.5 py-2.5 rounded-md bg-canvas/60 border border-border text-[13px] text-light-primary focus:outline-none focus:border-accent" />
                  </label>
                  <label class="flex flex-col gap-1">
                    <span class="text-[12px] font-semibold text-light-primary">Business / Entity name</span>
                    <input id="ap-business" type="text" required name="apBusiness" autocomplete="organization" [(ngModel)]="apply.businessName" placeholder="Registered CAC brand name" class="px-3.5 py-2.5 rounded-md bg-canvas/60 border border-border text-[13px] text-light-primary focus:outline-none focus:border-accent" />
                  </label>
                  <div class="grid grid-cols-2 gap-2.5">
                    <label class="flex flex-col gap-1">
                      <span class="text-[12px] font-semibold text-light-primary">Corporate email</span>
                      <input type="email" required name="apEmail" inputmode="email" autocomplete="email" [(ngModel)]="email" placeholder="buyer@domain.com" class="px-3.5 py-2.5 rounded-md bg-canvas/60 border border-border text-[13px] text-light-primary focus:outline-none focus:border-accent" />
                    </label>
                    <label class="flex flex-col gap-1">
                      <span class="text-[12px] font-semibold text-light-primary">Phone (WhatsApp)</span>
                      <input type="tel" name="apPhone" inputmode="tel" autocomplete="tel" [(ngModel)]="apply.phone" placeholder="+234 803 000 0000" class="px-3.5 py-2.5 rounded-md bg-canvas/60 border border-border text-[13px] text-light-primary focus:outline-none focus:border-accent" />
                    </label>
                  </div>
                  <label class="flex flex-col gap-1">
                    <span class="text-[12px] font-semibold text-light-primary">Create portal password</span>
                    <input id="ap-password" [type]="showPassword() ? 'text' : 'password'" required name="apPassword" autocomplete="new-password" [(ngModel)]="password" class="px-3.5 py-2.5 rounded-md bg-canvas/60 border border-border text-[13px] text-light-primary font-mono focus:outline-none focus:border-accent" />
                  </label>
                  <label class="flex flex-col gap-1">
                    <span class="text-[12px] font-semibold text-light-primary">Buyer type</span>
                    <select name="apType" [(ngModel)]="apply.buyerType" class="px-3.5 py-2.5 rounded-md bg-canvas/60 border border-border text-[13px] text-light-primary focus:outline-none focus:border-accent">
                      @for (t of buyerTypes; track t.value) { <option [value]="t.value">{{ t.label }}</option> }
                    </select>
                  </label>
                  <div class="grid grid-cols-2 gap-2.5">
                    <label class="flex flex-col gap-1">
                      <span class="text-[12px] font-semibold text-light-primary">City</span>
                      <input type="text" required name="apCity" autocomplete="address-level2" [(ngModel)]="apply.city" class="px-3.5 py-2.5 rounded-md bg-canvas/60 border border-border text-[13px] text-light-primary focus:outline-none focus:border-accent" />
                    </label>
                    <label class="flex flex-col gap-1">
                      <span class="text-[12px] font-semibold text-light-primary">State</span>
                      <input type="text" required name="apState" [(ngModel)]="apply.state" class="px-3.5 py-2.5 rounded-md bg-canvas/60 border border-border text-[13px] text-light-primary focus:outline-none focus:border-accent" />
                    </label>
                  </div>
                  <label class="flex flex-col gap-1">
                    <div class="flex items-center justify-between">
                      <span class="text-[12px] font-semibold text-light-primary">Opening order estimate (Units)</span>
                      <span class="text-[11px] text-warning font-medium">Min 20 units/silhouette</span>
                    </div>
                    <input type="number" min="20" step="10" name="apVolume" inputmode="numeric" [(ngModel)]="apply.openingVolume" class="px-3.5 py-2.5 rounded-md bg-canvas/60 border border-border text-[13px] text-light-primary font-mono focus:outline-none focus:border-accent" />
                  </label>
                  <div class="pt-2">
                    <button type="submit" [disabled]="applyBusy()" class="w-full py-3.5 rounded-full bg-accent text-on-accent font-semibold text-[15px] flex items-center justify-center gap-2 shadow-sm hover:brightness-105 active:scale-[0.99] transition-all disabled:opacity-60">
                      <span>{{ applyBusy() ? 'Submitting…' : 'Submit Application' }}</span>
                      <span class="material-symbols-outlined text-[18px]">send</span>
                    </button>
                  </div>
                  @if (error()) { <p class="auth-error text-[12px] text-danger" role="alert">{{ error() }}</p> }
                  @if (info()) { <p class="auth-info text-[12px] text-success" role="status">{{ info() }}</p> }
                </form>
              </section>

              <div class="text-[11px] text-light-secondary text-center leading-relaxed">
                By applying, you agree to Seentair B2B wholesale terms: 100% invoice settlement prior to cut-and-sew, verified commercial dispatch, and factory defect exchange window.
              </div>
            </main>

            <footer class="px-5 py-3 bg-canvas-tint/60 border-t border-border flex items-center justify-between text-[11px] font-mono text-light-secondary">
              <span>SEENTAIR ABA ONBOARDING</span>
              <span>VETTING: 24H SLA</span>
            </footer>
          </div>
        } @else {
          <div class="bg-canvas text-light-on-surface min-h-screen flex flex-col justify-between antialiased selection:bg-accent/20">
            <header class="px-5 pt-4 pb-3 flex items-center justify-between border-b border-border/70 bg-canvas/80 backdrop-blur-md sticky top-0 z-20">
              <div class="flex items-center gap-1.5 text-[12px] font-mono text-light-secondary">
                <span class="w-2 h-2 rounded-full bg-success"></span>
                APP-REF: {{ appRef() }}
              </div>
              <span class="text-[11px] font-mono px-2 py-0.5 rounded-full bg-success/15 text-success border border-success/30 font-semibold">RECEIVED</span>
            </header>

            <main class="flex-1 px-4 py-6 flex flex-col gap-5 max-w-[390px] mx-auto w-full md:max-w-md">
              <div class="text-center pt-2">
                <div class="inline-flex items-center justify-center w-14 h-14 rounded-full bg-success/15 text-success border border-success/30 mb-3">
                  <span class="material-symbols-outlined text-[32px]">task_alt</span>
                </div>
                <h1 class="text-[22px] font-bold text-light-primary">Application Received</h1>
                <p class="text-[13px] text-light-secondary mt-1">Our Aba wholesale desk vets all CAC credentials and commercial references within <strong>24 operational hours</strong>.</p>
              </div>

              <section class="bg-light-surface rounded-xl p-5 border border-border shadow-[0_8px_24px_-4px_rgba(27,25,22,0.06)] flex flex-col gap-4">
                <div class="flex items-center justify-between border-b border-border pb-3">
                  <span class="text-[12px] font-semibold text-light-secondary uppercase tracking-wider">Submitted Details</span>
                  <span class="text-[11px] font-mono text-light-secondary">{{ submittedAt() ?? 'Pending review' }}</span>
                </div>
                <div class="flex flex-col gap-2.5 text-[13px]">
                  <div class="flex justify-between items-center py-1 border-b border-border/50"><span class="text-light-secondary">Business</span><span class="font-semibold text-light-primary">{{ apply.businessName || '—' }}</span></div>
                  <div class="flex justify-between items-center py-1 border-b border-border/50"><span class="text-light-secondary">Contact</span><span class="font-semibold text-light-primary">{{ apply.name || '—' }}</span></div>
                  <div class="flex justify-between items-center py-1 border-b border-border/50"><span class="text-light-secondary">Email</span><span class="font-mono text-[12px] text-light-primary">{{ applyDone() || email }}</span></div>
                  <div class="flex justify-between items-center py-1 border-b border-border/50"><span class="text-light-secondary">Hub Destination</span><span class="font-semibold text-light-primary">{{ apply.city || '—' }}, {{ apply.state || '—' }}</span></div>
                  <div class="flex justify-between items-center py-1"><span class="text-light-secondary">Opening Batch</span><span class="font-mono font-bold text-accent">{{ apply.openingVolume || '—' }} Units (Estimated)</span></div>
                </div>
                <div class="p-3 rounded-lg bg-canvas-tint/70 border border-border text-[12px] text-light-primary leading-normal flex items-start gap-2">
                  <span class="material-symbols-outlined text-[18px] text-warning mt-0.5">mail</span>
                  <span>A temporary activation link will be delivered to your corporate inbox once vetting completes.</span>
                </div>
              </section>

              <div class="flex flex-col gap-2.5">
                <button type="button" (click)="showSignInForm()" class="w-full py-3.5 rounded-full bg-accent text-on-accent font-semibold text-[15px] flex items-center justify-center gap-2 shadow-sm hover:brightness-105 active:scale-[0.99] transition-all">
                  <span>Preview Wholesale Dashboard</span>
                  <span class="material-symbols-outlined text-[18px]">arrow_forward</span>
                </button>
                <button type="button" (click)="showSignInForm()" class="w-full py-3 rounded-full bg-light-surface border border-border text-light-primary font-semibold text-[14px] text-center hover:bg-canvas-tint/40 transition-all">Back to Sign In</button>
              </div>
            </main>

            <footer class="px-5 py-3 bg-canvas-tint/60 border-t border-border flex items-center justify-between text-[11px] font-mono text-light-secondary">
              <span>ABA FACTORY DESK: +234 814 200 9010</span>
              <span>STATUS: PENDING</span>
            </footer>
          </div>
        }
      </div>
    }
  `,
  styles: [`:host { display: block; }`],
})
export class App {
  readonly api = inject(ApiService);
  readonly theme = inject(ThemeService);

  readonly appRef = computed(() => 'ST-APP-9214');

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
  readonly submittedAt = signal<string | null>(null);
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

  /** WAT-stamped receipt time, as the Stitch success screen shows it. */
  private formatSubmittedAt(): string {
    const stamp = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Lagos',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date());
    return `${stamp} WAT`;
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
          this.submittedAt.set(this.formatSubmittedAt());
          this.mode.set('success');
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
}
