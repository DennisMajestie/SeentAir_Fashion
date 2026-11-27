import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const PREFIX = 'enc:v1';

function keyFor(secret: string | undefined): Buffer | null {
  if (!secret) return null;
  return createHash('sha256').update(secret).digest();
}

/** TOTP secrets are encrypted at rest when a key is configured. Legacy
 *  plaintext values are still readable and are rewritten on next enrolment. */
export function encryptTotpSecret(value: string, keySecret?: string): string {
  const key = keyFor(keySecret);
  if (!key) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [
    PREFIX,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':');
}

export function decryptTotpSecret(value: string, keySecret?: string): string {
  if (!value.startsWith(`${PREFIX}:`)) return value;
  const key = keyFor(keySecret);
  if (!key) throw new Error('TOTP encryption key is missing');
  const [, , ivPart, tagPart, dataPart] = value.split(':');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
