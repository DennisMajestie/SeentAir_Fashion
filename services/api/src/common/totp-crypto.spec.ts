import { decryptTotpSecret, encryptTotpSecret } from './totp-crypto';

describe('totp-crypto', () => {
  const key = 'test-totp-encryption-key';
  const secret = 'JBSWY3DPEHPK3PXP';

  it('encrypts at rest and round-trips with the configured key', () => {
    const encrypted = encryptTotpSecret(secret, key);
    expect(encrypted).not.toContain(secret);
    expect(encrypted.startsWith('enc:v1:')).toBe(true);
    expect(decryptTotpSecret(encrypted, key)).toBe(secret);
  });

  it('produces a fresh ciphertext each time (random IV)', () => {
    expect(encryptTotpSecret(secret, key)).not.toBe(encryptTotpSecret(secret, key));
  });

  it('reads legacy plaintext secrets when no key was used to store them', () => {
    expect(decryptTotpSecret(secret, key)).toBe(secret);
    expect(decryptTotpSecret(secret, undefined)).toBe(secret);
  });

  it('stores verbatim when no key is configured (legacy fallback)', () => {
    expect(encryptTotpSecret(secret, undefined)).toBe(secret);
  });

  it('refuses to decrypt an encrypted value without the key', () => {
    const encrypted = encryptTotpSecret(secret, key);
    expect(() => decryptTotpSecret(encrypted, undefined)).toThrow();
  });

  it('rejects tampered ciphertext', () => {
    const encrypted = encryptTotpSecret(secret, key);
    const tampered = `${encrypted.slice(0, -2)}AA`;
    expect(() => decryptTotpSecret(tampered, key)).toThrow();
  });
});
