import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SeTab, SeTabPanelDirective, SeTabsComponent } from './tabs.component';

@Component({
  imports: [SeTabsComponent, SeTabPanelDirective],
  template: `
    <se-tabs #t label="Order status" [tabs]="tabs" [(active)]="active" />
    @for (tab of tabs; track tab.id) {
      <div [seTabPanel]="tab.id" [for]="t">{{ tab.label }} panel</div>
    }
  `,
})
class Host {
  readonly tabs: SeTab[] = [
    { id: 'open', label: 'Open', count: 12 },
    { id: 'shipped', label: 'Shipped' },
    { id: 'returned', label: 'Returned', count: 0 },
  ];
  readonly active = signal<string | undefined>(undefined);
}

describe('se-tabs', () => {
  const setup = () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const tabs = () => Array.from(el.querySelectorAll<HTMLElement>('[role=tab]'));
    const panels = () => Array.from(el.querySelectorAll<HTMLElement>('[role=tabpanel]'));
    const selected = () => tabs().map((t) => t.getAttribute('aria-selected'));
    const key = (k: string) => {
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key: k, bubbles: true }),
      );
      fixture.detectChanges();
    };
    return { fixture, el, tabs, panels, selected, key };
  };

  it('is a named tab list whose first tab is active by default', () => {
    const { el, tabs, selected } = setup();
    expect(el.querySelector('[role=tablist]')!.getAttribute('aria-label')).toBe('Order status');
    expect(
      tabs().every((t) => t.tagName === 'BUTTON' && t.getAttribute('type') === 'button'),
    ).toBeTrue();
    expect(selected()).toEqual(['true', 'false', 'false']);
    expect(tabs()[0].textContent).toContain('12');
    expect(tabs()[2].querySelector('.se-tabs__count')!.textContent!.trim()).toBe('0');
  });

  it('keeps only the active tab in the tab order', () => {
    const { fixture, tabs } = setup();
    expect(tabs().map((t) => t.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    fixture.componentInstance.active.set('returned');
    fixture.detectChanges();
    expect(tabs().map((t) => t.getAttribute('tabindex'))).toEqual(['-1', '-1', '0']);
    expect(tabs()[2].classList).toContain('se-tabs__tab--active');
  });

  it('links each tab to its panel, and each panel back to its tab', () => {
    const { tabs, panels } = setup();
    tabs().forEach((tab, i) => {
      const panel = panels()[i];
      expect(tab.id).toBeTruthy();
      expect(tab.getAttribute('aria-controls')).toBe(panel.id);
      expect(panel.getAttribute('aria-labelledby')).toBe(tab.id);
      expect(panel.getAttribute('tabindex')).toBe('0');
    });
    expect(new Set([...tabs(), ...panels()].map((e) => e.id)).size).toBe(6);
  });

  it('shows only the panel of the active tab', () => {
    const { fixture, tabs, panels } = setup();
    expect(panels().map((p) => p.hidden)).toEqual([false, true, true]);
    tabs()[1].click();
    fixture.detectChanges();
    expect(fixture.componentInstance.active()).toBe('shipped');
    expect(panels().map((p) => p.hidden)).toEqual([true, false, true]);
  });

  it('moves and activates with the arrow keys, wrapping at the ends', () => {
    const { fixture, tabs, selected, key } = setup();
    tabs()[0].focus();
    key('ArrowRight');
    expect(selected()).toEqual(['false', 'true', 'false']);
    expect(document.activeElement).toBe(tabs()[1]);
    expect(fixture.componentInstance.active()).toBe('shipped');
    key('ArrowLeft');
    key('ArrowLeft');
    expect(selected()).toEqual(['false', 'false', 'true']);
    expect(document.activeElement).toBe(tabs()[2]);
    key('ArrowRight');
    expect(document.activeElement).toBe(tabs()[0]);
  });

  it('jumps to the ends with Home and End', () => {
    const { tabs, selected, key } = setup();
    tabs()[0].focus();
    key('End');
    expect(selected()).toEqual(['false', 'false', 'true']);
    expect(document.activeElement).toBe(tabs()[2]);
    key('Home');
    expect(selected()).toEqual(['true', 'false', 'false']);
    expect(document.activeElement).toBe(tabs()[0]);
  });

  it('falls back to the first tab when the active id names no tab', () => {
    const { fixture, selected } = setup();
    fixture.componentInstance.active.set('nope');
    fixture.detectChanges();
    expect(selected()).toEqual(['true', 'false', 'false']);
  });
});
