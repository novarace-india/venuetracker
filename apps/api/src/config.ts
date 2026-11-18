import path from 'node:path';
export interface Config {
  databasePath: string;
  qrSecret: string;
  encryptionKey: string;
  origin: string;
  production: boolean;
  webRoot: string;
}
export function configFromEnv(): Config {
  const qrSecret = process.env.QR_SECRET ?? '',
    encryptionKey = process.env.ENCRYPTION_KEY ?? '';
  if (
    qrSecret.length < 32 ||
    encryptionKey.length < 32 ||
    qrSecret.startsWith('replace-') ||
    encryptionKey.startsWith('replace-')
  )
    throw new Error('Set distinct random QR_SECRET and ENCRYPTION_KEY (32+ characters) in .env');
  if (qrSecret === encryptionKey) throw new Error('Secrets must be distinct');
  const origin = new URL(process.env.PUBLIC_ORIGIN ?? 'http://localhost:5173').origin;
  if (process.env.NODE_ENV === 'production' && !origin.startsWith('https://'))
    throw new Error('Production PUBLIC_ORIGIN must use HTTPS');
  return {
    databasePath: path.resolve(process.env.DATABASE_PATH ?? '../../data/gatecheck.sqlite'),
    qrSecret,
    encryptionKey,
    origin,
    production: process.env.NODE_ENV === 'production',
    webRoot: path.resolve('../web/dist'),
  };
}
