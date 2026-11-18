import { configFromEnv } from './config.js';
import { buildApp, bootstrapAdmin } from './app.js';
const config = configFromEnv();
const { app, db } = await buildApp(config, { logger: true });
if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD)
  throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD');
bootstrapAdmin(db, process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
await app.listen({ host: process.env.HOST ?? '127.0.0.1', port: Number(process.env.PORT ?? 3001) });
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
