import { gateRevisions } from '../collections.js';
import { randomInt, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { scanSchema } from '@gatecheck/shared';
import { now, audit } from '../db.js';
import { hash, randomToken } from '../security.js';
import { HttpError, processScan } from '../scans.js';
import { helpers, type RouteContext } from './context.js';
export function deviceRoutes(context: RouteContext) {
  const { app, db, config, admin, device } = context;
  const { params, event } = helpers(db);
  app.post('/api/events/:eventId/pairing', { preHandler: admin }, async (req) => {
    const { eventId } = params(req);
    event(eventId);
    const v = z.object({ gateId: z.string().uuid() }).parse(req.body);
    if (!db.prepare('SELECT 1 FROM gates WHERE id=? AND event_id=?').get(v.gateId, eventId))
      throw new HttpError(400, 'Gate not found');
    const code = randomInt(10000000, 100000000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60000).toISOString();
    db.prepare('DELETE FROM pairing_codes WHERE expires_at<=?').run(now());
    db.prepare('INSERT INTO pairing_codes VALUES (?,?,?,?,?)').run(
      hash(code),
      eventId,
      v.gateId,
      expiresAt,
      now(),
    );
    audit(db, req.adminId!, 'pairing.create', v.gateId, {});
    return { code, expiresAt };
  });
  app.post(
    '/api/device/pair',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const v = z
        .object({ code: z.string().regex(/^\d{8}$/), name: z.string().trim().min(1).max(100) })
        .parse(req.body);
      return db.transaction(() => {
        const pair = db
          .prepare('SELECT * FROM pairing_codes WHERE code_hash=? AND expires_at>?')
          .get(hash(v.code), now()) as { event_id: string; gate_id: string } | undefined;
        if (!pair) throw new HttpError(400, 'Pairing code expired or already used');
        const id = randomUUID(),
          token = randomToken();
        db.prepare(
          'INSERT INTO devices(id,event_id,gate_id,name,token_hash,created_at) VALUES (?,?,?,?,?,?)',
        ).run(id, pair.event_id, pair.gate_id, v.name, hash(token), now());
        db.prepare('DELETE FROM pairing_codes WHERE code_hash=?').run(hash(v.code));
        audit(db, null, 'device.pair', id, { name: v.name });
        return { token, id };
      })();
    },
  );
  app.get('/api/device/me', { preHandler: device }, async (req) => {
    const d = req.device!;
    return {
      id: d.id,
      name: d.name,
      event: event(d.event_id),
      gate: db.prepare('SELECT * FROM gates WHERE id=?').get(d.gate_id),
      collectionRevisions: gateRevisions(db, d.gate_id),
    };
  });
  app.get('/api/device/participants', { preHandler: device }, async (req) => {
    const q = z.object({ q: z.string().min(2).max(100) }).parse(req.query);
    return db
      .prepare(
        'SELECT id,full_name,email,active FROM participants WHERE event_id=? AND (full_name LIKE ? OR email LIKE ?) LIMIT 20',
      )
      .all(req.device!.event_id, `%${q.q}%`, `%${q.q}%`);
  });
  app.post('/api/device/scans', { preHandler: device }, async (req) => {
    const d = req.device!;
    return processScan(
      db,
      config.qrSecret,
      { eventId: d.event_id, gateId: d.gate_id, deviceId: d.id },
      scanSchema.parse(req.body),
    );
  });
  app.get('/api/events/:eventId/devices', { preHandler: admin }, async (req) => {
    event(params(req).eventId);
    return db
      .prepare(
        'SELECT d.id,d.name,d.gate_id,d.revoked,d.last_seen,d.created_at,g.name AS gate_name FROM devices d JOIN gates g ON g.id=d.gate_id WHERE d.event_id=? ORDER BY d.created_at DESC',
      )
      .all(params(req).eventId);
  });
  app.post('/api/devices/:id/revoke', { preHandler: admin }, async (req) => {
    if (!db.prepare('UPDATE devices SET revoked=1 WHERE id=?').run(params(req).id).changes)
      throw new HttpError(404, 'Device not found');
    audit(db, req.adminId!, 'device.revoke', params(req).id, {});
    return { ok: true };
  });
}
