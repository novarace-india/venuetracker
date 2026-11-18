import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { DB, EventRow, ParticipantRow } from '../db.js';
import type { Config } from '../config.js';
import { HttpError } from '../scans.js';
export interface RouteContext {
  app: FastifyInstance;
  db: DB;
  config: Config;
  admin: (req: FastifyRequest) => Promise<void>;
  device: (req: FastifyRequest) => Promise<void>;
}
export function helpers(db: DB) {
  const params = (req: FastifyRequest) => req.params as Record<string, string>;
  function event(id: string) {
    const row = db.prepare('SELECT * FROM events WHERE id=?').get(id) as EventRow | undefined;
    if (!row) throw new HttpError(404, 'Event not found');
    return row;
  }
  function participant(eventId: string, id: string) {
    const p = db
      .prepare('SELECT * FROM participants WHERE id=? AND event_id=?')
      .get(id, eventId) as ParticipantRow | undefined;
    if (!p) throw new HttpError(404, 'Participant not found');
    return p;
  }

  return { params, event, participant };
}
