import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideHttpClient, type HttpRequest } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AccessService } from '../access.service';
import { AuditPage } from './audit.page';

/** The failure direction specifically: a screen that renders an empty list
    when the request failed, rather than when the data is genuinely empty. On
    the audit log that difference is the whole point, so it is pinned by test. */
const URLS = {
  auditVerify: (r: HttpRequest<unknown>): boolean => r.url.includes('/audit-log/verify'),
  auditLog: (r: HttpRequest<unknown>): boolean => /\/audit-log(\?|$)/.test(r.urlWithParams),
  users: (r: HttpRequest<unknown>): boolean => /\/users(\?|$)/.test(r.urlWithParams),
};

describe('AuditPage', () => {
  let fixture: ComponentFixture<AuditPage>;
  let http: HttpTestingController;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    TestBed.inject(AccessService).me.set({
      name: 'Test Owner',
      email: 'owner@seentair.test',
      role: 'business_owner_admin',
      totpEnabled: false,
      access: { approvals_audit: 'full' },
    });
    fixture = TestBed.createComponent(AuditPage);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    fixture.destroy();
    http.verify();
  });

  function boot(): void {
    fixture.detectChanges();
    // Actor names come from the staff list; a refusal leaves ids in place.
    http.expectOne(URLS.users).flush({ data: [{ id: 'u1', name: 'Test Sales' }], total: 1 });
  }

  it('lists entries through the shared table', () => {
    boot();
    http.expectOne(URLS.auditLog).flush({
      data: [
        { id: 'e1', action: 'orders.update', actorId: 'u1', timestamp: '2026-10-06T09:00:00' },
        { id: 'e2', action: 'stock.move', actorId: null, timestamp: '2026-10-06T09:05:00' },
      ],
      total: 2,
    });
    http.expectOne(URLS.auditVerify).flush({ total: 2, valid: 2, broken: 0, headHash: null });
    fixture.detectChanges();
    const rows = el().querySelectorAll('se-table tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('orders.update');
    expect(rows[0].textContent).toContain('Test Sales');
    expect(rows[1].textContent).toContain('System');
    expect(el().querySelector('h1')!.textContent).toBe('Audit log');
  });

  it('distinguishes a failed log read from an empty log', () => {
    boot();
    http.expectOne(URLS.auditLog).error(new ProgressEvent('fail'));
    http.expectOne(URLS.auditVerify).flush({ total: 0, valid: 0, broken: 0, headHash: null });
    fixture.detectChanges();
    const text = el().textContent ?? '';
    expect(fixture.componentInstance.loadError()).toBeTrue();
    expect(text).toContain('Could not load the activity log');
    expect(text).not.toContain('No entries match this filter window');
    expect(text).not.toContain('No entries yet');
  });

  it('does not present a stale pass when the integrity check fails', () => {
    boot();
    http.expectOne(URLS.auditLog).flush({ data: [], total: 0 });
    http.expectOne(URLS.auditVerify).flush({ total: 4, valid: 4, broken: 0, headHash: 'abc' });
    fixture.detectChanges();
    expect(fixture.componentInstance.verifyResult()).not.toBeNull();
    expect(el().textContent).toContain('hash-chain valid');
    // Re-run the check; the request has to be issued before it can fail.
    fixture.componentInstance.verifyIntegrity();
    http.expectOne(URLS.auditVerify).error(new ProgressEvent('fail'));
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    expect(cmp.verifyError()).toBeTrue();
    expect(cmp.verifyResult()).toBeNull();
    expect(el().textContent).not.toContain('hash-chain valid');
  });

  it('clears rows already on screen when a filtered reload fails', () => {
    boot();
    http.expectOne(URLS.auditLog).flush({
      data: [{ id: 'e1', action: 'orders.update', actorId: 'u1', timestamp: '' }],
      total: 1,
    });
    http.expectOne(URLS.auditVerify).flush({ total: 1, valid: 1, broken: 0, headHash: null });
    fixture.detectChanges();
    expect(fixture.componentInstance.entries().length).toBe(1);
    fixture.componentInstance.applyFilters();
    http.expectOne(URLS.auditLog).error(new ProgressEvent('fail'));
    fixture.detectChanges();
    expect(fixture.componentInstance.entries().length).toBe(0);
    expect(fixture.componentInstance.total()).toBe(0);
    expect(fixture.componentInstance.loadError()).toBeTrue();
  });
});
