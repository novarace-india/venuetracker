import { undoCollection } from '../collections.js';
import { randomUUID } from 'node:crypto';
import { gateSchema, scanSchema } from '@gatecheck/shared';
import { z } from 'zod';
import { now, audit, type GateRow } from '../db.js';
import { HttpError, processScan } from '../scans.js';
import { helpers, type RouteContext } from './context.js';
export function gateRoutes(context: RouteContext) {
  const { app, db, config, admin } = context;
  const { params, event } = helpers(db);
  app.get('/api/events/:eventId/gates', { preHandler: admin }, async (req) => {
    const { eventId } = params(req);
    event(eventId);
    return getGates(eventId);
  });
  function getGates(eventId: string) {
    return (
      db
        .prepare('SELECT * FROM gates WHERE event_id=? ORDER BY created_at')
        .all(eventId) as GateRow[]
    ).map((g) => ({
      ...g,
      requires: (
        db.prepare('SELECT requires_id FROM gate_dependencies WHERE gate_id=?').all(g.id) as {
          requires_id: string;
        }[]
      ).map((r) => r.requires_id),
    }));
  }
  function saveGate(eventId: string, id: string, body: unknown, isNew: boolean) {
    event(eventId);
    const v = gateSchema.parse(body);
    db.transaction(() => {
      if (!isNew && !db.prepare('SELECT 1 FROM gates WHERE id=? AND event_id=?').get(id, eventId))
        throw new HttpError(404, 'Gate not found');
      for (const dependency of v.requires)
        if (
          dependency === id ||
          !db.prepare('SELECT 1 FROM gates WHERE id=? AND event_id=?').get(dependency, eventId)
        )
          throw new HttpError(400, 'Dependencies must be other gates in this event');
      if (isNew)
        db.prepare('INSERT INTO gates VALUES (?,?,?,?,?)').run(
          id,
          eventId,
          v.name,
          v.maxCollections,
          now(),
        );
      else
        db.prepare('UPDATE gates SET name=?,max_collections=? WHERE id=?').run(
          v.name,
          v.maxCollections,
          id,
        );
      db.prepare('DELETE FROM gate_dependencies WHERE gate_id=?').run(id);
      for (const dep of new Set(v.requires))
        db.prepare('INSERT INTO gate_dependencies VALUES (?,?)').run(id, dep);
      const cycle = db
        .prepare(
          'WITH RECURSIVE deps(id) AS (SELECT requires_id FROM gate_dependencies WHERE gate_id=? UNION SELECT d.requires_id FROM gate_dependencies d JOIN deps x ON d.gate_id=x.id) SELECT 1 FROM deps WHERE id=?',
        )
        .get(id, id);
      if (cycle) throw new HttpError(400, 'Gate dependency cycle is not allowed');
    })();
    return getGates(eventId).find((g) => g.id === id);
  }
  app.post('/api/events/:eventId/gates', { preHandler: admin }, async (req, reply) => {
    const result = saveGate(params(req).eventId, randomUUID(), req.body, true);
    audit(db, req.adminId!, 'gate.create', result!.id, result);
    return reply.code(201).send(result);
  });
  app.put('/api/events/:eventId/gates/:id', { preHandler: admin }, async (req) => {
    const p = params(req);
    const result = saveGate(p.eventId, p.id, req.body, false);
    audit(db, req.adminId!, 'gate.update', p.id, result);
    return result;
  });
  app.post('/api/events/:eventId/gates/:id/scans', { preHandler: admin }, async (req) =>
    processScan(
      db,
      config.qrSecret,
      { eventId: params(req).eventId, gateId: params(req).id, actorId: req.adminId },
      scanSchema.parse(req.body),
    ),
  );
  app.post('/api/collections/:id/undo', { preHandler: admin }, async (req) => {
    const v = z.object({ reason: z.string().trim().min(3).max(500) }).parse(req.body);
    const result = undoCollection(db, params(req).id, req.adminId!, v.reason);
    return { ok: true, reset: result };
  });
}
