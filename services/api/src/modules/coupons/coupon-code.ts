import { randomInt } from 'crypto';

/**
 * Coupon codes, and the normalising that lets a shopper type one loosely.
 *
 * Codes are generated rather than chosen, and the alphabet deliberately omits
 * the characters people confuse when reading a code off a screen or typing it
 * from memory: no 0/O and no 1/I/L. That leaves 30 letters and 8 digits, which
 * is still far more entropy than a customer would ever guess, and it removes
 * the "is that a zero or an O" support question entirely.
 *
 * Normalisation is the mirror image: the stored value is always the canonical
 * upper-case form, so a UNIQUE index on the column is enough to stop two
 * coupons colliding, while entry can be any case the shopper's keyboard
 * produced.
 */

/** A-Z minus I and L, then 2-9 (0, 1 and O are excluded on purpose). */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Characters that are never generated, kept explicit so the rule is testable. */
export const CODE_FORBIDDEN = new Set(['0', '1', 'I', 'L', 'O']);

export const CODE_LENGTH = 8;

/**
 * A code from the CSPRNG, using rejection-free `randomInt` over the alphabet
 * length so every character is uniformly likely. Retries on the (vanishingly
 * unlikely) collision rather than returning a duplicate.
 */
export function generateCouponCode(
  isTaken: (code: string) => boolean = () => false,
  maxAttempts = 8,
): string {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    }
    if (!isTaken(code)) return code;
  }
  throw new Error('Could not generate a unique coupon code');
}

/**
 * The canonical stored form of a typed code: trimmed and upper-cased. Anything
 * outside the alphabet is kept rather than silently dropped, so a typo is
 * reported as "no such code" instead of quietly matching a different coupon.
 */
export function normalizeCouponCode(input: string | null | undefined): string {
  return (input ?? '').trim().toUpperCase();
}

/** True when a string could have been produced by the generator. */
export function isWellFormedCode(code: string): boolean {
  if (code.length !== CODE_LENGTH) return false;
  return [...code].every((ch) => CODE_ALPHABET.includes(ch));
}

/**
 * The canonical form of an email for matching. Conservative on purpose: it
 * trims and lower-cases and nothing else. Stripping dots or `+tags` would be
 * more aggressive, but providers disagree about whether those addresses are the
 * same mailbox, and wrongly merging two accounts is worse than missing a
 * returning customer.
 */
export function normalizeEmail(input: string | null | undefined): string {
  return (input ?? '').trim().toLowerCase();
}

/**
 * The canonical form of a phone number for matching.
 *
 * Only the digits survive, so `0803 111 2222`, `+2348031112222` and
 * `234-803-111-2222` all reduce to the same value. A leading country code is
 * then removed, and a local number that starts with 0 has that 0 removed too,
 * because in Nigeria `0803...` and `+234803...` are the same subscriber. Any
 * other length is left as-is rather than guessed at.
 */
export function normalizePhone(input: string | null | undefined): string | null {
  let digits = (input ?? '').replace(/\D/g, '');
  if (!digits) return null;
  // An international access prefix, then a country code, both removed before the
  // local-number rule below can see a clean subscriber number.
  if (digits.startsWith('00234')) {
    digits = digits.slice(5);
  } else if (digits.startsWith('234') && digits.length > 11) {
    digits = digits.slice(3);
  }
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}
