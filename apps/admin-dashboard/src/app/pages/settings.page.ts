import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  SeButtonDirective,
  SeCardComponent,
  SeFieldComponent,
  SeInputDirective,
  SeMoneyPipe,
  SePageComponent,
  SeToastService,
} from '@seentair/ui';
import { AccessService } from '../access.service';
import { ApiService, ShippingSettings } from '../api.service';

@Component({
  selector: 'app-settings',
  imports: [
    FormsModule,
    SeButtonDirective,
    SeCardComponent,
    SeFieldComponent,
    SeInputDirective,
    SeMoneyPipe,
    SePageComponent,
  ],
  template: `
    <se-page title="Settings">
      @if (error()) {
        <p role="alert">{{ error() }}</p>
        <button seButton type="button" (click)="load()">Retry</button>
      } @else if (settings(); as current) {
        <se-card title="Checkout and platform settings">
          <form class="se-form" (ngSubmit)="save()">
            <se-field label="Delivery pricing">
              <select seInput name="shipping" [(ngModel)]="form.shippingEnabled">
                <option [ngValue]="true">Enabled</option>
                <option [ngValue]="false">Disabled</option>
              </select>
            </se-field>
            <div class="se-form__row">
              <se-field label="Free-delivery threshold" optional>
                <input
                  seInput
                  type="number"
                  min="0"
                  name="threshold"
                  [(ngModel)]="form.freeDeliveryThreshold"
                />
              </se-field>
              <se-field label="Quote expiry (minutes)">
                <input
                  seInput
                  type="number"
                  min="1"
                  max="43200"
                  name="expiry"
                  [(ngModel)]="form.quoteExpiryMinutes"
                />
              </se-field>
            </div>
            <se-field label="VAT">
              <select seInput name="vat" [(ngModel)]="form.vatEnabled">
                <option [ngValue]="true">Enabled</option>
                <option [ngValue]="false">Disabled</option>
              </select>
            </se-field>
            @if (form.vatEnabled) {
              <div class="se-form__row">
                <se-field label="VAT rate (%)">
                  <input
                    seInput
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    name="rate"
                    [(ngModel)]="form.vatRatePercent"
                  />
                </se-field>
                <se-field label="Listed prices include VAT">
                  <select seInput name="includesVat" [(ngModel)]="form.pricesIncludeVat">
                    <option [ngValue]="true">Yes</option>
                    <option [ngValue]="false">No</option>
                  </select>
                </se-field>
              </div>
              <se-field label="VAT applies to delivery">
                <select seInput name="deliveryTaxable" [(ngModel)]="form.deliveryTaxable">
                  <option [ngValue]="true">Yes</option>
                  <option [ngValue]="false">No</option>
                </select>
              </se-field>
            }
            <se-field label="Coupon codes">
              <select seInput name="coupons" [(ngModel)]="form.couponsEnabled">
                <option [ngValue]="true">Enabled</option>
                <option [ngValue]="false">Disabled</option>
              </select>
            </se-field>
            @if (canWrite()) {
              <se-field
                label="Reason for change"
                hint="Saved in the audit log"
                [error]="reasonError()"
              >
                <textarea
                  seInput
                  name="reason"
                  rows="2"
                  [(ngModel)]="reason"
                  maxlength="500"
                ></textarea>
              </se-field>
              <button seButton variant="primary" type="submit" [loading]="saving()">
                Save settings
              </button>
            }
          </form>
          <p>
            Effective at checkout:
            {{
              current.shippingEnabled
                ? 'delivery fees are enabled'
                : 'delivery fees are disabled'
            }},
            free delivery
            {{
              current.freeDeliveryThreshold !== null
                ? 'from ' + (current.freeDeliveryThreshold | seMoney)
                : 'is not offered'
            }}.
          </p>
        </se-card>
      } @else {
        <p>Loading settings…</p>
      }
    </se-page>
  `,
})
export class SettingsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly access = inject(AccessService);
  private readonly router = inject(Router);
  private readonly toast = inject(SeToastService);

  readonly canWrite = computed(() => this.access.can('logistics', 'full'));
  readonly settings = signal<ShippingSettings | null>(null);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly reasonError = signal('');
  reason = '';
  form = {
    shippingEnabled: false,
    freeDeliveryThreshold: null as number | null,
    quoteExpiryMinutes: 1440,
    vatEnabled: false,
    vatRatePercent: 0,
    pricesIncludeVat: false,
    deliveryTaxable: false,
    couponsEnabled: false,
  };

  ngOnInit(): void {
    if (!this.access.can('logistics', 'full')) {
      void this.router.navigate(['/']);
      return;
    }
    this.load();
  }

  load(): void {
    this.error.set('');
    this.api.shippingSettings().subscribe({
      next: (settings) => {
        this.settings.set(settings);
        this.form = {
          shippingEnabled: settings.shippingEnabled,
          freeDeliveryThreshold: settings.freeDeliveryThreshold,
          quoteExpiryMinutes: settings.quoteExpiryMinutes,
          vatEnabled: settings.vatEnabled,
          vatRatePercent: settings.vatRatePercent,
          pricesIncludeVat: settings.pricesIncludeVat,
          deliveryTaxable: settings.deliveryTaxable,
          couponsEnabled: settings.couponsEnabled,
        };
      },
      error: () => this.error.set('Settings could not be loaded.'),
    });
  }

  save(): void {
    if (!this.canWrite()) return;
    if (!this.reason.trim()) {
      this.reasonError.set('A reason is required and will be included in the audit log.');
      return;
    }
    this.reasonError.set('');
    this.saving.set(true);
    this.api
      .updateShippingSettings({ ...this.form, reason: this.reason.trim() })
      .subscribe({
        next: (settings) => {
          this.settings.set(settings);
          this.saving.set(false);
          this.reason = '';
          this.toast.show('Settings saved');
        },
        error: (error) => {
          this.saving.set(false);
          this.error.set(error?.error?.message ?? 'Settings could not be saved.');
        },
      });
  }
}
