import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * The system's icon set: stroke icons on a 24px grid, drawn inline so they take
 * `currentColor` and need no icon font. One or more path strings per icon.
 */
const ICONS = {
  alert: ['M12 3.5 2.5 20h19L12 3.5Z', 'M12 10v4.5', 'M12 17.2v.3'],
  'arrow-down': ['M12 5v14', 'm6 13 6 6 6-6'],
  'arrow-up': ['M12 19V5', 'm6 11 6-6 6 6'],
  bell: ['M6 10a6 6 0 0 1 12 0v4l2 3H4l2-3v-4Z', 'M10 20a2 2 0 0 0 4 0'],
  box: ['M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9Z', 'M3.5 7.5 12 12l8.5-4.5', 'M12 12v9'],
  calendar: ['M4 6h16v14H4V6Z', 'M4 10h16', 'M8 3v4', 'M16 3v4'],
  cart: ['M3 4h2l2.4 12h10.2L20 8H6', 'M9 20h.01', 'M17 20h.01'],
  chart: ['M4 20V4', 'M4 20h16', 'M8 16v-4', 'M12 16V8', 'M16 16v-6'],
  check: ['M5 12.5 9.5 17 19 7.5'],
  'check-circle': ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'm8 12.5 2.8 2.8L16 9.8'],
  'chevron-down': ['m6 9 6 6 6-6'],
  'chevron-left': ['m15 6-6 6 6 6'],
  'chevron-right': ['m9 6 6 6-6 6'],
  'chevron-up': ['m6 15 6-6 6 6'],
  'clipboard-check': ['M8 5H6v15h12V5h-2', 'M9 3.5h6v3H9v-3Z', 'm9 13 2.2 2.2L15 11.5'],
  close: ['M6 6l12 12', 'M18 6 6 18'],
  copy: ['M9 9h11v11H9V9Z', 'M5 15H4V4h11v1'],
  download: ['M12 4v11', 'm7 11 5 5 5-5', 'M5 20h14'],
  edit: ['M4 20h4L19 9l-4-4L4 16v4Z', 'm13.5 6.5 4 4'],
  external: ['M14 5h5v5', 'M19 5 11 13', 'M18 14v5H5V6h5'],
  eye: [
    'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z',
    'M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  ],
  filter: ['M4 5h16l-6.2 7.4V18l-3.6 1.8v-7.4L4 5Z'],
  home: ['m4 11 8-7 8 7', 'M6 10v10h12V10'],
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 11v5.5', 'M12 7.6v.3'],
  layers: [
    'm12 3.5 8.5 4.5L12 12.5 3.5 8 12 3.5Z',
    'm3.5 12 8.5 4.5 8.5-4.5',
    'm3.5 16 8.5 4.5 8.5-4.5',
  ],
  logout: ['M10 4H5v16h5', 'M15 8l4 4-4 4', 'M19 12H9'],
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  more: ['M12 5.5v.01', 'M12 12v.01', 'M12 18.5v.01'],
  'panel-left': ['M4 5h16v14H4V5Z', 'M9.5 5v14'],
  plus: ['M12 5v14', 'M5 12h14'],
  refresh: [
    'M20 11a8 8 0 0 0-14.5-4L4 9',
    'M4 4v5h5',
    'M4 13a8 8 0 0 0 14.5 4L20 15',
    'M20 20v-5h-5',
  ],
  rows: ['M4 6h16', 'M4 10h16', 'M4 14h16', 'M4 18h16'],
  search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z', 'm20 20-3.8-3.8'],
  settings: [
    'M4 7h10',
    'M18 7h2',
    'M4 17h2',
    'M10 17h10',
    'M16 9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
    'M8 19.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  ],
  sort: ['m8 9 4-4 4 4', 'm8 15 4 4 4-4'],
  tag: ['M3.5 12.5 12 4h7.5v7.5L11 20l-7.5-7.5Z', 'M15.5 8.5h.01'],
  trash: ['M5 7h14', 'M9 7V4h6v3', 'M7 7l1 13h8l1-13', 'M10 11v6', 'M14 11v6'],
  user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M4.5 20a7.5 7.5 0 0 1 15 0'],
  users: [
    'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
    'M2.5 20a6.5 6.5 0 0 1 13 0',
    'M16 4.3a3.5 3.5 0 0 1 0 6.4',
    'M18 14.2a6.5 6.5 0 0 1 3.5 5.8',
  ],
  'x-circle': ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'm9 9 6 6', 'm15 9-6 6'],
} as const;

export type SeIconName = keyof typeof ICONS;
export const SE_ICON_NAMES = Object.keys(ICONS) as SeIconName[];

/**
 * An icon from the system set. Decorative by default (hidden from assistive
 * technology); pass `label` when the icon is the only thing conveying meaning.
 *
 *     <se-icon name="search" />
 *     <se-icon name="alert" label="Warning" />
 */
@Component({
  selector: 'se-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'se-icon',
    '[attr.role]': "label() ? 'img' : null",
    '[attr.aria-label]': 'label() || null',
    '[attr.aria-hidden]': "label() ? null : 'true'",
  },
  template: `
    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
      @for (d of paths(); track d) {
        <path [attr.d]="d" />
      }
    </svg>
  `,
})
export class SeIconComponent {
  readonly name = input.required<SeIconName>();
  /** Accessible name. Leave unset when text next to the icon says the same thing. */
  readonly label = input<string>('');
  readonly paths = computed(() => ICONS[this.name()] as readonly string[]);
}
