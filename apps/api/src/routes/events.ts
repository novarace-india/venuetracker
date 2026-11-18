import { randomUUID } from 'node:crypto';
import { eventSchema } from '@gatecheck/shared';
import { now, audit } from '../db.js';
import { helpers, type RouteContext } from './context.js';
export function eventRoutes(context: RouteContext) {
  const { app, db, admin } = context;
  const { params, event } = helpers(db);
  app.get('/api/events', { preHandler: admin }, async () =>
    db.prepare('SELECT * FROM events ORDER BY created_at DESC').all(),
  );
  app.post('/api/events', { preHandler: admin }, async (req, reply) => {
    const v = eventSchema.parse(req.body),
      id = randomUUID();
    db.prepare('INSERT INTO events VALUES (?,?,?,?,?,?,?)').run(
      id,
      v.name,
      v.timezone,
      v.startsAt ?? null,
      v.emailSubject,
      v.emailBody,
      now(),
    );
    audit(db, req.adminId!, 'event.create', id, { name: v.name });
    return reply.code(201).send(event(id));
  });
  app.put('/api/events/:eventId', { preHandler: admin }, async (req) => {
    const id = params(req).eventId;
    event(id);
    const v = eventSchema.parse(req.body);
    db.prepare(
      'UPDATE events SET name=?,timezone=?,starts_at=?,email_subject=?,email_body=? WHERE id=?',
    ).run(v.name, v.timezone, v.startsAt ?? null, v.emailSubject, v.emailBody, id);
    audit(db, req.adminId!, 'event.update', id, {});
    return event(id);
  });
}
