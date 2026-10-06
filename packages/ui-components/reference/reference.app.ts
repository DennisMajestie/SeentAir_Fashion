import { Component, signal } from '@angular/core';
import { SeButtonDirective } from '@seentair/ui';
import { ButtonsSection } from './sections/buttons.section';
import { FieldsSection } from './sections/fields.section';

/**
 * The component reference: every component in the system, rendered in its
 * states. Run it with `npm run reference` from packages/ui-components.
 */
@Component({
  selector: 'se-reference',
  imports: [SeButtonDirective, ButtonsSection, FieldsSection],
  template: `
    <header class="ref-top">
      <h1>Seentair components</h1>
      <nav class="ref-nav" aria-label="Sections">
        @for (s of sections; track s.id) {
          <a seButton variant="ghost" size="sm" [href]="'#' + s.id">{{ s.title }}</a>
        }
      </nav>
      <button seButton size="sm" [attr.aria-pressed]="dark()" (click)="toggleTheme()">
        {{ dark() ? 'Light theme' : 'Dark theme' }}
      </button>
    </header>
    <main class="ref-main">
      <section class="ref-section" id="buttons">
        <h2>Buttons</h2>
        <ref-buttons />
      </section>
      <section class="ref-section" id="fields">
        <h2>Form fields</h2>
        <ref-fields />
      </section>
    </main>
  `,
})
export class ReferenceApp {
  readonly dark = signal(false);
  readonly sections = [
    { id: 'buttons', title: 'Buttons' },
    { id: 'fields', title: 'Form fields' },
  ];

  toggleTheme(): void {
    this.dark.update((d) => !d);
    document.documentElement.setAttribute('data-theme', this.dark() ? 'dark' : 'light');
  }
}
