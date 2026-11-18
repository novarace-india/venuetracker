import { analyticsFixture } from '../apps/api/test/analytics.fixture.js';
import path from 'node:path';
import { buildApp, bootstrapAdmin } from '../apps/api/src/app.js';
const { app, db } = await buildApp(
  {
    databasePath: ':memory:',
    qrSecret: 'browser-test-qr-secret-32-characters-long',
    encryptionKey: 'browser-test-encryption-32-characters-long',
    origin: 'http://127.0.0.1:4173',
    production: false,
    webRoot: path.resolve('apps/web/dist'),
  },
  { worker: false },
);
bootstrapAdmin(db, 'browser@example.com', 'browser-test-password');
analyticsFixture(db);
await app.listen({ host: '127.0.0.1', port: 4173 });
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => void app.close().then(() => process.exit(0)));
