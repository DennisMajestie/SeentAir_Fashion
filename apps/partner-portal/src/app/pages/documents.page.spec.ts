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
    const metrics = el().querySelector('.metrics')!.textContent!;
    expect(metrics).toContain('250,000 shares');
    expect(metrics).toContain('₦2,000,000');
    expect(metrics).toContain('0');
  });

  it('renders the corporate vault with honest pending states', () => {
    configurePortal();
    fixture = TestBed.createComponent(DocumentsPage);
    fixture.detectChanges();
    const vault = el().querySelector('.vault')!.textContent!;
    expect(vault).toContain("Shareholders' Agreement");
    expect(vault).toContain("Managing Director's quarterly letters");
    expect(vault).toContain('Statutory receipts');
    expect(vault).toContain('Awaiting release');
    expect(vault).toContain('Not yet shared');
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
    const desk = el().querySelector('.desk')!.textContent!;
    expect(desk).toContain('Quarterly briefing available');
    expect(desk).toContain('Terminal');
    expect(desk).toContain('Sent');
  });

  it('never shows a customer name, email or address', () => {
    configurePortal();
    fixture = TestBed.createComponent(DocumentsPage);
    fixture.detectChanges();
    expect(el().textContent).not.toMatch(/@|customer|address/i);
  });
});
