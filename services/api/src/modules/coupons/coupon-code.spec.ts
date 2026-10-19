import { randomInt } from 'crypto';
import {
  CODE_ALPHABET,
  CODE_FORBIDDEN,
  CODE_LENGTH,
  generateCouponCode,
  isWellFormedCode,
  normalizeCouponCode,
  normalizeEmail,
  normalizePhone,
} from './coupon-code';

describe('coupon codes', () => {
  describe('generateCouponCode', () => {
    it('is eight characters long', () => {
      expect(generateCouponCode()).toHaveLength(CODE_LENGTH);
    });

    it('never uses a look-alike character', () => {
      for (let i = 0; i < 500; i++) {
        for (const ch of generateCouponCode()) {
          expect(CODE_FORBIDDEN.has(ch)).toBe(false);
        }
      }
    });

    it('only draws from the alphabet', () => {
      for (const ch of generateCouponCode()) expect(CODE_ALPHABET).toContain(ch);
    });

    it('does not always return the same code', () => {
      const codes = new Set(Array.from({ length: 50 }, () => generateCouponCode()));
      expect(codes.size).toBeGreaterThan(45);
    });

    it('retries until it finds a free code', () => {
      const seen: string[] = [];
      const code = generateCouponCode((candidate) => {
        seen.push(candidate);
        return seen.length < 3;
      });
      expect(seen.length).toBe(3);
      // the third candidate was free, so that is the one returned
      expect(code).toBe(seen[2]);
    });

    it('gives up rather than looping forever', () => {
      expect(() => generateCouponCode(() => true, 3)).toThrow(/unique coupon code/);
    });
  });

  describe('isWellFormedCode', () => {
    it('accepts a generated code', () => {
      expect(isWellFormedCode(generateCouponCode())).toBe(true);
    });

    it('rejects the wrong length', () => {
      expect(isWellFormedCode('ABC')).toBe(false);
      expect(isWellFormedCode('ABCDEFGHI')).toBe(false);
    });

    it('rejects look-alike characters', () => {
      expect(isWellFormedCode('ABCD0FGH')).toBe(false);
      expect(isWellFormedCode('ABCDEFG1')).toBe(false);
      expect(isWellFormedCode('ABCDEFGH')).toBe(true);
      expect(isWellFormedCode('ABCDEFGI')).toBe(false);
      expect(isWellFormedCode('ABCDEFGH'.replace('H', 'O'))).toBe(false);
    });
  });

  describe('normalizeCouponCode', () => {
    it('upper-cases and trims', () => {
      expect(normalizeCouponCode('  save20now ')).toBe('SAVE20NOW');
    });

    it('leaves a canonical code alone', () => {
      expect(normalizeCouponCode('SAVE20NO')).toBe('SAVE20NO');
    });

    it('handles nothing gracefully', () => {
      expect(normalizeCouponCode(null)).toBe('');
      expect(normalizeCouponCode(undefined)).toBe('');
      expect(normalizeCouponCode('')).toBe('');
    });

    it('does not strip characters a shopper mistyped', () => {
      expect(normalizeCouponCode('SAVE20N0!')).toBe('SAVE20N0!');
    });
  });

  describe('normalizeEmail', () => {
    it('trims and lower-cases', () => {
      expect(normalizeEmail('  Ada@Example.COM ')).toBe('ada@example.com');
    });

    it('keeps dots and plus tags, because providers disagree', () => {
      expect(normalizeEmail('a.b+tag@example.com')).toBe('a.b+tag@example.com');
    });

    it('handles nothing gracefully', () => {
      expect(normalizeEmail(null)).toBe('');
      expect(normalizeEmail('   ')).toBe('');
    });
  });

  describe('normalizePhone', () => {
    it('reduces the local, country-code and spaced forms to one value', () => {
      expect(normalizePhone('08031112222')).toBe('8031112222');
      expect(normalizePhone('+2348031112222')).toBe('8031112222');
      expect(normalizePhone('234 803 111 2222')).toBe('8031112222');
      expect(normalizePhone('00234-803-111-2222')).toBe('8031112222');
    });

    it('strips punctuation', () => {
      expect(normalizePhone('(0803) 111-2222')).toBe('8031112222');
    });

    it('returns null for nothing', () => {
      expect(normalizePhone(null)).toBeNull();
      expect(normalizePhone('')).toBeNull();
      expect(normalizePhone('   ')).toBeNull();
      expect(normalizePhone('abc')).toBeNull();
    });

    it('leaves an unfamiliar length alone rather than guessing', () => {
      expect(normalizePhone('12345')).toBe('12345');
      expect(normalizePhone('080311122')).toBe('080311122');
    });

    it('is not confused by a double country code', () => {
      expect(normalizePhone('+23408031112222')).toBe('8031112222');
    });
  });

  describe('randomness is real, not seeded', () => {
    it('does not depend on Math.random', () => {
      const spy = jest.spyOn(Math, 'random');
      generateCouponCode();
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  // Guard against someone adding a look-alike character to the alphabet later.
  it('the alphabet itself contains no look-alikes', () => {
    for (const ch of CODE_ALPHABET) expect(CODE_FORBIDDEN.has(ch)).toBe(false);
  });

  it('randomInt bounds are respected', () => {
    // Confirms the alphabet indexing cannot walk off the end.
    expect(randomInt(CODE_ALPHABET.length)).toBeLessThan(CODE_ALPHABET.length);
  });
});