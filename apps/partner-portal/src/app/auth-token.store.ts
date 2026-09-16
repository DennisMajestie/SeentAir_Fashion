import { HttpBackend, HttpClient, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { firstValueFrom } from 'rxjs';

export const API_BASE = 'http://localhost:3000/api/v1';

/**
 * XSS-hardened session state: the access token lives ONLY in memory (never
 * localStorage); the refresh token lives ONLY in an httpOnly cookie the
 * browser attaches to /auth requests. A page reload silently re-mints the
 * access token from the cookie.
 */
@Injectable({ providedIn: 'root' })
export class TokenStore {
  // HttpBackend bypasses interceptors — no recursion into ourselves.
  private readonly bare = new HttpClient(inject(HttpBackend));
  readonly token = signal<string | null>(null);

  set(token: string | null): void {
    this.token.set(token);
  }

  /** Mint a fresh access token from the httpOnly refresh cookie. */
  async refresh(): Promise<boolean> {
    try {
      const res = await firstValueFrom(
        this.bare.post<{ accessToken: string }>(
          `${API_BASE}/auth/refresh`,
          {},
          { withCredentials: true },
        ),
      );
      this.token.set(res.accessToken);
      return true;
    } catch {
      this.token.set(null);
      return false;
    }
  }

  /** App-boot session restore; resolves either way so startup never blocks on auth. */
  async init(): Promise<void> {
    await this.refresh();
  }
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const store = inject(TokenStore);
  if (!req.url.startsWith(API_BASE)) return next(req);

  const attach = (r: typeof req) => {
    const token = store.token();
    const withCreds = r.clone({ withCredentials: true });
    return token
      ? withCreds.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : withCreds;
  };

  return next(attach(req)).pipe(
    catchError((err) => {
      // Expired access token mid-session → one silent refresh, then retry.
      if (err?.status === 401 && store.token() && !req.url.includes('/auth/')) {
        return from(store.refresh()).pipe(
          switchMap((ok) => (ok ? next(attach(req)) : throwError(() => err))),
        );
      }
      return throwError(() => err);
    }),
  );
};
