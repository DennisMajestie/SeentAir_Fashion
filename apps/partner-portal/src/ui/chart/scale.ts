/**
 * The arithmetic every chart shares: where the axis ticks fall, how a value
 * becomes a pixel, and how many category labels fit. Pure functions, no DOM.
 */

/** Float noise off a tick (0.30000000000000004 -> 0.3) without touching real digits. */
const tidy = (n: number, step: number): number => {
  const decimals = Math.max(0, 2 - Math.floor(Math.log10(step)));
  return Number(n.toFixed(Math.min(decimals, 20)));
};

/**
 * Evenly spaced "nice" axis ticks that cover `min`..`max`: steps of 1, 2, 2.5
 * or 5 times a power of ten, aiming for about `target` intervals.
 *
 * Ticks are always whole multiples of the step, so 0 is a tick whenever the
 * data straddles or touches it. A flat range (one value, or all values equal)
 * is drawn from zero to that value; all zeros gives `[0, 1]`.
 */
export function niceTicks(min: number, max: number, target = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min > max) [min, max] = [max, min];
  if (min === max) {
    if (min === 0) return [0, 1];
    // One value says nothing about a range: measure it from zero.
    if (min > 0) min = 0;
    else max = 0;
  }
  const raw = (max - min) / Math.max(1, target);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / magnitude;
  const nice = [1, 2, 2.5, 5, 10].find((n) => fraction <= n + 1e-9) ?? 10;
  const step = nice * magnitude;
  const first = Math.floor(min / step + 1e-9);
  const last = Math.ceil(max / step - 1e-9);
  const ticks: number[] = [];
  for (let i = first; i <= last; i++) ticks.push(tidy(i * step, step));
  return ticks;
}

/** A linear map from a data domain onto a pixel range. A flat domain maps to the range start. */
export function linearScale(
  domain: readonly [number, number],
  range: readonly [number, number],
): (value: number) => number {
  const span = domain[1] - domain[0];
  if (!span) return () => range[0];
  const ratio = (range[1] - range[0]) / span;
  return (value) => range[0] + (value - domain[0]) * ratio;
}

/**
 * Category labels are thinned, never squeezed: show every nth so that
 * neighbours cannot touch. `spacing` is the distance between two adjacent
 * categories and `labelWidth` the widest label, both in pixels.
 */
export function labelEvery(spacing: number, labelWidth: number, gap = 12): number {
  if (!(spacing > 0)) return 1;
  return Math.max(1, Math.ceil((labelWidth + gap) / spacing));
}

/** Smallest and largest finite value in any number of lists, or null when there is none. */
export function extent(lists: readonly (readonly (number | null)[])[]): [number, number] | null {
  let min = Infinity;
  let max = -Infinity;
  for (const list of lists) {
    for (const v of list) {
      if (v === null || !Number.isFinite(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  return min <= max ? [min, max] : null;
}
