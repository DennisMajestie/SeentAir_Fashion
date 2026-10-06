import { Component, inject, signal } from '@angular/core';
import { SeButtonDirective, SeCurrencyService } from '@seentair/ui';
import { ButtonsSection } from './sections/buttons.section';
import { ChartsSection } from './sections/charts.section';
import { DisplaySection } from './sections/display.section';
import { FeedbackSection } from './sections/feedback.section';
import { FieldsSection } from './sections/fields.section';
import { NavigationSection } from './sections/navigation.section';
import { PatternsSection } from './sections/patterns.section';
import { TableSection } from './sections/table.section';

/**
 * The component reference: every component in the system, rendered in its
 * states. Run it with `npm run reference` from packages/ui-components.
 */
@Component({
  selector: 'se-reference',
  imports: [
    SeButtonDirective,
    ButtonsSection,
    ChartsSection,
    DisplaySection,
    FeedbackSection,
    FieldsSection,
    NavigationSection,
    PatternsSection,
    TableSection,
  ],
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
      <section class="ref-section" id="table">
        <h2>Data table</h2>
        <ref-table />
      </section>
      <section class="ref-section" id="display">
        <h2>Badges, cards and money</h2>
        <ref-display />
      </section>
      <section class="ref-section" id="feedback">
        <h2>Feedback</h2>
        <ref-feedback />
      </section>
      <section class="ref-section" id="navigation">
        <h2>Navigation</h2>
        <ref-navigation />
      </section>
      <section class="ref-section" id="charts">
        <h2>Charts</h2>
        <ref-charts />
      </section>
      <section class="ref-section" id="patterns">
        <h2>Patterns</h2>
        <ref-patterns />
      </section>
    </main>
  `,
})
export class ReferenceApp {
  readonly dark = signal(false);
  readonly sections = [
    { id: 'buttons', title: 'Buttons' },
    { id: 'fields', title: 'Form fields' },
    { id: 'table', title: 'Data table' },
    { id: 'display', title: 'Badges and cards' },
    { id: 'feedback', title: 'Feedback' },
    { id: 'navigation', title: 'Navigation' },
    { id: 'charts', title: 'Charts' },
    { id: 'patterns', title: 'Patterns' },
  ];

  constructor() {
    // The reference has no API behind it, so it sets the currency the way an
    // app's start-up would after fetching /config/public.
    inject(SeCurrencyService).config.set({
      currencyCode: 'NGN',
      currencySymbol: '₦',
      locale: 'en-NG',
    });
  }

  toggleTheme(): void {
    this.dark.update((d) => !d);
    document.documentElement.setAttribute('data-theme', this.dark() ? 'dark' : 'light');
  }
}
