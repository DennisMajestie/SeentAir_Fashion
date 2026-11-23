import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE } from './auth-token.store';
import { SupportConfigService } from './support-config.service';

describe('SupportConfigService', () => {
  let http: HttpTestingController;
  let service: SupportConfigService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(SupportConfigService);
  });

  afterEach(() => http.verify());

  it('uses the configured support number when no dashboard link is published', () => {
    expect(service.whatsappUrl()).toBe('https://wa.me/2347010361332');

    http.expectOne(`${API_BASE}/config/public`).flush({ supportWhatsappUrl: null });

    expect(service.whatsappUrl()).toBe('https://wa.me/2347010361332');
  });

  it('lets a dashboard-published link override the fallback', () => {
    http
      .expectOne(`${API_BASE}/config/public`)
      .flush({ supportWhatsappUrl: 'https://wa.me/2348012345678' });

    expect(service.whatsappUrl()).toBe('https://wa.me/2348012345678');
  });
});
