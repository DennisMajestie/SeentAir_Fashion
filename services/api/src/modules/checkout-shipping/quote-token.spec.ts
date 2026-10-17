import { describe, expect, it } from '@jest/globals';
import { signQuoteToken, verifyQuoteToken } from './quote-token';

describe('quote token', () => {
  const secret = 'test-secret';
  const now = 1_800_000_000_000;
  const payload = {
    zoneId: 'zone-1',
    sizeClass: 'medium',
    method: 'freight',
    feeKobo: '250000',
    expiresAt: now + 3_600_000,
  };

  describe('signQuoteToken', () => {
    it('round-trips a payload', () => {
      const token = signQuoteToken(payload, secret);
      const result = verifyQuoteToken(token, secret, now);
      expect(result.valid).toBe(true);
      if (result.valid) expect(result.payload).toEqual(payload);
    });

    it('produces different tokens for the same payload at different expiries', () => {
      const a = signQuoteToken(payload, secret);
      const b = signQuoteToken({ ...payload, expiresAt: now + 7_200_000 }, secret);
      expect(a).not.toBe(b);
    });
  });

  describe('verifyQuoteToken', () => {
    it('rejects a token signed with a different secret', () => {
      const token = signQuoteToken(payload, 'other-secret');
      expect(verifyQuoteToken(token, secret, now)).toEqual({
        valid: false,
        reason: 'bad_signature',
      });
    });

    it('rejects an edited fee', () => {
      const token = signQuoteToken(payload, secret);
      const parts = token.split('.');
      parts[3] = '1'; // one kobo instead of 250000
      expect(verifyQuoteToken(parts.join('.'), secret, now)).toEqual({
        valid: false,
        reason: 'bad_signature',
      });
    });

    it('rejects an edited zone', () => {
      const token = signQuoteToken(payload, secret);
      const parts = token.split('.');
      parts[0] = 'zone-2';
      expect(verifyQuoteToken(parts.join('.'), secret, now)).toEqual({
        valid: false,
        reason: 'bad_signature',
      });
    });

    it('rejects a moved expiry', () => {
      const token = signQuoteToken(payload, secret);
      const parts = token.split('.');
      parts[4] = String(now + 86_400_000);
      expect(verifyQuoteToken(parts.join('.'), secret, now)).toEqual({
        valid: false,
        reason: 'bad_signature',
      });
    });

    it('accepts a token right up to its expiry, and not at it', () => {
      const token = signQuoteToken(payload, secret);
      expect(verifyQuoteToken(token, secret, payload.expiresAt - 1).valid).toBe(true);
      expect(verifyQuoteToken(token, secret, payload.expiresAt)).toEqual({
        valid: false,
        reason: 'expired',
      });
      expect(verifyQuoteToken(token, secret, payload.expiresAt + 1)).toEqual({
        valid: false,
        reason: 'expired',
      });
    });

    it('rejects junk without throwing', () => {
      for (const junk of ['', 'a', 'a.b.c.d.e', 'a.b.c.d.e.f.g', '.....']) {
        expect(verifyQuoteToken(junk, secret, now).valid).toBe(false);
      }
    });

    it('rejects a non-numeric expiry', () => {
      const token = signQuoteToken(payload, secret);
      const parts = token.split('.');
      parts[4] = 'soon';
      const forged = signQuoteToken({ ...payload, expiresAt: NaN }, secret);
      expect(verifyQuoteToken(forged, secret, now)).toEqual({
        valid: false,
        reason: 'malformed',
      });
      expect(verifyQuoteToken(parts.join('.'), secret, now).valid).toBe(false);
    });
  });
});