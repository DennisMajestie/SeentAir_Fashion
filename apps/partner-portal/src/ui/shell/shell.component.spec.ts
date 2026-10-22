import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import {
  SeNavGroup,
  SeShellComponent,
  SeShellMenuItemDirective,
  SeShellUser,
} from './shell.component';

@Component({ template: '' })
class Page {}

@Component({
  imports: [SeShellComponent, SeShellMenuItemDirective],
  template: `
    <se-shell
      appName="Seentair admin"
      [nav]="nav"
      [user]="user()"
      [(collapsed)]="collapsed"
      (signOut)="signOuts = signOuts + 1"
    >
      <button seShellMenu type="button">Settings</button>
      <p class="page">Page content</p>
    </se-shell>
  `,
})
class Host {
  readonly nav: SeNavGroup[] = [
    { items: [{ label: 'Home', icon: 'home', link: '/', exact: true }] },
    {
      title: 'Factory',
      items: [
        { label: 'Orders', icon: 'cart', link: '/orders' },
        { label: 'Approvals', icon: 'check-circle', link: '/approvals', badge: 4 },
      ],
    },
  ];
  readonly user = signal<SeShellUser | null>({ name: 'Okereke Cynthia', role: 'Owner' });
  readonly collapsed = signal(false);
  signOuts = 0;
}

describe('se-shell', () => {
  /** `wide` stands in for the viewport: whether the 64rem media query matches. */
  const setup = (wide = true) => {
    spyOn(window, 'matchMedia').and.returnValue({
      matches: wide,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    } as unknown as MediaQueryList);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: Page },
          { path: 'orders', component: Page },
          { path: 'approvals', component: Page },
        ]),
      ],
    });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const q = (selector: string) => el.querySelector<HTMLElement>(selector)!;
    // The test browser is wide whatever `wide` says, so the stylesheet hides
    // the menu button (and nothing hidden can take focus). Show it, as a
    // narrow screen would.
    if (!wide) q('.se-shell__menu-button').style.display = 'inline-flex';
    const key = (target: Element, k: string) => {
      target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
      fixture.detectChanges();
    };
    const click = (target: HTMLElement) => {
      target.click();
      fixture.detectChanges();
    };
    return { fixture, el, q, key, click };
  };
  const links = (el: HTMLElement) =>
    Array.from(el.querySelectorAll<HTMLElement>('.se-shell__link'));

  it('renders the navigation and marks the active route as the current page', async () => {
    const { fixture, el } = setup();
    await TestBed.inject(Router).navigateByUrl('/orders');
    fixture.detectChanges();
    const [home, orders, approvals] = links(el);
    expect(el.querySelector('nav')!.getAttribute('aria-label')).toBe('Main');
    expect(orders.textContent).toContain('Orders');
    expect(orders.getAttribute('aria-current')).toBe('page');
    expect(orders.classList).toContain('se-shell__link--active');
    // Home is an exact match, so it is not current on /orders.
    expect(home.hasAttribute('aria-current')).toBeFalse();
    expect(approvals.querySelector('.se-shell__badge')!.textContent!.trim()).toBe('4');
    // A titled group names its list.
    const title = el.querySelector('.se-shell__group-title')!;
    expect(orders.closest('ul')!.getAttribute('aria-labelledby')).toBe(title.id);
  });

  it('puts the page in the main landmark and a skip link first', () => {
    const { el, q, click } = setup();
    const main = q('main#se-main');
    expect(main.getAttribute('tabindex')).toBe('-1');
    expect(main.querySelector('.page')).not.toBeNull();
    const skip = q('.se-shell__skip');
    expect(el.querySelector('a, button, input, [tabindex]')).toBe(skip);
    click(skip);
    expect(document.activeElement).toBe(main);
  });

  it('collapses to icons, keeping every link named', () => {
    const { fixture, el, q, click } = setup();
    const shell = q('se-shell');
    const toggle = q('.se-shell__collapse');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-controls')).toBe(q('.se-shell__sidebar').id);
    expect(links(el)[1].hasAttribute('title')).toBeFalse();

    click(toggle);
    expect(fixture.componentInstance.collapsed()).toBeTrue();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(shell.classList).toContain('se-shell--collapsed');
    expect(links(el)[1].getAttribute('title')).toBe('Orders');
    expect(links(el)[1].textContent).toContain('Orders');

    fixture.componentInstance.collapsed.set(false);
    fixture.detectChanges();
    expect(shell.classList).not.toContain('se-shell--collapsed');
  });

  it('opens the user menu, moves through it with the arrow keys and closes on Escape', () => {
    const { q, key, click } = setup();
    const button = q('.se-shell__user-button');
    const menu = q('[role=menu]');
    const items = Array.from(menu.querySelectorAll<HTMLElement>('[role=menuitem]'));
    expect(button.textContent).toContain('OC');
    expect(button.textContent).toContain('Okereke Cynthia');
    expect(items.map((i) => i.textContent!.trim())).toEqual(['Settings', 'Sign out']);
    expect(menu.hidden).toBeTrue();
    expect(button.getAttribute('aria-expanded')).toBe('false');

    // Enter and Space reach a native button as a click.
    click(button);
    expect(menu.hidden).toBeFalse();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(items[0]);

    key(items[0], 'ArrowDown');
    expect(document.activeElement).toBe(items[1]);
    key(items[1], 'ArrowDown');
    expect(document.activeElement).toBe(items[0]);
    key(items[0], 'ArrowUp');
    expect(document.activeElement).toBe(items[1]);

    key(items[1], 'Escape');
    expect(menu.hidden).toBeTrue();
    expect(document.activeElement).toBe(button);

    key(button, 'ArrowDown');
    expect(menu.hidden).toBeFalse();
    expect(document.activeElement).toBe(items[0]);

    // A click anywhere else closes it.
    click(q('main'));
    expect(menu.hidden).toBeTrue();
  });

  it('emits signOut from the menu and closes it', () => {
    const { fixture, q, click } = setup();
    click(q('.se-shell__user-button'));
    const items = q('[role=menu]').querySelectorAll<HTMLElement>('[role=menuitem]');
    click(items[items.length - 1]);
    expect(fixture.componentInstance.signOuts).toBe(1);
    expect(q('[role=menu]').hidden).toBeTrue();
  });

  it('renders no user menu without a user', () => {
    const { fixture, el } = setup();
    fixture.componentInstance.user.set(null);
    fixture.detectChanges();
    expect(el.querySelector('.se-shell__user-button')).toBeNull();
    expect(el.querySelector('[role=menu]')).toBeNull();
  });

  it('keeps the sidebar in reach on a wide screen', () => {
    const { q } = setup(true);
    expect(q('.se-shell__sidebar').hasAttribute('inert')).toBeFalse();
  });

  it('makes the off-canvas sidebar inert until it is opened', () => {
    const { q, key, click } = setup(false);
    const sidebar = q('.se-shell__sidebar');
    const menuButton = q('.se-shell__menu-button');
    expect(sidebar.hasAttribute('inert')).toBeTrue();
    expect(menuButton.getAttribute('aria-expanded')).toBe('false');

    click(menuButton);
    expect(sidebar.hasAttribute('inert')).toBeFalse();
    expect(menuButton.getAttribute('aria-expanded')).toBe('true');
    expect(q('se-shell').classList).toContain('se-shell--drawer-open');
    expect(sidebar.contains(document.activeElement)).toBeTrue();

    key(sidebar, 'Escape');
    expect(sidebar.hasAttribute('inert')).toBeTrue();
    expect(document.activeElement).toBe(menuButton);

    click(menuButton);
    click(q('.se-shell__scrim'));
    expect(sidebar.hasAttribute('inert')).toBeTrue();
    expect(document.activeElement).toBe(menuButton);
  });

  it('closes the off-canvas sidebar when a link is chosen', async () => {
    const { fixture, el, q, click } = setup(false);
    click(q('.se-shell__menu-button'));
    click(links(el)[1]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(q('.se-shell__sidebar').hasAttribute('inert')).toBeTrue();
    expect(document.activeElement).toBe(q('.se-shell__menu-button'));
  });
});
