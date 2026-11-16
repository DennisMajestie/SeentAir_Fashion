import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SupportConfigService } from './support-config.service';

/**
 * The floating WhatsApp button.
 *
 * Renders only when the operator has published a WhatsApp Business link on the
 * dashboard's Settings page: an unset link hides the button entirely rather
 * than advertising a dead contact route. It sits above the mobile tab bar and
 * clears it, and hangs off the bottom-right corner on desktop; see .wa-float
 * in styles.scss.
 */
@Component({
  selector: 'app-whatsapp-float',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (support.whatsappUrl(); as url) {
      <a class="wa-float" [href]="url" target="_blank" rel="noopener" aria-label="Chat with us on WhatsApp">
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path
            fill="currentColor"
            d="M16 3C9.4 3 4 8.4 4 15c0 2.1.6 4.2 1.7 6L4 27l6.2-1.6c1.7.9 3.7 1.4 5.8 1.4 6.6 0 12-5.4 12-12S22.6 3 16 3zm0 21.8c-1.9 0-3.7-.5-5.3-1.5l-.4-.2-3.7 1 1-3.6-.3-.4A9.7 9.7 0 0 1 6.2 15C6.2 9.5 10.6 5.2 16 5.2S25.8 9.5 25.8 15 21.4 24.8 16 24.8zm5.4-7.3c-.3-.15-1.7-.85-2-1-.3-.1-.5-.15-.7.15-.2.3-.8 1-.95 1.2-.17.2-.35.22-.65.07-.3-.15-1.28-.47-2.44-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3-.02-.47.13-.62.15-.15.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.38-.02-.53-.07-.15-.65-1.57-.9-2.15-.23-.56-.47-.48-.65-.49h-.55c-.2 0-.5.07-.75.35-.27.28-1 .98-1 2.4 0 1.4 1.03 2.77 1.17 2.96.15.2 2 3.2 4.95 4.37.7.3 1.24.48 1.66.6.7.23 1.34.2 1.84.12.56-.08 1.72-.7 1.96-1.38.24-.68.24-1.26.17-1.38-.07-.12-.25-.2-.55-.35z"
          />
        </svg>
      </a>
    }
  `,
})
export class WhatsappFloatComponent {
  protected readonly support = inject(SupportConfigService);
}
