import {
  createHmac,
  timingSafeEqual,
  randomBytes,
  scryptSync,
  createHash,
  createCipheriv,
  createDecipheriv,
} from 'node:crypto';
export const randomToken = () => randomBytes(32).toString('base64url');
export const hash = (s: string) => createHash('sha256').update(s).digest('hex');
export function passwordHash(password: string) {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + scryptSync(password, salt, 64).toString('hex');
}
export function passwordMatches(password: string, encoded: string) {
  const [salt, key] = encoded.split(':');
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(key, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function qrPayload(secret: string, eventId: string, id: string, nonce: string) {
  const body = `gc1.${eventId}.${id}.${nonce}`;
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}
export function verifyQr(secret: string, payload: string) {
  const parts = payload.split('.');
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (
    parts.length !== 5 ||
    parts[0] !== 'gc1' ||
    !uuid.test(parts[1]) ||
    !uuid.test(parts[2]) ||
    !/^[-A-Za-z0-9_]{16,128}$/.test(parts[3]) ||
    !/^[-A-Za-z0-9_]{43}$/.test(parts[4])
  )
    return null;
  const signature = Buffer.from(parts[4], 'base64url'),
    expected = createHmac('sha256', secret).update(parts.slice(0, 4).join('.')).digest();
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) return null;
  return { eventId: parts[1], participantId: parts[2], nonce: parts[3] };
}
export function encrypt(secret: string, value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', createHash('sha256').update(secret).digest(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((v) => v.toString('base64url')).join('.');
}
export function decrypt(secret: string, value: string) {
  const [iv, tag, data] = value.split('.').map((v) => Buffer.from(v, 'base64url'));
  const cipher = createDecipheriv('aes-256-gcm', createHash('sha256').update(secret).digest(), iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8');
}
