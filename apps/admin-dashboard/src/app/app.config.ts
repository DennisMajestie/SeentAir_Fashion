import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideSeCurrency } from '@seentair/ui';
import { API_BASE, authInterceptor, TokenStore } from './auth-token.store';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    // Silent session restore from the httpOnly refresh cookie before first render.
    provideAppInitializer(() => inject(TokenStore).init()),
    // Currency symbol and locale are configuration, read from the API once.
    provideSeCurrency(`${API_BASE}/config/public`),
  ],
};
