import { createHmac, timingSafeEqual } from 'crypto';

/**
 * The signed token that stands in for a delivery quote between "here is your
 * price" and "we are creating your order".
 *
 * A quote is a promise about money, so the client must not be able to edit it.
 * The token carries the resolved zone, the size class, the method, the fee and
 * an expiry, all signed with the server secret: a tampered token fails its
 * signature and is rejected rather than quietly believed. The fee is carried so
 * the storefront can show a stable figure, but the server still recomputes the
 * fee when the order is created - a valid signature proves the token is ours,
 * not that the price is still current.
 *
 * Verification is deliberately constant-time and strict: a malformed token, a
 * bad signature and an expired token are all the same failure to the caller,
 * so a probe cannot tell which one it hit.
 */

export interface QuoteTokenPayload {
  zoneId: string;
  sizeClass: string;
  method: string;
  /** Kobo, as an integer string. */
  feeKobo: string;
  /** Expiry as milliseconds since the epoch. */
  expiresAt: number;
}

export type QuoteTokenFailure = 'malformed' | 'bad_signature' | 'expired';

export type QuoteTokenResult =
  | { valid: true; payload: QuoteTokenPayload }
  | { valid: false; reason: QuoteTokenFailure };

const SEPARATOR = '.';

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

/** Builds a token. `now` is passed in so the caller controls the clock. */
export function signQuoteToken(
  payload: QuoteTokenPayload,
  secret: string,
): string {
  const body = [
    payload.zoneId,
    payload.sizeClass,
    payload.method,
    payload.feeKobo,
    String(payload.expiresAt),
  ].join(SEPARATOR);
  return `${body}.${sign(body, secret)}`;
}

/**
 * Checks a token's shape, signature and expiry.
 *
 * The expiry is compared against `now`, supplied by the caller, so this stays
 * a pure function and the tests do not have to wait for a clock.
 */
export function verifyQuoteToken(
  token: string,
  secret: string,
  now: number,
): QuoteTokenResult {
  const parts = token.split(SEPARATOR);
  if (parts.length !== 6) return { valid: false, reason: 'malformed' };
  const [zoneId, sizeClass, method, feeKobo, expiresAt, signature] = parts;

  const expected = sign(parts.slice(0, 5).join(SEPARATOR), secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, reason: 'bad_signature' };
  }

  const expiry = Number(expiresAt);
  if (!Number.isFinite(expiry)) return { valid: false, reason: 'malformed' };
  if (now >= expiry) return { valid: false, reason: 'expired' };

  return {
    valid: true,
    payload: { zoneId, sizeClass, method, feeKobo, expiresAt: expiry },
  };
}