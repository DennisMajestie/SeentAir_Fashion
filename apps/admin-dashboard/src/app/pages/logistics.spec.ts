import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { SeConfirmService } from '@seentair/ui';
import { AccessService } from '../access.service';
import { ApiService } from '../api.service';
import { LogisticsAdminPage } from './logistics.page';

const SETTINGS = {
  shippingEnabled: false,
  freeDeliveryThreshold: null,
  quoteExpiryMinutes: 1440,
  vatEnabled: false,
  vatRatePercent: 7.5,
  pricesIncludeVat: true,
  deliveryTaxable: true,
  couponsEnabled: false,
};

const OLD_APIS = [
  'deliveries',
  'deliveryPricing',
  'deliveryTracking',
  'createDelivery',
  'updateDeliveryStatus',
  'addDeliveryCheckpoint',
  'upsertPricing',
  'quote',
  'shippingSettings',
  'updateShippingSettings',
] as const;

let api: jasmine.SpyObj<ApiService>;
let confirm: jasmine.SpyObj<SeConfirmService>;

/** Wire a settings card harness: the row is what GET /checkout-shipping/admin/settings answers. */
function setUp(level = 'full'): void {
  api = jasmine.createSpyObj<ApiService>('ApiService', [...OLD_APIS]);
  confirm = jasmine.createSpyObj<SeConfirmService>('SeConfirmService', ['ask']);
  api.deliveries.and.returnValue(of({ data: [], total: 0 }));
  api.deliveryPricing.and.returnValue(of([]));
  api.shippingSettings.and.returnValue(of({ ...SETTINGS }));
  api.updateShippingSettings.and.callFake((body) => of({ ...SETTINGS, ...body }));
  confirm.ask.and.resolveTo(true);
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ApiService, useValue: api },
      { provide: SeConfirmService, useValue: confirm },
    ],
  });
  TestBed.inject(AccessService).me.set({
    name: 'Ada',
    email: 'ada@example.com',
    role: 'tester',
    totpEnabled: false,
    access: { logistics: level } as never,
  });
}

function mount(level = 'full'): ComponentFixture<LogisticsAdminPage> {
  setUp(level);
  const fixture = TestBed.createComponent(LogisticsAdminPage);
  fixture.detectChanges();
  return fixture;
}

describe('Checkout delivery & payment settings card', () => {
  it('shows the loaded switches beside the zone prices', () => {
    const fixture = mount();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Checkout delivery & payment settings');
    expect(text).toContain('Off — orders are for goods only');
    expect(text).toContain('1440 min');
    expect(text).toContain('Not offered');
    expect(api.shippingSettings).toHaveBeenCalledTimes(1);
  });

  it('hides the settings editor behind full logistics access', () => {
    const fixture = mount('view');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Off');
    expect([...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].map((b) => b.textContent?.trim())).not.toContain('Edit settings');
  });

  it('primes the drawer from the stored row', () => {
    const fixture = mount();
    const page = fixture.componentInstance;
    page.openSettings();
    expect(page.st.shipping).toBeFalse();
    expect(page.st.vat).toBeFalse();
    expect(page.st.pricesIncludeVat).toBeTrue();
    expect(page.st.threshold).toBeNull();
  });

  it('needs a reason before anything is sent', () => {
    const fixture = mount();
    const page = fixture.componentInstance;
    page.openSettings();
    page.st.shipping = true;
    page.st.reason = '   ';
    page.saveSettings();
    expect(page.reasonError()).toContain('reason is needed');
    expect(api.updateShippingSettings).not.toHaveBeenCalled();
  });

  it('validates the VAT rate only when VAT is on', () => {
    const fixture = mount();
    const page = fixture.componentInstance;
    page.openSettings();
    page.st.vat = true;
    page.st.vatRate = 120;
    page.st.reason = 'VAT goes live';
    page.saveSettings();
    expect(page.vatError()).toContain('between 0 and 100');
    expect(api.updateShippingSettings).not.toHaveBeenCalled();
  });

  it('sends a trimmed reason and the manual policy switches', async () => {
    const fixture = mount();
    const page = fixture.componentInstance;
    page.openSettings();
    page.st.shipping = true;
    page.st.vat = true;
    page.st.vatRate = 7.5;
    page.st.pricesIncludeVat = true;
    page.st.deliveryTaxable = true;
    page.st.coupons = false;
    page.st.reason = '  Delivery pricing goes live with the zone rate table  ';
    await page.saveSettings();
    expect(api.updateShippingSettings).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        shippingEnabled: true,
        vatEnabled: true,
        vatRatePercent: 7.5,
        pricesIncludeVat: true,
        deliveryTaxable: true,
        couponsEnabled: false,
        freeDeliveryThreshold: undefined,
        reason: 'Delivery pricing goes live with the zone rate table',
      }),
    );
    expect(page.settings()?.shippingEnabled).toBeTrue();
    expect(page.editingSettings()).toBeFalse();
  });

  it('clears the free delivery offer by sending null, not by omitting it', async () => {
    const fixture = mount();
    fixture.componentInstance.settings.set({ ...SETTINGS, freeDeliveryThreshold: 100000 });
    fixture.detectChanges();
    const page = fixture.componentInstance;
    page.openSettings();
    page.st.threshold = null;
    page.st.reason = 'ending the free delivery offer';
    await page.saveSettings();
    expect(api.updateShippingSettings).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({ freeDeliveryThreshold: null }),
    );
  });

  it('surfaces an API failure without closing the drawer', async () => {
    await TestBed;
    setUp();
    api.updateShippingSettings.and.returnValue(throwError(() => ({ error: { message: 'Denied' } })));
    const fixture = TestBed.createComponent(LogisticsAdminPage);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    page.openSettings();
    page.st.reason = 'any change';
    await page.saveSettings();
    expect(page.editingSettings()).toBeTrue();
    expect(page.settings()?.shippingEnabled).toBeFalse();
  });
});
