import { ORDER_NUMBER_PREFIX, formatOrderNumber, parseOrderNumber } from './order-number';

describe('ORDER_NUMBER_PREFIX', () => {
  it('is the constant used everywhere', () => {
    expect(ORDER_NUMBER_PREFIX).toBe('SO');
  });
});

describe('formatOrderNumber', () => {
  it('renders SO-1001 for 1001', () => {
    expect(formatOrderNumber(1001)).toBe('SO-1001');
  });
  it('renders SO-1 for 1', () => {
    expect(formatOrderNumber(1)).toBe('SO-1');
  });
  it('renders SO-4294967295 for large numbers', () => {
    expect(formatOrderNumber(4294967295)).toBe('SO-4294967295');
  });
  it('preserves bigint values returned as strings by PostgreSQL', () => {
    expect(formatOrderNumber('9007199254740993')).toBe('SO-9007199254740993');
  });
  it('truncates decimals', () => {
    expect(formatOrderNumber(1001.9)).toBe('SO-1001');
  });
});

describe('parseOrderNumber', () => {
  it('parses SO-1001', () => {
    expect(parseOrderNumber('SO-1001')).toBe(1001);
  });
  it('parses bare 1001', () => {
    expect(parseOrderNumber('1001')).toBe(1001);
  });
  it('is case-insensitive on prefix', () => {
    expect(parseOrderNumber('so-1001')).toBe(1001);
  });
  it('handles surrounding whitespace', () => {
    expect(parseOrderNumber('  SO-1001  ')).toBe(1001);
  });
  it('returns null for empty', () => {
    expect(parseOrderNumber('')).toBeNull();
    expect(parseOrderNumber('   ')).toBeNull();
  });
  it('returns null for wrong prefix', () => {
    expect(parseOrderNumber('XX-1001')).toBeNull();
  });
  it('returns null for non-numeric', () => {
    expect(parseOrderNumber('SO-ABC')).toBeNull();
    expect(parseOrderNumber('abc')).toBeNull();
  });
  it('returns null for negative', () => {
    expect(parseOrderNumber('-5')).toBeNull();
  });
  it('round-trips formatOrderNumber', () => {
    for (const n of [1, 1001, 99999, 0]) {
      expect(parseOrderNumber(formatOrderNumber(n))).toBe(n);
    }
  });
});
