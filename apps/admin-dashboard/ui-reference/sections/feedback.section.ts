import { Component, inject, signal } from '@angular/core';
import {
  SeBannerComponent,
  SeButtonDirective,
  SeConfirmService,
  SeDrawerComponent,
  SeEmptyStateComponent,
  SeFieldComponent,
  SeInputDirective,
  SeSkeletonComponent,
  SeToastService,
} from '@seentair/ui';

@Component({
  selector: 'ref-feedback',
  imports: [
    SeBannerComponent,
    SeButtonDirective,
    SeDrawerComponent,
    SeEmptyStateComponent,
    SeFieldComponent,
    SeInputDirective,
    SeSkeletonComponent,
  ],
  template: `
    <h3 class="ref-h3">Inline banner</h3>
    <div class="ref-grid">
      <se-banner tone="info" title="Prices exclude delivery"
        >Delivery is quoted at dispatch.</se-banner
      >
      <se-banner tone="success" dismissible>Batch 0412 passed quality check.</se-banner>
      <se-banner
        tone="warning"
        title="3 variants are below their reorder level"
        actionLabel="Review stock"
      >
        They will run out in about four days at the current rate.
      </se-banner>
      <se-banner tone="danger" title="Orders could not be loaded" actionLabel="Try again">
        The server did not respond. Nothing has been changed.
      </se-banner>
    </div>
    <p class="ref-dont">
      <b>Not for:</b> confirming something the person just did (use a toast), or an error on one
      field (put it under the field). A banner is for a condition of the page that stays true until
      something changes.
    </p>

    <h3 class="ref-h3">Toast, confirmation dialog and side drawer</h3>
    <div class="ref-panel">
      <div class="ref-row">
        <button seButton (click)="toast.show('Supplier saved')">Toast</button>
        <button
          seButton
          (click)="toast.show('3 orders archived', { action: { label: 'Undo', run: undo } })"
        >
          Toast with action
        </button>
        <button
          seButton
          (click)="toast.show('The refund could not be recorded', { tone: 'danger' })"
        >
          Failure toast
        </button>
        <button seButton (click)="approve()">Approval dialog</button>
        <button seButton variant="danger" (click)="remove()">Destructive dialog</button>
        <button seButton variant="primary" (click)="drawer.set(true)">Open drawer</button>
        <span class="se-type-caption">{{ last() }}</span>
      </div>
    </div>
    <se-drawer title="Add supplier" [(open)]="drawer">
      <se-field label="Supplier name"><input seInput /></se-field>
      <se-field label="Phone" hint="Include the country code"
        ><input seInput type="tel"
      /></se-field>
      <se-field label="Notes" optional><textarea seInput rows="3"></textarea></se-field>
      <ng-container seDrawerFooter>
        <button seButton (click)="drawer.set(false)">Cancel</button>
        <button
          seButton
          variant="primary"
          (click)="drawer.set(false); toast.show('Supplier saved')"
        >
          Save supplier
        </button>
      </ng-container>
    </se-drawer>
    <p class="ref-dont">
      <b>Not for:</b> a toast must never carry something that has to be read or acted on, because it
      disappears. The dialog is only for destructive and approval actions, and always states the
      consequence: never a bare "Are you sure?". The drawer is for short forms (up to about six
      fields); a longer form gets its own page.
    </p>

    <h3 class="ref-h3">Empty state</h3>
    <div class="ref-grid">
      <div class="ref-panel">
        <se-empty-state
          heading="No suppliers yet"
          text="Add the first supplier to start recording purchases."
          actionLabel="Add supplier"
          (action)="drawer.set(true)"
        />
      </div>
      <div class="ref-panel">
        <se-empty-state
          heading="Nothing is awaiting approval"
          text="New requests appear here as they are raised."
        />
      </div>
    </div>
    <p class="ref-dont">
      <b>Not for:</b> a failed load (that is an error, with a retry) or data still loading (that is
      a skeleton). Empty means the request worked and there is genuinely nothing.
    </p>

    <h3 class="ref-h3">Skeletons, one per layout</h3>
    <div class="ref-grid">
      <div class="ref-panel">
        <span class="ref-tag">table</span><se-skeleton shape="table" [rows]="4" [columns]="4" />
      </div>
      <div class="ref-panel"><span class="ref-tag">metric</span><se-skeleton shape="metric" /></div>
      <div class="ref-panel">
        <span class="ref-tag">form</span><se-skeleton shape="form" [rows]="2" />
      </div>
      <div class="ref-panel">
        <span class="ref-tag">detail</span><se-skeleton shape="detail" [rows]="3" />
      </div>
      <div class="ref-panel">
        <span class="ref-tag">text</span><se-skeleton shape="text" [rows]="3" />
      </div>
      <div class="ref-panel"><span class="ref-tag">block</span><se-skeleton shape="block" /></div>
    </div>
    <p class="ref-dont">
      <b>Not for:</b> an action in progress (use the button's loading state). Never a spinner in the
      middle of an empty page.
    </p>
  `,
})
export class FeedbackSection {
  readonly toast = inject(SeToastService);
  private readonly confirm = inject(SeConfirmService);
  readonly drawer = signal(false);
  readonly last = signal('');

  readonly undo = (): void => this.toast.show('Restored');

  async approve(): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Approve this price change?',
      consequence:
        'Box Tee goes from 24,000 to 21,500 for every customer as soon as it is applied. The decision is written to the audit log.',
      confirmLabel: 'Approve change',
    });
    this.last.set(ok ? 'Approved' : 'Left as it was');
  }

  async remove(): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Delete supplier Aba Textile Mills?',
      consequence:
        'The supplier is removed from the list. Past purchases keep their records. This cannot be undone.',
      confirmLabel: 'Delete supplier',
      danger: true,
    });
    this.last.set(ok ? 'Deleted' : 'Kept');
  }
}
