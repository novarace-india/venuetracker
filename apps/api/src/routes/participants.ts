import { participantSchema } from '@gatecheck/shared';
import { z } from 'zod';
import QRCode from 'qrcode';
import { audit, type ParticipantRow } from '../db.js';
import { randomToken, qrPayload } from '../security.js';
import { insertParticipant, publicParticipant, importParticipants } from '../participants.js';
import { HttpError } from '../scans.js';
import { helpers, type RouteContext } from './context.js';
export function participantRoutes(context: RouteContext) {
  const { app, db, config, admin } = context;
  const { params, event, participant } = helpers(db);
  app.get('/api/events/:eventId/participants', { preHandler: admin }, async (req) => {
    const { eventId } = params(req);
    event(eventId);
    const q = z
      .object({
        q: z.string().max(200).default(''),
        limit: z.coerce.number().int().min(1).max(500).default(100),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(req.query);
    const pattern = `%${q.q}%`;
    const rows = db
      .prepare(
        'SELECT * FROM participants WHERE event_id=? AND (full_name LIKE ? OR email LIKE ?) ORDER BY full_name LIMIT ? OFFSET ?',
      )
      .all(eventId, pattern, pattern, q.limit, q.offset) as ParticipantRow[];
    const total = db
      .prepare(
        'SELECT count(*) AS n FROM participants WHERE event_id=? AND (full_name LIKE ? OR email LIKE ?)',
      )
      .get(eventId, pattern, pattern) as { n: number };
    return { items: rows.map(publicParticipant), total: total.n };
  });
  app.post('/api/events/:eventId/participants', { preHandler: admin }, async (req, reply) => {
    const { eventId } = params(req);
    event(eventId);
    const id = insertParticipant(db, eventId, participantSchema.parse(req.body));
    audit(db, req.adminId!, 'participant.create', id, {});
    return reply.code(201).send(publicParticipant(participant(eventId, id)));
  });
  app.put('/api/events/:eventId/participants/:id', { preHandler: admin }, async (req) => {
    const { eventId, id } = params(req);
    participant(eventId, id);
    const v = participantSchema.parse(req.body);
    db.prepare(
      'UPDATE participants SET email=?,full_name=?,phone=?,ticket_type=?,company=?,metadata=?,active=? WHERE id=?',
    ).run(
      v.email,
      v.fullName,
      v.phone,
      v.ticketType,
      v.company,
      JSON.stringify(v.metadata),
      Number(v.active),
      id,
    );
    audit(db, req.adminId!, 'participant.update', id, { active: v.active });
    return publicParticipant(participant(eventId, id));
  });
  app.delete('/api/events/:eventId/participants/:id', { preHandler: admin }, async (req) => {
    const { eventId, id } = params(req);
    participant(eventId, id);
    db.prepare('UPDATE participants SET active=0 WHERE id=?').run(id);
    audit(db, req.adminId!, 'participant.deactivate', id, {});
    return { ok: true };
  });
  app.post(
    '/api/events/:eventId/participants/:id/revoke-qr',
    { preHandler: admin },
    async (req) => {
      const { eventId, id } = params(req);
      participant(eventId, id);
      db.prepare('UPDATE participants SET token_nonce=? WHERE id=?').run(randomToken(), id);
      audit(db, req.adminId!, 'participant.revoke-qr', id, {});
      return { ok: true };
    },
  );
  app.post('/api/events/:eventId/import', { preHandler: admin }, async (req) => {
    const { eventId } = params(req);
    event(eventId);
    const file = await req.file();
    if (!file) throw new HttpError(400, 'Choose a CSV or Excel file');
    const buffer = await file.toBuffer();
    let result;
    try {
      result = await importParticipants(db, eventId, buffer, file.filename);
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : 'Invalid file');
    }
    audit(db, req.adminId!, 'participants.import', eventId, result);
    return result;
  });
  app.get('/api/events/:eventId/participants/:id/qr', { preHandler: admin }, async (req, reply) => {
    const { eventId, id } = params(req);
    const p = participant(eventId, id);
    return reply
      .header('Cache-Control', 'no-store')
      .type('image/png')
      .send(
        await QRCode.toBuffer(qrPayload(config.qrSecret, eventId, id, p.token_nonce), {
          width: 420,
          margin: 2,
        }),
      );
  });
  app.get('/api/events/:eventId/participants/:id/pass', { preHandler: admin }, async (req) => {
    const { eventId, id } = params(req);
    const p = participant(eventId, id);
    return { payload: qrPayload(config.qrSecret, eventId, id, p.token_nonce) };
  });
  app.get('/api/events/:eventId/participants/:id/journey', { preHandler: admin }, async (req) => {
    const { eventId, id } = params(req);
    participant(eventId, id);
    return {
      scans: db
        .prepare(
          'SELECT s.*,c.undone_at,c.undo_reason,c.undone_by,g.name AS gate_name,d.name AS device_name FROM scans s JOIN gates g ON g.id=s.gate_id LEFT JOIN devices d ON d.id=s.device_id LEFT JOIN collections c ON c.scan_id=s.id WHERE s.participant_id=? ORDER BY s.created_at DESC LIMIT 500',
        )
        .all(id),
      collections: db
        .prepare(
          'SELECT c.*,g.name AS gate_name FROM collections c JOIN gates g ON g.id=c.gate_id WHERE participant_id=? ORDER BY c.created_at DESC',
        )
        .all(id),
    };
  });
}
