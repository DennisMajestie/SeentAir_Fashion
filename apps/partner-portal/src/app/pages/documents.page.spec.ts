import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PortalStore } from '../portal.store';
import { configurePortal } from '../testing';
import { DocumentsPage } from './documents.page';

describe('DocumentsPage', () => {
  let fixture: ComponentFixture<DocumentsPage>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  afterEach(() => fixture?.destroy());

  it('shows the registry holdings and an empty vault count', () => {
    configurePortal();
    fixture = TestBed.createComponent(DocumentsPage);
    fixture.detectChanges();
    const metrics = el().querySelector('.se-metric-grid')!.textContent!;
    expect(metrics).toContain('250,000 shares');
    expect(metrics).toContain('₦2,000,000');
    expect(metrics).toContain('0');
  });

  it('renders the corporate vault with honest empty states', () => {
    configurePortal();
    fixture = TestBed.createComponent(DocumentsPage);
    fixture.detectChanges();
    const vault = el().querySelector('.se-detail__main')!.textContent!;
    expect(vault).toContain('No documents yet');
    expect(vault).toContain('No letters yet');
    expect(vault).toContain('No filings yet');
  });

  it('shows a live in-platform message in the desk inbox', () => {
    configurePortal();
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
    fixture = TestBed.createComponent(DocumentsPage);
    fixture.detectChanges();
    const desk = el().querySelector('.se-detail__aside')!.textContent!;
    expect(desk).toContain('Quarterly briefing available');
    expect(desk).toContain('Terminal');
  });

  it('never shows a customer name, email or address', () => {
    configurePortal();
    fixture = TestBed.createComponent(DocumentsPage);
    fixture.detectChanges();
    expect(el().textContent).not.toMatch(/@|customer|address/i);
  });
});
