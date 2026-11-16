import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { catchError, of } from 'rxjs';
import { API_BASE } from './auth-token.store';

interface PublicConfig {
  supportWhatsappUrl?: string | null;
}

/**
 * Reads the operator-owned bits of /config/public that only one surface needs.
 *
 * The floating WhatsApp button is the only consumer so far: the link lives on
 * the platform settings row in the dashboard, is published through the public
 * config endpoint, and stays null until an operator sets one — a null means
 * "hide the affordance", never "guess a number".
 *
 * HttpClient is optional so component specs that render the shell without an
 * HTTP provider (mobile-shell.spec) keep working; a failed or absent fetch
 * simply leaves the button hidden.
 */
@Injectable({ providedIn: 'root' })
export class SupportConfigService {
  private readonly http = inject(HttpClient, { optional: true });

  readonly whatsappUrl = signal<string | null>(null);

  constructor() {
    this.http
      ?.get<PublicConfig>(`${API_BASE}/config/public`)
      .pipe(catchError(() => of(null)))
      .subscribe((config) => {
        const url = config?.supportWhatsappUrl ?? null;
        this.whatsappUrl.set(url && url.trim() !== '' ? url : null);
      });
  }
}
