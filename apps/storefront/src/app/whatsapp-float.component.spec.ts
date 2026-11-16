import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { SupportConfigService } from './support-config.service';
import { WhatsappFloatComponent } from './whatsapp-float.component';

/**
 * The float is an honesty test: it must not exist as a dead button. Before the
 * operator publishes a WhatsApp link there is nowhere to go, so the anchor is
 * not rendered at all — and once a link exists, it points exactly there.
 */
describe('WhatsappFloatComponent', () => {
  let url: ReturnType<typeof signal<string | null>>;

  const mount = (): ComponentFixture<WhatsappFloatComponent> => {
    TestBed.configureTestingModule({
      imports: [WhatsappFloatComponent],
      providers: [{ provide: SupportConfigService, useValue: { whatsappUrl: url } }],
    });
    const fixture = TestBed.createComponent(WhatsappFloatComponent);
    fixture.detectChanges();
    return fixture;
  };

  beforeEach(() => {
    url = signal<string | null>(null);
  });

  it('renders nothing while no WhatsApp link is published', () => {
    const fixture = mount();
    expect((fixture.nativeElement as HTMLElement).querySelector('.wa-float')).toBeNull();
  });

  it('links the floating button to the published WhatsApp Business link', () => {
    url.set('https://wa.me/2348000000000');
    const fixture = mount();
    const anchor = (fixture.nativeElement as HTMLElement).querySelector(
      '.wa-float',
    ) as HTMLAnchorElement;
    expect(anchor).not.toBeNull();
    expect(anchor.href).toBe('https://wa.me/2348000000000');
    expect(anchor.target).toBe('_blank');
    expect(anchor.rel).toContain('noopener');
    expect(anchor.getAttribute('aria-label')).toBe('Chat with us on WhatsApp');
  });
});
