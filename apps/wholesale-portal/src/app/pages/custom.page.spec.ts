import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SeCurrencyService } from '@seentair/ui';
import { of, throwError } from 'rxjs';

import { ApiService, CustomOrder, Pricing } from '../api.service';
import { CustomPage } from './custom.page';

function request(id: string, status: string): CustomOrder {
  return {
    id,
    status,
    sizes: 'M×10, L×10',
    colours: 'moss',
    quantity: 20,
    location: 'Onitsha',
    fabricQuality: '450 GSM terry',
    description: 'Boxy hoodie',
    desiredDate: '2026-11-20',
    reviewNote: null,
    paidAt: null,
    createdAt: '2026-10-01T10:00:00Z',
  };
}

describe('CustomPage', () => {
  let fixture: ComponentFixture<CustomPage>;
  let api: jasmine.SpyObj<ApiService>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const mount = (requests: unknown): void => {
    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'customOrders',
      'pricing',
      'submitCustomOrder',
    ]);
    api.customOrders.and.returnValue(requests as never);
    api.pricing.and.returnValue(
      of({ moq: 20, tier: null, hasDiscount: false } as unknown as Pricing),
    );
    api.submitCustomOrder.and.returnValue(of(request('created-1', 'submitted')));
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: ApiService, useValue: api }],
    });
    TestBed.inject(SeCurrencyService).config.set({
      currencyCode: 'NGN',
      currencySymbol: '₦',
      locale: 'en-NG',
    });
    fixture = TestBed.createComponent(CustomPage);
    fixture.detectChanges();
  };
  afterEach(() => fixture?.destroy());

  it('lists the requests with their reference, units and status', () => {
    mount(
      of({
        data: [request('aaaaaaaa-1111', 'quoted'), request('bbbbbbbb-2222', 'in_production')],
        total: 2,
      }),
    );
    const rows = el().querySelectorAll('se-table tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('#CR-AAAAAAAA');
    expect(rows[0].textContent).toContain('20');
    expect(rows[0].textContent).toContain('Quoted');
    expect(rows[1].textContent).toContain('In production');
  });

  it('shows the table error with a retry when the list fails', () => {
    mount(throwError(() => ({ error: { message: 'Desk offline' } })));
    expect(el().querySelector('se-table')!.textContent).toContain('Desk offline');
  });

  it('rejects an empty form with errors under the fields and does not call the API', () => {
    mount(of({ data: [], total: 0 }));
    const page = fixture.componentInstance;
    page.openForm();
    fixture.detectChanges();
    page.submit();
    fixture.detectChanges();
    expect(api.submitCustomOrder).not.toHaveBeenCalled();
    const errors = page.errors();
    expect(Object.keys(errors).sort()).toEqual([
      'colours',
      'description',
      'desiredDate',
      'fabricQuality',
      'location',
      'sizes',
    ]);
    expect(el().querySelectorAll('se-field.se-field--invalid').length).toBe(6);
    expect(
      el().querySelector('se-field.se-field--invalid .se-field__error')!.textContent,
    ).toContain('fabric');
    expect(page.formOpen()).toBeTrue();
  });

  it('submits a valid form with the exact request body, then closes and reloads', () => {
    mount(of({ data: [], total: 0 }));
    const page = fixture.componentInstance;
    page.openForm();
    page.form = {
      colours: 'moss, slate',
      location: 'Onitsha Commercial Hub',
      fabricQuality: '450 GSM terry',
      description: 'Boxy hoodie with kangaroo pocket',
      desiredDate: '2026-11-20',
    };
    page.setQty('M', 12);
    page.setQty('XL', 8);
    page.sizeNote = 'chest 46in × 2';
    api.customOrders.calls.reset();
    page.submit();
    fixture.detectChanges();
    expect(api.submitCustomOrder).toHaveBeenCalledOnceWith({
      colours: 'moss, slate',
      location: 'Onitsha Commercial Hub',
      fabricQuality: '450 GSM terry',
      description: 'Boxy hoodie with kangaroo pocket',
      desiredDate: '2026-11-20',
      sizes: 'M×12, XL×8, chest 46in × 2',
      quantity: 20,
    });
    expect(page.formOpen()).toBeFalse();
    expect(api.customOrders).toHaveBeenCalledTimes(1);
  });
});
