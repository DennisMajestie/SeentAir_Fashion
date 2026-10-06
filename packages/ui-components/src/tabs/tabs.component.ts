import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  ElementRef,
  computed,
  inject,
  input,
  model,
} from '@angular/core';

export interface SeTab {
  id: string;
  label: string;
  /** A count shown after the label, e.g. orders waiting. */
  count?: number;
}

let nextId = 0;

/**
 * Tabs: a few views of the same thing, one visible at a time.
 *
 *     <se-tabs #orderTabs label="Order status" [tabs]="tabs" [(active)]="tab" />
 *     <div seTabPanel="open" [for]="orderTabs">…</div>
 *     <div seTabPanel="shipped" [for]="orderTabs">…</div>
 *
 * Arrow keys move between tabs and activate them; Home and End jump to the
 * ends. Only the active tab is in the tab order, so Tab goes straight from the
 * tab list into the panel.
 */
@Component({
  selector: 'se-tabs',
  exportAs: 'seTabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'se-tabs' },
  template: `
    <div
      class="se-tabs__list"
      role="tablist"
      [attr.aria-label]="label()"
      (keydown)="onKeydown($event)"
    >
      @for (tab of tabs(); track tab.id) {
        <button
          class="se-tabs__tab se-focusable"
          type="button"
          role="tab"
          [class.se-tabs__tab--active]="tab.id === current()"
          [id]="tabId(tab.id)"
          [attr.aria-selected]="tab.id === current()"
          [attr.aria-controls]="panelId(tab.id)"
          [attr.tabindex]="tab.id === current() ? 0 : -1"
          (click)="active.set(tab.id)"
        >
          {{ tab.label }}
          @if (tab.count !== undefined) {
            <span class="se-tabs__count">{{ tab.count }}</span>
          }
        </button>
      }
    </div>
  `,
})
export class SeTabsComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly uid = `se-tabs-${nextId++}`;

  readonly tabs = input.required<SeTab[]>();
  /** The accessible name of the tab list, e.g. "Order status". */
  readonly label = input.required<string>();
  /** The id of the active tab. Left unset, the first tab is active. */
  readonly active = model<string>();

  /** The tab that is showing: `active` if it names a real tab, else the first. */
  readonly current = computed(() => {
    const tabs = this.tabs();
    const active = this.active();
    return tabs.some((t) => t.id === active) ? active : tabs[0]?.id;
  });

  tabId(id: string): string {
    return `${this.uid}-tab-${id}`;
  }

  panelId(id: string): string {
    return `${this.uid}-panel-${id}`;
  }

  protected onKeydown(event: KeyboardEvent): void {
    const tabs = this.tabs();
    const at = tabs.findIndex((t) => t.id === this.current());
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
        next = (at + 1) % tabs.length;
        break;
      case 'ArrowLeft':
        next = (at - 1 + tabs.length) % tabs.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = tabs.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const tab = tabs[next];
    if (!tab) return;
    this.active.set(tab.id);
    // The button exists already; only its tabindex changes on the next render.
    this.host.nativeElement
      .querySelector<HTMLElement>(`#${CSS.escape(this.tabId(tab.id))}`)
      ?.focus();
  }
}

/**
 * The content of one tab. It is hidden unless its tab is active, and is itself
 * focusable so keyboard users land on it straight after the tab list.
 *
 *     <div seTabPanel="open" [for]="orderTabs">…</div>
 */
@Directive({
  selector: '[seTabPanel]',
  host: {
    class: 'se-tabs__panel se-focusable',
    role: 'tabpanel',
    tabindex: '0',
    '[id]': 'for().panelId(seTabPanel())',
    '[attr.aria-labelledby]': 'for().tabId(seTabPanel())',
    '[hidden]': 'for().current() !== seTabPanel()',
  },
})
export class SeTabPanelDirective {
  /** The id of the tab this panel belongs to. */
  readonly seTabPanel = input.required<string>();
  /** The `se-tabs` this panel belongs to (a template reference to it). */
  readonly for = input.required<SeTabsComponent>();
}
