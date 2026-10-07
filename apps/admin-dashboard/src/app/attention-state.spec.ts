import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideHttpClient, type HttpRequest } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AccessService } from './access.service';
import { AppOpsbarComponent } from './app-opsbar.component';

/** These cover the failure direction specifically: a screen that renders an
    empty list when the request failed, rather than when the data is genuinely
    empty. On the bell and the audit log that difference is the whole point,
    so it gets pinned by test rather than by review. */

function configure(): void {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  }); // The bell only asks about queues the role can see: these cases are the owner's.
  TestBed.inject(AccessService).me.set({
    name: 'Test Owner',
    email: 'owner@seentair.test',
    role: 'business_owner_admin',
    totpEnabled: false,
    access: { approvals_audit: 'full', analytics: 'full', returns: 'full' },
  });
}

const URLS = {
  approvals: (r: HttpRequest<unknown>): boolean => r.url.includes('/approvals/pending'),
  lowStock: (r: HttpRequest<unknown>): boolean => r.url.includes('/analytics/low-stock'),
  returns: (r: HttpRequest<unknown>): boolean => /\/returns(\?|$)/.test(r.urlWithParams),
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
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.ops__trigger')!
      .click();
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
    http.expectOne(URLS.approvals).flush(approvals(0));
    http.expectOne(URLS.lowStock).flush(emptyLowStock());
    http.expectOne(URLS.returns).flush({ data: [], total: 0 });
    fixture.detectChanges();
    expect(fixture.componentInstance.degraded()).toBeFalse();
    // Zero rows on a healthy read is the only state that may say all-clear.
    expect(fixture.componentInstance.attentionRows().length).toBe(0);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('All clear');
  });
});

describe('opsbar, cut to the role', () => {
  let fixture: ComponentFixture<AppOpsbarComponent>;
  let http: HttpTestingController;

  const mount = (access: Record<string, string>): void => {
    configure();
    TestBed.inject(AccessService).me.set({
      name: 'Test Inventory',
      email: 'inventory@seentair.test',
      role: 'inventory',
      totpEnabled: false,
      access,
    });
    fixture = TestBed.createComponent(AppOpsbarComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  };
  afterEach(() => {
    fixture.destroy();
    http.verify();
  });

  it('asks only about the queues the role can see', () => {
    mount({ analytics: 'view', inventory: 'full', returns: 'view' });
    // No approvals request at all: http.verify() in afterEach fails on any stray one.
    http.expectOne(URLS.lowStock).flush(emptyLowStock());
    http.expectOne(URLS.returns).flush({ data: [], total: 0 });
    http.expectNone(URLS.approvals);
    expect(fixture.componentInstance.degraded()).toBeFalse();
  });

  it('offers only the quick actions the role may take, and no menu when there are none', () => {
    mount({ analytics: 'view', inventory: 'full', raw_materials: 'full' });
    http.expectOne(URLS.lowStock).flush(emptyLowStock());
    expect(fixture.componentInstance.quickActions().map((a) => a.label)).toEqual([
      'Record a material purchase',
    ]);
    fixture.destroy();

    TestBed.resetTestingModule();
    mount({ analytics: 'view' });
    http.expectOne(URLS.lowStock).flush(emptyLowStock());
    expect(fixture.componentInstance.quickActions().length).toBe(0);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[aria-label="Quick actions"]'),
    ).toBeNull();
  });
});
