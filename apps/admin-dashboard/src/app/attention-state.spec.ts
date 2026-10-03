import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideHttpClient, type HttpRequest } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AppOpsbarComponent } from './app-opsbar.component';
import { AuditPage } from './pages/audit.page';

/** These cover the failure direction specifically: a screen that renders an
    empty list when the request failed, rather than when the data is genuinely
    empty. On the bell and the audit log that difference is the whole point,
    so it gets pinned by test rather than by review. */

function configure(): void {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
}

const URLS = {
  approvals: (r: HttpRequest<unknown>): boolean => r.url.includes('/approvals/pending'),
  lowStock: (r: HttpRequest<unknown>): boolean => r.url.includes('/analytics/low-stock'),
  returns: (r: HttpRequest<unknown>): boolean => /\/returns(\?|$)/.test(r.urlWithParams),
  auditVerify: (r: HttpRequest<unknown>): boolean => r.url.includes('/audit-log/verify'),
  auditLog: (r: HttpRequest<unknown>): boolean => /\/audit-log(\?|$)/.test(r.urlWithParams),
};

function approvals(n: number): Array<Record<string, unknown>> {
  return Array.from({ length: n }, (_, i) => ({
    id: `ap-${i}`,
    actionType: 'price_change',
    requestedBy: { name: `Staff ${i}` },
  }));
}

function emptyLowStock(): Record<string, unknown> {
  return { materials: [], variants: [], variantThreshold: 10 };
}

describe('opsbar attention bell', () => {
  let fixture: ComponentFixture<AppOpsbarComponent>;
  let http: HttpTestingController;

  beforeEach(() => {
    configure();
    fixture = TestBed.createComponent(AppOpsbarComponent);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // The component polls on a 60s interval; destroying clears it.
    fixture.destroy();
    http.verify();
  });

  function boot(): void {
    fixture.detectChanges();
  }

  /** The popover only exists in the DOM once the bell is clicked. */
  function openBell(): void {
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.ops-btn')!.click();
    fixture.detectChanges();
  }

  /** Drives the 60s poll directly instead of waiting for the real interval. */
  function poll(): void {
    (fixture.componentInstance as unknown as { refresh(): void }).refresh();
  }

  it('does NOT claim all clear when every source fails', () => {
    boot();
    openBell();
    http.expectOne(URLS.approvals).error(new ProgressEvent('fail'));
    http.expectOne(URLS.lowStock).error(new ProgressEvent('fail'));
    http.expectOne(URLS.returns).error(new ProgressEvent('fail'));
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('All clear');
    expect(text).toContain('Cannot reach the server');
    expect(fixture.componentInstance.blind()).toBeTrue();
  });

  it('names only the source that failed, and keeps the healthy rows', () => {
    boot();
    openBell();
    http.expectOne(URLS.approvals).flush(approvals(2));
    http.expectOne(URLS.lowStock).error(new ProgressEvent('fail'));
    http.expectOne(URLS.returns).error(new ProgressEvent('fail'));
    fixture.detectChanges();

    const cmp = fixture.componentInstance;
    expect(cmp.blind()).toBeFalse();
    expect(cmp.degraded()).toBeTrue();
    expect(cmp.degradedSources()).toBe('stock levels, returns');
    expect(cmp.attentionRows().length).toBe(2);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('All clear');
  });

  it('renders 9+ above nine instead of clamping to 9', () => {
    boot();
    http.expectOne(URLS.approvals).flush(approvals(12));
    http.expectOne(URLS.lowStock).flush(emptyLowStock());
    http.expectOne(URLS.returns).flush({ data: [], total: 0 });
    fixture.detectChanges();

    expect(fixture.componentInstance.attentionCount()).toBe(12);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('9+');
  });

  it('clears the failure once a source recovers', () => {
    boot();
    openBell();
    http.expectOne(URLS.approvals).flush(approvals(1));
    http.expectOne(URLS.lowStock).error(new ProgressEvent('fail'));
    http.expectOne(URLS.returns).flush({ data: [], total: 0 });
    fixture.detectChanges();
    expect(fixture.componentInstance.degraded()).toBeTrue();

    poll();
    http.expectOne(URLS.approvals).flush(approvals(1));
    http.expectOne(URLS.lowStock).flush(emptyLowStock());
    http.expectOne(URLS.returns).flush({ data: [], total: 0 });
    fixture.detectChanges();
    expect(fixture.componentInstance.degraded()).toBeFalse();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('All clear');
  });
});

describe('audit page failure states', () => {
  let fixture: ComponentFixture<AuditPage>;
  let http: HttpTestingController;

  beforeEach(() => {
    configure();
    fixture = TestBed.createComponent(AuditPage);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    fixture.destroy();
    http.verify();
  });

  function boot(): void {
    fixture.detectChanges();
  }

  it('distinguishes a failed log read from an empty log', () => {
    boot();
    http.expectOne(URLS.auditLog).error(new ProgressEvent('fail'));
    http.expectOne(URLS.auditVerify).flush({ total: 0, valid: 0, broken: 0, headHash: null });
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(fixture.componentInstance.loadError()).toBeTrue();
    expect(text).toContain('Could not load the activity log');
    expect(text).not.toContain('No entries match this filter window');
  });

  it('does not present a stale pass when the integrity check fails', () => {
    boot();
    http.expectOne(URLS.auditLog).flush({ data: [], total: 0 });
    http.expectOne(URLS.auditVerify).flush({ total: 4, valid: 4, broken: 0, headHash: 'abc' });
    fixture.detectChanges();
    expect(fixture.componentInstance.verifyResult()).not.toBeNull();

    // Re-run the check; the request has to be issued before it can fail.
    fixture.componentInstance.verifyIntegrity();
    http.expectOne(URLS.auditVerify).error(new ProgressEvent('fail'));
    fixture.detectChanges();

    const cmp = fixture.componentInstance;
    expect(cmp.verifyError()).toBeTrue();
    expect(cmp.verifyResult()).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('hash-chain valid');
  });
  it('clears rows already on screen when a filtered reload fails', () => {
    boot();
    http.expectOne(URLS.auditLog).flush({
      data: [{ id: 'e1', action: 'orders.update', actorId: 'u1', createdAt: '' }],
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
