import { Pipe, PipeTransform, inject } from '@angular/core';
import { SeCurrencyService } from '../money/money';

export type SeDateStyle = 'date' | 'datetime' | 'time';

const OPTIONS: Record<SeDateStyle, Intl.DateTimeFormatOptions> = {
  date: { day: 'numeric', month: 'short', year: 'numeric' },
  datetime: { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' },
  time: { hour: '2-digit', minute: '2-digit' },
};

/**
 * A date as the three apps write it: "6 Oct 2026" or "6 Oct 2026, 14:20".
 * One format everywhere, so the same moment never reads two ways on two
 * screens. An empty or unparseable value is a dash.
 */
export function formatDate(
  value: string | number | Date | null | undefined,
  style: SeDateStyle = 'date',
  locale = 'en-GB',
): string {
  if (value === null || value === undefined || value === '') return '–';
  // A bare calendar date ("2026-10-02") has no time zone. Parsed the default
  // way it means midnight UTC, which is the day before for anyone west of
  // Greenwich: read it as that day, wherever the reader is.
  const dayOnly = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  const date = dayOnly
    ? new Date(Number(dayOnly[1]), Number(dayOnly[2]) - 1, Number(dayOnly[3]))
    : value instanceof Date
      ? value
      : new Date(value);
  if (Number.isNaN(date.getTime())) return '–';
  return new Intl.DateTimeFormat(locale, { ...OPTIONS[style], hour12: false }).format(date);
}

/**
 *     {{ order.createdAt | seDate }}              6 Oct 2026
 *     {{ order.createdAt | seDate: 'datetime' }}  6 Oct 2026, 14:20
 *
 * Uses the locale from the API's public configuration once it has loaded.
 */
@Pipe({ name: 'seDate', pure: false })
export class SeDatePipe implements PipeTransform {
  private readonly currency = inject(SeCurrencyService);

  transform(value: string | number | Date | null | undefined, style: SeDateStyle = 'date'): string {
    return formatDate(value, style, this.currency.config()?.locale ?? 'en-GB');
  }
}
