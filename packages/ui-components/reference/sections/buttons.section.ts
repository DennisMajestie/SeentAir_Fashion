import { Component, signal } from '@angular/core';
import { SeButtonDirective, SeIconComponent } from '@seentair/ui';

@Component({
  selector: 'ref-buttons',
  imports: [SeButtonDirective, SeIconComponent],
  template: `
    <p class="ref-lede">
      Four variants in two sizes. One primary button per screen or dialog: it is the thing the
      screen exists to do.
    </p>
    <div class="ref-panel">
      @for (v of variants; track v) {
        <div class="ref-row">
          <span class="ref-tag">{{ v }}</span>
          <button seButton [variant]="v">Save order</button>
          <button seButton [variant]="v" size="sm">Small</button>
          <button seButton [variant]="v"><se-icon name="plus" /> With icon</button>
          <button seButton [variant]="v" iconOnly aria-label="Refresh">
            <se-icon name="refresh" />
          </button>
          <button seButton [variant]="v" disabled>Disabled</button>
          <button seButton [variant]="v" loading>Saving</button>
        </div>
      }
      <div class="ref-row">
        <span class="ref-tag">live</span>
        <button seButton variant="primary" [loading]="saving()" (click)="save()">
          Press to save
        </button>
        <a seButton href="#buttons">A link styled as a button</a>
        <span class="se-type-caption">Saved {{ count() }} time(s)</span>
      </div>
    </div>
    <p class="ref-dont">
      <b>Not for:</b> navigation inside a sentence (use a plain link), or more than one primary
      action in the same view. Danger is only for an action that destroys or rejects something. An
      icon-only button must carry an aria-label.
    </p>
  `,
})
export class ButtonsSection {
  readonly variants = ['primary', 'secondary', 'ghost', 'danger'] as const;
  readonly saving = signal(false);
  readonly count = signal(0);

  save(): void {
    this.saving.set(true);
    setTimeout(() => {
      this.saving.set(false);
      this.count.update((n) => n + 1);
    }, 1400);
  }
}
