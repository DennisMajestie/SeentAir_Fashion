import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ApiService, type PartnerInquiry } from '../api.service';
import { PortalStore } from '../portal.store';
import { configurePortal } from '../testing';
import { DocumentsPage } from './documents.page';

const THREAD: PartnerInquiry = {
  id: 'c1',
  subject: 'Partner inquiry',
  status: 'open',
  lastMessageAt: '2026-10-02T10:00:00Z',
  lastMessagePreview: 'Please share the Q3 agreement.',
};

describe('DocumentsPage', () => {
  let fixture: ComponentFixture<DocumentsPage>;
  let api: jasmine.SpyObj<ApiService>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  afterEach(() => fixture?.destroy());

  function mount(threads: PartnerInquiry[] = []): void {
    api = jasmine.createSpyObj<ApiService>('ApiService', ['myInquiries', 'createInquiry']);
    api.myInquiries.and.returnValue(of(threads));
    api.createInquiry.and.returnValue(of(THREAD));
    configurePortal(undefined, [{ provide: ApiService, useValue: api }]);
    fixture = TestBed.createComponent(DocumentsPage);
    fixture.detectChanges();
  }

  it('shows the registry holdings and an honest empty vault', () => {
    mount();
    const metrics = el().querySelector('.metrics')!.textContent!;
    expect(metrics).toContain('250,000 shares');
    expect(metrics).toContain('₦2,000,000');
    expect(metrics).toContain('Inquiries');
    expect(el().querySelector('.vault')!.textContent).toContain('No documents have been shared yet');
  });

  it('lists inquiry threads returned by the API', () => {
    mount([THREAD]);
    expect(api.myInquiries).toHaveBeenCalled();
    expect(el().querySelector('.vault')!.textContent).toContain('Please share the Q3 agreement.');
  });

  it('sends an inquiry to the management desk and shows it', () => {
    mount();
    const textarea = el().querySelector('#inquiry') as HTMLTextAreaElement;
    textarea.value = 'Please share the Q3 agreement.';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    (el().querySelector('.compose button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(api.createInquiry).toHaveBeenCalledOnceWith('Please share the Q3 agreement.');
    expect(el().querySelector('.vault')!.textContent).toContain('Please share the Q3 agreement.');
  });

  it('shows a live in-platform message in the desk inbox', () => {
    mount();
    TestBed.inject(PortalStore).messages.set([
      {
        id: 'm1',
        channel: 'in_platform',
        type: 'generic',
        relatedOrderId: null,
        message: 'Quarterly briefing available',
        status: 'sent',
        sentAt: '2026-10-01T10:00:00Z',
      },
    ]);
    fixture.detectChanges();
    const desk = el().querySelector('.desk')!.textContent!;
    expect(desk).toContain('Quarterly briefing available');
    expect(desk).toContain('Terminal');
    expect(desk).toContain('Sent');
  });

  it('never shows a customer name, email or address', () => {
    mount();
    expect(el().textContent).not.toMatch(/@|customer|address/i);
  });
});
