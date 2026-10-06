import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SeButtonDirective } from './button.directive';

@Component({
  imports: [SeButtonDirective],
  template: `
    <button seButton variant="primary" size="sm" [loading]="loading" (click)="clicks = clicks + 1">
      Save
    </button>
    <a seButton href="#x">Link</a>
  `,
})
class Host {
  loading = false;
  clicks = 0;
}

describe('seButton', () => {
  const setup = () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, button: el.querySelector('button')!, link: el.querySelector('a')! };
  };

  it('styles a native button by variant and size', () => {
    const { button } = setup();
    expect(button.classList).toContain('se-btn');
    expect(button.classList).toContain('se-btn--primary');
    expect(button.classList).toContain('se-btn--sm');
  });

  it('defaults a link to the secondary variant and keeps it a link', () => {
    const { link } = setup();
    expect(link.classList).toContain('se-btn--secondary');
    expect(link.getAttribute('href')).toBe('#x');
  });

  it('marks a loading button busy and swallows its clicks', () => {
    const { fixture, button } = setup();
    button.click();
    expect(fixture.componentInstance.clicks).toBe(1);

    fixture.componentInstance.loading = true;
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(button.getAttribute('aria-busy')).toBe('true');
    button.click();
    expect(fixture.componentInstance.clicks).toBe(1);
  });
});
