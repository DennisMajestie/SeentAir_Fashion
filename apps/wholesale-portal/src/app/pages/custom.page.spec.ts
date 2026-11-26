import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SeCurrencyService, SeToastService } from '@seentair/ui';
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
  let toast: jasmine.SpyObj<SeToastService>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (): string => (el().textContent ?? '').replace(/\s+/g, ' ');

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
    toast = jasmine.createSpyObj<SeToastService>('SeToastService', ['show']);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: api },
        { provide: SeToastService, useValue: toast },
      ],
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

  it('lists the requests as cards with reference, units, status and a way in', () => {
    mount(
      of({
        data: [request('aaaaaaaa-1111', 'quoted'), request('bbbbbbbb-2222', 'in_production')],
        total: 2,
      }),
    );
    const cards = el().querySelectorAll('.request-card');
    expect(cards.length).toBe(2);
    expect(cards[0].textContent).toContain('#CR-AAAAAAAA');
    expect(cards[0].textContent).toContain('20');
    expect(cards[0].textContent).toContain('Quoted');
    expect(cards[0].textContent).toContain('Review Quote');
    expect(cards[1].textContent).toContain('In production');
    expect(cards[1].textContent).toContain('View Details');
  });

  it('shows the empty state with a way to start when there are no requests', () => {
    mount(of({ data: [], total: 0 }));
    expect(el().querySelector('.empty-state')!.textContent).toContain('No custom requests yet');
  });

  it('shows a retryable error when the list fails', () => {
    mount(throwError(() => ({ error: { message: 'Desk offline' } })));
    expect(el().querySelector('.load-error')!.textContent).toContain('Desk offline');
    api.customOrders.and.returnValue(
      of({ data: [request('aaaaaaaa-1111', 'quoted')], total: 1 }),
    );
    fixture.componentInstance.load();
    fixture.detectChanges();
    expect(el().querySelector('.request-card')).not.toBeNull();
  });

  it('opens the request sheet when the New Request button is clicked', () => {
    mount(of({ data: [], total: 0 }));
    el().querySelector<HTMLButtonElement>('.new-btn')!.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.formOpen()).toBeTrue();
    expect(el().textContent).toContain('New Custom Design Request');
  });

  it('renders the request form inline when the New Request button is tapped', () => {
    mount(of({ data: [], total: 0 }));
    el().querySelector<HTMLButtonElement>('.new-btn')!.click();
    fixture.detectChanges();
    expect(el().querySelector('#custom-form-panel')).not.toBeNull();
    expect(fixture.componentInstance.formOpen()).toBeTrue();
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
    expect(el().querySelectorAll('.field-error').length).toBe(6);
    expect(el().querySelector('.field-error')!.textContent).toContain('fabric');
    expect(page.formOpen()).toBeTrue();
  });

  it('keeps the sheet open until the request is accepted', () => {
    mount(of({ data: [], total: 0 }));
    const page = fixture.componentInstance;
    page.openForm();
    fixture.detectChanges();
    expect(text()).toContain('New Custom Design Request');
    page.formOpen.set(false);
    fixture.detectChanges();
    expect(text()).not.toContain('New Custom Design Request');
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
    expect(toast.show).toHaveBeenCalledWith(
      jasmine.stringContaining('submitted for technical review'),
      jasmine.anything(),
    );
  });
});
