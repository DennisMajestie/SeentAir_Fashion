import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../api.service';

/** Buyer-facing application status, derived from the signed-in account role. */
@Component({
  selector: 'app-application-page',
  imports: [RouterLink],
  template: `
    <main class="px-4 py-6 max-w-[520px] mx-auto flex flex-col gap-4">
      <h1 class="text-[20px] font-bold text-light-primary">Wholesale application</h1>
      @if (loading()) {
        <p class="text-[13px] text-light-secondary">Checking your account…</p>
      } @else if (approved()) {
        <section class="bg-light-surface rounded-xl p-4 border border-border">
          <h2 class="text-[15px] font-bold text-success">Approved</h2>
          <p class="text-[12px] text-light-secondary mt-1">
            Your wholesale account is active. Tiered prices and bulk ordering are available in the catalogue.
          </p>
          <a routerLink="/catalogue" class="mt-3 inline-block px-4 py-2 rounded-full bg-accent text-on-accent text-[13px] font-bold">Browse catalogue</a>
        </section>
      } @else {
        <section class="bg-light-surface rounded-xl p-4 border border-border">
          <h2 class="text-[15px] font-bold text-warning">Pending review</h2>
          <p class="text-[12px] text-light-secondary mt-1">
            Your application is with the wholesale desk. You can browse the public catalogue while
            it is reviewed; approved accounts unlock tiered prices and bulk ordering.
          </p>
          <p class="text-[11px] text-light-secondary mt-2 font-mono">Account: {{ email() }}</p>
        </section>
      }
    </main>
  `,
})
export class ApplicationPage {
  private readonly api = inject(ApiService);
  readonly loading = signal(true);
  readonly approved = signal(false);
  readonly email = signal('');

  constructor() {
    firstValueFrom(this.api.me())
      .then((me) => {
        this.approved.set(me.role === 'wholesaler');
        this.email.set(me.email);
        this.loading.set(false);
      })
      .catch(() => this.loading.set(false));
  }
}
