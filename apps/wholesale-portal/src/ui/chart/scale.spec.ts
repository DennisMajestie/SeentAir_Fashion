import { extent, labelEvery, linearScale, niceTicks } from './scale';

const evenlySpaced = (ticks: number[]): boolean => {
  const step = ticks[1] - ticks[0];
  return ticks.every(
    (t, i) => i === 0 || Math.abs(t - ticks[i - 1] - step) < Math.abs(step) * 1e-6,
  );
};

describe('niceTicks', () => {
  it('covers the data with round, evenly spaced values', () => {
    expect(niceTicks(0, 100)).toEqual([0, 25, 50, 75, 100]);
    expect(niceTicks(0, 87)).toEqual([0, 25, 50, 75, 100]);
    expect(niceTicks(180_000, 420_000)).toEqual([100_000, 200_000, 300_000, 400_000, 500_000]);
    expect(niceTicks(0, 7, 4)).toEqual([0, 2, 4, 6, 8]);
  });

  it('only ever steps by 1, 2, 2.5 or 5 times a power of ten', () => {
    for (const [min, max] of [
      [0, 3],
      [12, 977],
      [-40, 15],
      [0.02, 0.09],
      [3, 1_250_000],
    ]) {
      const ticks = niceTicks(min, max);
      const step = ticks[1] - ticks[0];
      const fraction = step / 10 ** Math.floor(Math.log10(step) + 1e-9);
      expect([1, 2, 2.5, 5].some((n) => Math.abs(fraction - n) < 1e-6))
        .withContext(`${min}..${max} stepped by ${step}`)
        .toBeTrue();
      expect(evenlySpaced(ticks)).toBeTrue();
      expect(ticks[0]).toBeLessThanOrEqual(min);
      expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(max);
    }
  });

  it('includes zero when the data straddles or touches it', () => {
    expect(niceTicks(-320_000, 910_000)).toContain(0);
    expect(niceTicks(0, 45)).toContain(0);
    expect(niceTicks(-45, 0)).toContain(0);
    expect(niceTicks(-3, 7)).toEqual([-5, -2.5, 0, 2.5, 5, 7.5]);
    expect(niceTicks(-30, 70, 2)).toEqual([-50, 0, 50, 100]);
  });

  it('handles a range that is entirely negative', () => {
    const ticks = niceTicks(-90, -10);
    expect(ticks).toEqual([-100, -80, -60, -40, -20, 0]);
    expect(niceTicks(-900, -700)).toEqual([-900, -850, -800, -750, -700]);
  });

  it('measures a single value, or all values equal, from zero', () => {
    expect(niceTicks(50, 50)).toEqual([0, 20, 40, 60]);
    expect(niceTicks(-50, -50)).toEqual([-60, -40, -20, 0]);
  });

  it('gives all zeros an axis anyway', () => {
    expect(niceTicks(0, 0)).toEqual([0, 1]);
  });

  it('survives swapped and non-finite input', () => {
    expect(niceTicks(100, 0)).toEqual(niceTicks(0, 100));
    expect(niceTicks(NaN, 10)).toEqual([0, 1]);
    expect(niceTicks(0, Infinity)).toEqual([0, 1]);
  });

  it('keeps fractions free of float noise', () => {
    expect(niceTicks(0, 1)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(niceTicks(0.1, 0.3, 2)).toEqual([0.1, 0.2, 0.3]);
  });
});

describe('linearScale', () => {
  it('maps a domain onto a range, inverted ranges included', () => {
    const y = linearScale([0, 100], [200, 0]);
    expect(y(0)).toBe(200);
    expect(y(50)).toBe(100);
    expect(y(100)).toBe(0);
    expect(linearScale([-50, 50], [0, 10])(0)).toBe(5);
  });

  it('maps a flat domain to the start of the range instead of dividing by zero', () => {
    expect(linearScale([5, 5], [10, 90])(5)).toBe(10);
  });
});

describe('labelEvery', () => {
  it('shows every label when they fit and every nth when they do not', () => {
    expect(labelEvery(80, 40)).toBe(1);
    expect(labelEvery(20, 40, 12)).toBe(3);
    expect(labelEvery(4, 40, 12)).toBe(13);
    expect(labelEvery(0, 40)).toBe(1);
  });
});

describe('extent', () => {
  it('finds the range across series and skips gaps', () => {
    expect(
      extent([
        [3, null, 9],
        [-2, 4],
      ]),
    ).toEqual([-2, 9]);
    expect(extent([[null, null], []])).toBeNull();
    expect(extent([[NaN, 7]])).toEqual([7, 7]);
  });
});
