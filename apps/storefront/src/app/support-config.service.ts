import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { catchError, of } from 'rxjs';
import { API_BASE } from './auth-token.store';
import { environment } from '../environments/environment';

interface PublicConfig {
  supportWhatsappUrl?: string | null;
}

function normalizeUrl(raw?: string | null): string | null {
  const value = raw?.trim() ?? '';
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const digits = value.replace(/[^\d]/g, '');
  return digits ? `https://wa.me/${digits}` : null;
}

/**
 * Reads the operator-owned bits of /config/public that only one surface needs.
 *
 * The floating WhatsApp button and order help dock are the consumers: the link
 * is edited on the dashboard's Settings page, published through the public
 * config endpoint, and falls back to the storefront's configured support number
 * when no operator link has been published. A null hides the affordance.
 */
@Injectable({ providedIn: 'root' })
export class SupportConfigService {
  private readonly http = inject(HttpClient, { optional: true });

  readonly whatsappUrl = signal<string | null>(normalizeUrl(environment.supportWhatsapp));

  constructor() {
    this.http
      ?.get<PublicConfig>(`${API_BASE}/config/public`)
      .pipe(catchError(() => of(null)))
      .subscribe((config) => {
        const configured = config?.supportWhatsappUrl?.trim();
        this.whatsappUrl.set(normalizeUrl(configured || environment.supportWhatsapp));
      });
  }
}
