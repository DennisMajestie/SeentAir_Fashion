import { Component, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  SeButtonDirective,
  SeConfirmService,
  SeDrawerComponent,
  SeFieldComponent,
  SeInputDirective,
  SeToastService,
} from '@seentair/ui';
import { ApiService, Batch } from '../api.service';
import {
  DISPOSITIONS,
  batchRef,
  emptyQc,
  emptyReading,
  qcErrors,
  stageLabel,
  units,
} from './production-format';

/**
 * Record a QC reject on one batch. Shared by the batch page and the floor
 * kiosk so the rule is written once: a reason is required, and because the
 * reject changes what reaches stock it is confirmed before it is sent.
 */
@Component({
  selector: 'app-qc-reject-drawer',
  imports: [FormsModule, SeButtonDirective, SeDrawerComponent, SeFieldComponent, SeInputDirective],
  template: `
    <se-drawer title="Record QC reject" [(open)]="open">
      <div class="se-form">
        <se-field label="Units rejected" [error]="errors().quantity">
          <input seInput type="number" min="1" inputmode="numeric" [(ngModel)]="form.quantity" />
        </se-field>
        <se-field label="What happens to them">
          <select seInput [(ngModel)]="form.disposition">
            @for (d of dispositions; track d.value) {
              <option [value]="d.value">{{ d.label }}</option>
            }
          </select>
        </se-field>
        <se-field label="Reason" hint="What was wrong with the units" [error]="errors().reason">
          <textarea seInput rows="3" [(ngModel)]="form.reason"></textarea>
        </se-field>
        <se-field label="Station" optional>
          <input seInput [(ngModel)]="form.station" />
        </se-field>
        @if (staff().length > 0) {
          <se-field label="Inspector" optional>
            <select seInput [(ngModel)]="form.inspectorId">
              <option value="">Not assigned</option>
              @for (u of staff(); track u['id']) {
                <option [value]="u['id']">{{ u['name'] }}</option>
              }
            </select>
          </se-field>
        }
      </div>
      <ng-container seDrawerFooter>
        <button seButton type="button" (click)="open.set(false)">Cancel</button>
        <button seButton variant="primary" type="button" [loading]="saving()" (click)="submit()">
          Record reject
        </button>
      </ng-container>
    </se-drawer>
  `,
})
export class QcRejectDrawer {
  private readonly api = inject(ApiService);
  private readonly confirm = inject(SeConfirmService);
  private readonly toast = inject(SeToastService);

  readonly batch = input<Batch | null>(null);
  readonly staff = input<Array<Record<string, unknown>>>([]);
  /** The signed-in person's user id, offered as the inspector. */
  readonly inspectorId = input('');
  readonly open = model(false);
  readonly saved = output<void>();

  readonly dispositions = DISPOSITIONS;
  readonly errors = signal({ quantity: '', reason: '' });
  readonly saving = signal(false);
  form = emptyQc();

  constructor() {
    // A fresh form each time the drawer opens; input is kept if a save fails.
    effect(() => {
      if (this.open()) {
        untracked(() => {
          this.form = emptyQc(this.inspectorId());
          this.errors.set({ quantity: '', reason: '' });
        });
      }
    });
  }

  async submit(): Promise<void> {
    const batch = this.batch();
    if (!batch) return;
    const errors = qcErrors(this.form, batch);
    this.errors.set(errors);
    if (errors.quantity || errors.reason) return;
    const count = units(Number(this.form.quantity));
    const burned = this.form.disposition === 'burned';
    const ok = await this.confirm.ask({
      title: burned
        ? `Burn ${count} from batch ${batchRef(batch.id)}?`
        : `Send ${count} from batch ${batchRef(batch.id)} for repair?`,
      consequence: burned
        ? 'They are written off and left out of the stock added when the batch completes. The reject is written to the audit log and cannot be undone.'
        : 'They are repaired and go into stock with the rest of the batch. The reject and its reason are written to the audit log and cannot be undone.',
      confirmLabel: burned ? `Burn ${count}` : `Send ${count} for repair`,
      danger: burned,
    });
    if (!ok) return;
    const reason = this.form.reason.trim();
    const station = this.form.station.trim();
    this.saving.set(true);
    this.api
      .recordQcRejection(batch.id, {
        quantity: Number(this.form.quantity),
        reason: station ? `${station}: ${reason}` : reason,
        disposition: this.form.disposition,
        inspectorId: this.form.inspectorId || undefined,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.open.set(false);
          this.toast.show(`${count} rejected on batch ${batchRef(batch.id)}`);
          this.saved.emit();
        },
        error: (err) => {
          this.saving.set(false);
          this.errors.set({
            quantity: '',
            reason: err?.error?.message ?? 'The reject could not be recorded. Nothing was changed.',
          });
        },
      });
  }
}

/** Record one machine reading (speed, needle cycles, thread left) against a batch. */
@Component({
  selector: 'app-reading-drawer',
  imports: [FormsModule, SeButtonDirective, SeDrawerComponent, SeFieldComponent, SeInputDirective],
  template: `
    <se-drawer title="Record machine reading" [(open)]="open">
      <div class="se-form">
        <se-field label="Stage">
          <select seInput [(ngModel)]="form.stage">
            @for (s of stages(); track s) {
              <option [value]="s">{{ label(s) }}</option>
            }
          </select>
        </se-field>
        <se-field label="Machine" hint="The name or number on the machine" [error]="error()">
          <input seInput [(ngModel)]="form.machine" />
        </se-field>
        <se-field label="Speed (rpm)" optional>
          <input seInput type="number" min="0" inputmode="numeric" [(ngModel)]="form.rpm" />
        </se-field>
        <se-field label="Needle cycles" optional>
          <input
            seInput
            type="number"
            min="0"
            inputmode="numeric"
            [(ngModel)]="form.needleCycles"
          />
        </se-field>
        <se-field label="Thread left (%)" optional>
          <input
            seInput
            type="number"
            min="0"
            max="100"
            inputmode="numeric"
            [(ngModel)]="form.threadReservePct"
          />
        </se-field>
      </div>
      <ng-container seDrawerFooter>
        <button seButton type="button" (click)="open.set(false)">Cancel</button>
        <button seButton variant="primary" type="button" [loading]="saving()" (click)="submit()">
          Record reading
        </button>
      </ng-container>
    </se-drawer>
  `,
})
export class ReadingDrawer {
  private readonly api = inject(ApiService);
  private readonly toast = inject(SeToastService);

  readonly batch = input<Batch | null>(null);
  readonly stages = input<string[]>([]);
  readonly operatorId = input('');
  readonly open = model(false);
  readonly saved = output<void>();

  readonly error = signal('');
  readonly saving = signal(false);
  readonly label = stageLabel;
  form = emptyReading();

  constructor() {
    effect(() => {
      if (this.open()) {
        untracked(() => {
          this.form = emptyReading(this.batch()?.stage ?? '');
          this.error.set('');
        });
      }
    });
  }

  submit(): void {
    const batch = this.batch();
    if (!batch) return;
    if (!this.form.machine.trim()) {
      this.error.set('Enter the machine this reading is from.');
      return;
    }
    this.saving.set(true);
    this.api
      .recordTelemetry(batch.id, {
        stage: this.form.stage,
        machine: this.form.machine.trim(),
        rpm: this.form.rpm ?? undefined,
        needleCycles: this.form.needleCycles ?? undefined,
        threadReservePct: this.form.threadReservePct ?? undefined,
        operatorId: this.operatorId() || undefined,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.open.set(false);
          this.toast.show('Machine reading recorded');
          this.saved.emit();
        },
        error: (err) => {
          this.saving.set(false);
          this.error.set(err?.error?.message ?? 'The reading could not be recorded.');
        },
      });
  }
}
