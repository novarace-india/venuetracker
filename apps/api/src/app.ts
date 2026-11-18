import { collectionRoutes } from './routes/collections.js';
import { analyticsRoutes } from './routes/analytics.js';
import { exportRoutes } from './routes/exports.js';
import { deviceRoutes } from './routes/devices.js';
import { operationRoutes } from './routes/operations.js';
import { gateRoutes } from './routes/gates.js';
import { participantRoutes } from './routes/participants.js';
import { eventRoutes } from './routes/events.js';
import Fastify, { type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { z, ZodError } from 'zod';
import { openDatabase, now, type DB, type DeviceRow } from './db.js';
import { hash, randomToken, passwordMatches, passwordHash } from './security.js';
import { HttpError } from './scans.js';
import { createEmailWorker } from './email.js';
import type { Config } from './config.js';
declare module 'fastify' {
  interface FastifyRequest {
    adminId?: string;
    device?: DeviceRow;
  }
}
export function bootstrapAdmin(db: DB, email: string, password: string) {
  if (password.length < 12) throw new Error('ADMIN_PASSWORD must contain at least 12 characters');
  if (!db.prepare('SELECT id FROM admins LIMIT 1').get())
    db.prepare('INSERT INTO admins VALUES (?,?,?,?)').run(
      randomUUID(),
      email.trim().toLowerCase(),
      passwordHash(password),
      now(),
    );
}
export async function buildApp(
  config: Config,
  options: { db?: DB; worker?: boolean; logger?: boolean } = {},
) {
  const db = options.db ?? openDatabase(config.databasePath);
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 1024 * 1024,
    trustProxy: false,
  });
  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        workerSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  });
  await app.register(rateLimit, { max: 600, timeWindow: '1 minute' });
  await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 5 } });
  app.addHook('onRequest', async (req) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.headers.origin;
      if (origin && origin !== config.origin) throw new HttpError(403, 'Origin not allowed');
      if (req.headers['sec-fetch-site'] === 'cross-site')
        throw new HttpError(403, 'Cross-site request blocked');
    }
  });
  app.addHook('onSend', async (req, reply, payload) => {
    if (req.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
    return payload;
  });
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof ZodError)
      return reply
        .code(400)
        .send({ error: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
    const e = error as Error & { statusCode?: number; code?: string };
    if (e.code?.startsWith('SQLITE_CONSTRAINT'))
      return reply.code(409).send({ error: 'Conflicting record or dependency' });
    const status = e.statusCode ?? 500;
    if (status >= 500) req.log.error(error);
    return reply.code(status).send({ error: status >= 500 ? 'Internal server error' : e.message });
  });
  async function admin(req: FastifyRequest) {
    const token = req.cookies.gc_session;
    const session = token
      ? (db
          .prepare('SELECT admin_id FROM sessions WHERE token_hash=? AND expires_at>?')
          .get(hash(token), now()) as { admin_id: string } | undefined)
      : undefined;
    if (!session) throw new HttpError(401, 'Sign in required');
    req.adminId = session.admin_id;
  }
  async function device(req: FastifyRequest) {
    const token = req.headers.authorization?.replace(/^Bearer /, '');
    const row = token
      ? (db.prepare('SELECT * FROM devices WHERE token_hash=? AND revoked=0').get(hash(token)) as
          DeviceRow | undefined)
      : undefined;
    if (!row) throw new HttpError(401, 'Device pairing required');
    req.device = row;
    db.prepare('UPDATE devices SET last_seen=? WHERE id=?').run(now(), row.id);
  }
  const dummyPasswordHash = passwordHash('constant-dummy-password');
  app.get('/api/health', async () => ({ ok: true }));
  app.post(
    '/api/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const data = z
        .object({ email: z.string().email(), password: z.string().min(1).max(200) })
        .parse(req.body);
      const row = db.prepare('SELECT * FROM admins WHERE email=?').get(data.email.toLowerCase()) as
        { id: string; password_hash: string } | undefined;
      const valid = passwordMatches(data.password, row?.password_hash ?? dummyPasswordHash);
      if (!row || !valid) throw new HttpError(401, 'Invalid email or password');
      const token = randomToken();
      db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now());
      db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(
        hash(token),
        row.id,
        new Date(Date.now() + 12 * 3600000).toISOString(),
      );
      reply.setCookie('gc_session', token, {
        path: '/',
        httpOnly: true,
        sameSite: 'strict',
        secure: config.production,
        maxAge: 43200,
      });
      return { ok: true };
    },
  );
  app.get('/api/auth/me', { preHandler: admin }, async (req) =>
    db.prepare('SELECT id,email FROM admins WHERE id=?').get(req.adminId),
  );
  app.post('/api/auth/logout', { preHandler: admin }, async (req, reply) => {
    db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(req.cookies.gc_session!));
    reply.clearCookie('gc_session', { path: '/' });
    return { ok: true };
  });

  for (const register of [
    eventRoutes,
    participantRoutes,
    gateRoutes,
    operationRoutes,
    deviceRoutes,
    exportRoutes,
    analyticsRoutes,
    collectionRoutes,
  ])
    register({ app, db, config, admin, device });
  const worker = options.worker === false ? null : createEmailWorker(db, config);
  app.addHook('onClose', async () => {
    await worker?.stop();
    if (!options.db) db.close();
  });
  if (existsSync(config.webRoot)) {
    await app.register(fastifyStatic, { root: config.webRoot, maxAge: 0 });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/'))
        return reply.code(404).send({ error: 'API route not found' });
      return reply.type('text/html').sendFile('index.html');
    });
  }
  return { app, db };
}
