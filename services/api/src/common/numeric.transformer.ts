import { ValueTransformer } from 'typeorm';

/** Postgres numeric comes back as string; keep money values as JS numbers. */
export const numericTransformer: ValueTransformer = {
  to: (value: number | null): number | null => value,
  from: (value: string | null): number | null => (value === null ? null : parseFloat(value)),
};
