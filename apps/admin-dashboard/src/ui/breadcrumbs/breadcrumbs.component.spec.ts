import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SeBreadcrumb, SeBreadcrumbsComponent } from './breadcrumbs.component';

@Component({
  imports: [SeBreadcrumbsComponent],
  template: `<se-breadcrumbs [items]="items" />`,
})
class Host {
  items: SeBreadcrumb[] = [
    { label: 'Orders', link: '/orders' },
    { label: 'Wholesale' },
    { label: 'SO-1042', link: '/orders/so-1042' },
  ];
}

describe('se-breadcrumbs', () => {
  const setup = () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  };

  it('is a named navigation landmark holding an ordered list', () => {
    const { el } = setup();
    const nav = el.querySelector('nav')!;
    expect(nav.getAttribute('aria-label')).toBe('Breadcrumb');
    expect(nav.querySelectorAll('ol > li').length).toBe(3);
  });

  it('links the items that have a link and leaves the rest as text', () => {
    const { el } = setup();
    const items = el.querySelectorAll('li');
    expect(items[0].querySelector('a')!.getAttribute('href')).toBe('/orders');
    expect(items[1].querySelector('a')).toBeNull();
    expect(items[1].textContent).toContain('Wholesale');
    expect(items[1].querySelector('[aria-current]')).toBeNull();
  });

  it('marks the last item as the current page, as plain text even if it has a link', () => {
    const { el } = setup();
    const last = el.querySelector('li:last-child')!;
    expect(last.querySelector('a')).toBeNull();
    expect(last.querySelector('[aria-current=page]')!.textContent!.trim()).toBe('SO-1042');
    expect(el.querySelectorAll('[aria-current]').length).toBe(1);
  });

  it('hides its separators from assistive technology', () => {
    const { el } = setup();
    const separators = el.querySelectorAll('.se-breadcrumbs__separator');
    expect(separators.length).toBe(2);
    separators.forEach((s) => expect(s.getAttribute('aria-hidden')).toBe('true'));
  });
});
