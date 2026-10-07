import { SE_STATUS, SeBadgeTone } from '@seentair/ui';
import { Batch } from '../api.service';

/** The one-batch record (GET production-batches/:id): the list row plus its paperwork. */
export interface BatchDetail extends Batch {
  completedDate?: string | null;
  approvalRequestId?: string | null;
  barcode?: string | null;
}

/** A batch id as people say it: "#8626ACAB". */
export function batchRef(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

export function stageLabel(stage: string): string {
  return SE_STATUS.production[stage]?.label ?? stage.replace(/_/g, ' ');
}

/** The stage after this one, or null once the batch is at the last stage. */
export function nextStage(stages: string[], stage: string): string | null {
  const i = stages.indexOf(stage);
  return i >= 0 && i < stages.length - 1 ? stages[i + 1] : null;
}

/** A count with its noun: "1 unit", "3 units". */
export function units(n: number): string {
  return `${n} ${n === 1 ? 'unit' : 'units'}`;
}

export const num = (v: unknown): number => Number(v ?? 0) || 0;

/** The words for the "move to the next stage" confirmation. */
export function moveCopy(
  batch: Batch,
  next: string,
  stages: string[],
): { title: string; consequence: string; confirmLabel: string } {
  const label = stageLabel(next);
  const completing = next === stages[stages.length - 1];
  return {
    title: `Move batch ${batchRef(batch.id)} to ${label}?`,
    consequence: completing
      ? `The batch is closed and its good units are added to stock. Units recorded as burned are left out. This is written to the audit log and cannot be undone here.`
      : `${units(batch.quantity)} of ${batch.variant.sku} move from ${stageLabel(batch.stage)} to ${label}. The move is written to the audit log.`,
    confirmLabel: `Move to ${label}`,
  };
}

// ---- QC rejects ----
export const DISPOSITIONS = [
  { value: 'burned', label: 'Defective: burn and write off' },
  { value: 'repaired_restocked', label: 'Minor factory error: repair and restock' },
];

export function dispositionLabel(value: unknown): string {
  return value === 'burned'
    ? 'Burned'
    : value === 'repaired_restocked'
      ? 'Repaired'
      : String(value ?? '');
}

export function dispositionTone(value: unknown): SeBadgeTone {
  return value === 'burned' ? 'danger' : 'info';
}

export interface QcForm {
  quantity: number | null;
  disposition: string;
  station: string;
  reason: string;
  inspectorId: string;
}

export const emptyQc = (inspectorId = ''): QcForm => ({
  quantity: 1,
  disposition: 'burned',
  station: '',
  reason: '',
  inspectorId,
});

/** What is wrong with a QC reject, field by field. Empty strings mean it can be sent. */
export function qcErrors(form: QcForm, batch: Batch): { quantity: string; reason: string } {
  const q = Number(form.quantity);
  return {
    quantity:
      !Number.isInteger(q) || q < 1
        ? 'Enter a whole number of units, 1 or more.'
        : q > batch.quantity
          ? `This batch has only ${units(batch.quantity)}.`
          : '',
    reason: form.reason.trim() ? '' : 'Say what was wrong with the units.',
  };
}

// ---- machine readings ----
export interface ReadingForm {
  stage: string;
  machine: string;
  rpm: number | null;
  needleCycles: number | null;
  threadReservePct: number | null;
}

export const emptyReading = (stage = ''): ReadingForm => ({
  stage,
  machine: '',
  rpm: null,
  needleCycles: null,
  threadReservePct: null,
});
