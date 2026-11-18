import { z } from 'zod';
import { now, audit } from '../db.js';
import { encrypt } from '../security.js';
import { queueEmails } from '../email.js';
import { HttpError } from '../scans.js';
import { helpers, type RouteContext } from './context.js';
export function operationRoutes(context: RouteContext) {
  const { app, db, config, admin } = context;
  const { params, event } = helpers(db);
  app.get('/api/settings/smtp', { preHandler: admin }, async () => {
    const row = db
      .prepare('SELECT host,port,secure,username,from_address FROM smtp_settings WHERE id=1')
      .get();
    return row ?? null;
  });
  app.put('/api/settings/smtp', { preHandler: admin }, async (req) => {
    const v = z
      .object({
        host: z.string().min(1).max(253),
        port: z.number().int().min(1).max(65535),
        secure: z.boolean(),
        username: z.string().min(1).max(300),
        password: z.string().max(2000).optional(),
        fromAddress: z.string().email(),
      })
      .parse(req.body);
    const old = db.prepare('SELECT password_encrypted FROM smtp_settings WHERE id=1').get() as
      { password_encrypted: string } | undefined;
    if (!v.password && !old) throw new HttpError(400, 'SMTP password required');
    db.prepare('INSERT OR REPLACE INTO smtp_settings VALUES (1,?,?,?,?,?,?)').run(
      v.host,
      v.port,
      Number(v.secure),
      v.username,
      v.password ? encrypt(config.encryptionKey, v.password) : old!.password_encrypted,
      v.fromAddress,
    );
    audit(db, req.adminId!, 'smtp.update', null, { host: v.host });
    return { ok: true };
  });
  app.post('/api/events/:eventId/emails', { preHandler: admin }, async (req) => {
    event(params(req).eventId);
    if (!db.prepare('SELECT 1 FROM smtp_settings').get())
      throw new HttpError(400, 'Configure SMTP first');
    const v = z
      .object({ participantIds: z.array(z.string().uuid()).min(1).max(10000).optional() })
      .parse(req.body ?? {});
    const queued = queueEmails(db, params(req).eventId, v.participantIds);
    audit(db, req.adminId!, 'emails.queue', params(req).eventId, { queued });
    return { queued };
  });
  app.get('/api/events/:eventId/emails', { preHandler: admin }, async (req) => {
    event(params(req).eventId);
    return db
      .prepare(
        'SELECT j.*,p.email,p.full_name FROM email_jobs j JOIN participants p ON p.id=j.participant_id WHERE p.event_id=? ORDER BY j.created_at DESC LIMIT 200',
      )
      .all(params(req).eventId);
  });
  app.post('/api/emails/:id/retry', { preHandler: admin }, async (req) => {
    const result = db
      .prepare(
        "UPDATE email_jobs SET status='queued',attempts=0,next_attempt_at=?,last_error=NULL WHERE id=? AND status='failed'",
      )
      .run(now(), params(req).id);
    if (!result.changes) throw new HttpError(409, 'Only failed email jobs can be retried');
    return { ok: true };
  });
  app.get('/api/events/:eventId/dashboard', { preHandler: admin }, async (req) => {
    const { eventId } = params(req);
    event(eventId);
    return {
      participants: db
        .prepare(
          'SELECT count(*) AS total,sum(active) AS active FROM participants WHERE event_id=?',
        )
        .get(eventId),
      gates: db
        .prepare(
          'SELECT g.*,count(c.id) AS collections,count(DISTINCT c.participant_id) AS people FROM gates g LEFT JOIN collections c ON c.gate_id=g.id AND c.undone_at IS NULL WHERE g.event_id=? GROUP BY g.id ORDER BY g.created_at',
        )
        .all(eventId),
      activity: db
        .prepare(
          'SELECT s.id,s.status,s.message,s.manual,s.reason,s.created_at,c.undone_at,c.undo_reason,p.full_name,g.name AS gate_name FROM scans s LEFT JOIN participants p ON p.id=s.participant_id JOIN gates g ON g.id=s.gate_id LEFT JOIN collections c ON c.scan_id=s.id WHERE s.event_id=? ORDER BY s.created_at DESC LIMIT 50',
        )
        .all(eventId),
      emails: db
        .prepare(
          'SELECT j.status,count(*) AS count FROM email_jobs j JOIN participants p ON p.id=j.participant_id WHERE p.event_id=? GROUP BY j.status',
        )
        .all(eventId),
    };
  });
}
