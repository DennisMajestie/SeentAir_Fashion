import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SeFieldComponent, SeInputDirective } from './field.component';

@Component({
  imports: [SeFieldComponent, SeInputDirective],
  template: `
    <se-field label="Discount" hint="Between 1 and 90" [error]="error()">
      <input seInput type="number" />
    </se-field>
    <se-field label="Notify by" group [error]="error()">
      <label class="se-choice"><input type="checkbox" /> Email</label>
    </se-field>
    <se-field label="Reference"><input seInput id="my-ref" /></se-field>
  `,
})
class Host {
  readonly error = signal('');
}

describe('se-field', () => {
  const setup = () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  };

  it('points a real label at its control', () => {
    const { el } = setup();
    const label = el.querySelector('label.se-field__label')!;
    const input = el.querySelector('input[type=number]')!;
    expect(label.textContent).toContain('Discount');
    expect(label.getAttribute('for')).toBe(input.id);
    expect(input.id).toBeTruthy();
  });

  it('describes the control by its hint, then by its error', () => {
    const { fixture, el } = setup();
    const input = el.querySelector('input[type=number]')!;
    const hint = el.querySelector('.se-field__hint')!;
    expect(input.getAttribute('aria-describedby')).toBe(hint.id);
    expect(input.hasAttribute('aria-invalid')).toBeFalse();

    fixture.componentInstance.error.set('Enter a discount between 1 and 90.');
    fixture.detectChanges();
    const error = el.querySelector('.se-field__error')!;
    expect(input.getAttribute('aria-describedby')).toBe(error.id);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(error.textContent).toContain('Enter a discount between 1 and 90.');
  });

  it('announces the error through a live region that exists before the error does', () => {
    const { fixture, el } = setup();
    const region = el.querySelector('.se-field__error')!;
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent!.trim()).toBe('');
    fixture.componentInstance.error.set('Required.');
    fixture.detectChanges();
    // Same element, new content: that is what gets announced.
    expect(el.querySelector('.se-field__error')).toBe(region);
  });

  it('renders a group as a fieldset with a legend', () => {
    const { el } = setup();
    const set = el.querySelector('fieldset')!;
    expect(set.querySelector('legend')!.textContent).toContain('Notify by');
    expect(set.querySelector('input[type=checkbox]')).not.toBeNull();
  });

  it('keeps an id the author wrote and labels that', () => {
    const { el } = setup();
    const input = el.querySelector('#my-ref')!;
    const label = [...el.querySelectorAll('label.se-field__label')].find((l) =>
      l.textContent!.includes('Reference'),
    )!;
    expect(input).not.toBeNull();
    expect(label.getAttribute('for')).toBe('my-ref');
  });
});
