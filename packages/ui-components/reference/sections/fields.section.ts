import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SeFieldComponent, SeInputDirective, SeSearchComponent } from '@seentair/ui';

@Component({
  selector: 'ref-fields',
  imports: [FormsModule, SeFieldComponent, SeInputDirective, SeSearchComponent],
  template: `
    <p class="ref-lede">
      Every control has a real label. The hint explains before the mistake; the error names the
      problem after it and is announced to a screen reader, not only coloured.
    </p>
    <div class="ref-grid">
      <div class="ref-panel">
        <se-field label="Supplier name" hint="As it appears on their invoice">
          <input seInput placeholder="e.g. Aba Textile Mills" />
        </se-field>
      </div>
      <div class="ref-panel">
        <se-field label="Discount" [error]="discountError()" hint="Between 1 and 90 percent">
          <input
            seInput
            type="number"
            [ngModel]="discount()"
            (ngModelChange)="discount.set($event)"
          />
        </se-field>
      </div>
      <div class="ref-panel">
        <se-field label="Category">
          <select seInput>
            <option>Tops</option>
            <option>Bottoms</option>
            <option>Outerwear</option>
          </select>
        </se-field>
      </div>
      <div class="ref-panel">
        <se-field label="Sale ends">
          <input seInput type="date" />
        </se-field>
      </div>
      <div class="ref-panel">
        <se-field label="Reason for rejection" optional>
          <textarea seInput rows="3"></textarea>
        </se-field>
      </div>
      <div class="ref-panel">
        <se-field label="SKU" hint="Disabled: set when the variant was created">
          <input seInput value="SE-2PC-BRN-OS" disabled />
        </se-field>
      </div>
      <div class="ref-panel">
        <se-field label="Notify the customer by" group>
          <label class="se-choice"><input type="checkbox" checked /> <span>Email</span></label>
          <label class="se-choice"><input type="checkbox" /> <span>SMS</span></label>
          <label class="se-choice"
            ><input type="checkbox" disabled /> <span>WhatsApp (not set up)</span></label
          >
        </se-field>
      </div>
      <div class="ref-panel">
        <se-field label="Refund to" group [error]="'Choose where the refund goes.'">
          <label class="se-choice"
            ><input type="radio" name="refund" /> <span>Original payment method</span></label
          >
          <label class="se-choice"
            ><input type="radio" name="refund" /> <span>Bank transfer</span></label
          >
        </se-field>
      </div>
      <div class="ref-panel">
        <label class="se-choice se-choice--toggle">
          <input type="checkbox" role="switch" checked /> <span>Low-stock alerts</span>
        </label>
        <label class="se-choice se-choice--toggle">
          <input type="checkbox" role="switch" /> <span>Weekly summary email</span>
        </label>
      </div>
      <div class="ref-panel">
        <se-search
          label="Search orders"
          placeholder="Order ref, customer or SKU"
          [(value)]="query"
        />
        <p class="se-type-caption">Searching for: {{ query() || 'nothing yet' }}</p>
      </div>
    </div>
    <p class="ref-dont">
      <b>Not for:</b> a placeholder standing in for a label, or a field with no hint when the format
      is not obvious. Use a toggle only for a setting that applies immediately; inside a form that
      is saved, use a checkbox.
    </p>
  `,
})
export class FieldsSection {
  readonly discount = signal<number | null>(120);
  readonly query = signal('');
  readonly discountError = computed(() => {
    const d = this.discount();
    return d === null || (d >= 1 && d <= 90) ? '' : 'Enter a discount between 1 and 90 percent.';
  });
}
