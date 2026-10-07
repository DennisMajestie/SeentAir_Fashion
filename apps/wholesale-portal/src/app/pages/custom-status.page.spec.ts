import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { SeConfirmService, SeCurrencyService } from '@seentair/ui';
import { of, throwError } from 'rxjs';

import { ApiService, CustomOrder } from '../api.service';
import { CustomStatusPage } from './custom-status.page';

const ID = 'abcdef12-3456-7890-abcd-ef1234567890';

function request(status: string, extra: Partial<CustomOrder> = {}): CustomOrder {
  return {
    id: ID,
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
    ...extra,
  };
}

describe('CustomStatusPage', () => {
  let fixture: ComponentFixture<CustomStatusPage>;
  let api: jasmine.SpyObj<ApiService>;
  let confirm: jasmine.SpyObj<SeConfirmService>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  /**
   * Flush the confirm promise and the synchronous API call behind it. Not
   * `whenStable()`: the success toast arms a dismissal timer that keeps the
   * fixture unstable for longer than the Jasmine timeout.
   */
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 3; i++) await Promise.resolve();
    fixture.detectChanges();
  };
  const button = (text: string): HTMLButtonElement => {
    const b = Array.from(el().querySelectorAll('button')).find((x) =>
      x.textContent!.trim().startsWith(text),
    );
    if (!b) throw new Error(`No button "${text}"`);
    return b;
  };

  const mount = (orders: unknown, quote: unknown = of({ amount: 350000, note: null })): void => {
    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'customOrders',
      'quotation',
      'acceptQuote',
      'decideSample',
    ]);
    api.customOrders.and.returnValue(orders as never);
    api.quotation.and.returnValue(quote as never);
    api.acceptQuote.and.returnValue(of({}));
    api.decideSample.and.returnValue(of({}));
    confirm = jasmine.createSpyObj<SeConfirmService>('SeConfirmService', ['ask', 'askWithReason']);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: api },
        { provide: SeConfirmService, useValue: confirm },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: ID }) } },
        },
      ],
    });
    TestBed.inject(SeCurrencyService).config.set({
      currencyCode: 'NGN',
      currencySymbol: '₦',
      locale: 'en-NG',
    });
    fixture = TestBed.createComponent(CustomStatusPage);
    fixture.detectChanges();
  };
  afterEach(() => fixture?.destroy());

  it('names the request, its status and the facts behind the decision', () => {
    mount(of({ data: [request('quoted')], total: 1 }));
    expect(el().querySelector('h1')!.textContent).toContain('#CR-ABCDEF12');
    expect(el().querySelector('.se-page__header, header')!.textContent).toContain('Quoted');
    expect(el().querySelector('.se-detail__aside')!.textContent).toContain('450 GSM terry');
    expect(el().querySelector('.se-detail__main')!.textContent).toContain('₦350,000');
    expect(el().textContent).toContain('excluded from the 12-hour returns window');
  });

  it('shows a danger banner with retry when the load fails, and the empty state when not found', () => {
    mount(throwError(() => ({ error: { message: 'Desk offline' } })));
    expect(el().querySelector('se-banner')!.textContent).toContain('Desk offline');
    expect(el().querySelector('se-empty-state')).toBeNull();
    fixture.destroy();
    TestBed.resetTestingModule();
    mount(of({ data: [], total: 0 }));
    expect(el().querySelector('se-empty-state')!.textContent).toContain('Request not found');
  });

  it('accepts the quote only after the confirmation resolves true', async () => {
    mount(of({ data: [request('quoted')], total: 1 }));
    confirm.ask.and.returnValue(Promise.resolve(false));
    button('Accept quote').click();
    await settle();
    expect(confirm.ask).toHaveBeenCalled();
    expect(confirm.ask.calls.mostRecent().args[0].title).toContain('₦350,000');
    expect(api.acceptQuote).not.toHaveBeenCalled();

    confirm.ask.and.returnValue(Promise.resolve(true));
    button('Accept quote').click();
    await settle();
    expect(api.acceptQuote).toHaveBeenCalledOnceWith(ID);
  });

  it('sends the rejection note from the reason dialog to decideSample', async () => {
    mount(of({ data: [request('sample_in_production')], total: 1 }));
    confirm.askWithReason.and.returnValue(Promise.resolve('Deepen the ribbing'));
    button('Request changes').click();
    await settle();
    expect(confirm.askWithReason.calls.mostRecent().args[0].reasonLabel).toBeTruthy();
    expect(api.decideSample).toHaveBeenCalledOnceWith(ID, false, 'Deepen the ribbing');
  });

  it('does nothing when the rejection dialog is cancelled', async () => {
    mount(of({ data: [request('sample_in_production')], total: 1 }));
    confirm.askWithReason.and.returnValue(Promise.resolve(null));
    button('Request changes').click();
    await settle();
    expect(api.decideSample).not.toHaveBeenCalled();
  });

  it('approves the sample without a note after confirmation', async () => {
    mount(of({ data: [request('sample_in_production')], total: 1 }));
    confirm.ask.and.returnValue(Promise.resolve(true));
    button('Approve sample').click();
    await settle();
    expect(api.decideSample).toHaveBeenCalledOnceWith(ID, true, undefined);
  });
});
