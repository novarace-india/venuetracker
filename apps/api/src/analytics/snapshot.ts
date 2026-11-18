import type { AnalyticsGate, AnalyticsScan, AnalyticsVisit } from '@gatecheck/shared';
import { type DB, now } from '../db.js';
import { HttpError } from '../scans.js';
export interface Person {
  id: string;
  full_name: string;
  email: string;
  ticket_type: string;
  company: string;
  active: number;
}
export interface Snapshot {
  event: { id: string; name: string; timezone: string };
  generatedAt: string;
  entranceGateId: string | null;
  gates: AnalyticsGate[];
  people: Person[];
  records: (AnalyticsScan & { collectionId: string | null })[];
  devices: {
    id: string;
    name: string;
    gate_id: string;
    revoked: number;
    last_seen: string | null;
  }[];
}
export function loadSnapshot(db: DB, eventId: string): Snapshot {
  return db.transaction(() => {
    const event = db.prepare('SELECT id,name,timezone FROM events WHERE id=?').get(eventId) as
      Snapshot['event'] | undefined;
    if (!event) throw new HttpError(404, 'Event not found');
    const settings = db
      .prepare('SELECT entrance_gate_id FROM analytics_settings WHERE event_id=?')
      .get(eventId) as { entrance_gate_id: string | null } | undefined;
    const dependencies = db
      .prepare(
        'SELECT d.gate_id,d.requires_id FROM gate_dependencies d JOIN gates g ON g.id=d.gate_id WHERE g.event_id=?',
      )
      .all(eventId) as { gate_id: string; requires_id: string }[];
    const gates = (
      db
        .prepare(
          'SELECT g.id,g.name,g.max_collections,t.target_percent FROM gates g LEFT JOIN analytics_gate_targets t ON t.gate_id=g.id WHERE g.event_id=? ORDER BY g.created_at,g.rowid',
        )
        .all(eventId) as {
        id: string;
        name: string;
        max_collections: number;
        target_percent: number | null;
      }[]
    ).map((g) => ({
      id: g.id,
      name: g.name,
      maxCollections: g.max_collections,
      targetPercent: g.target_percent,
      requires: dependencies.filter((d) => d.gate_id === g.id).map((d) => d.requires_id),
    }));
    const records = db
      .prepare(
        `SELECT s.id,s.operation_id AS operationId,s.participant_id AS participantId,s.gate_id AS gateId,s.device_id AS deviceId,s.actor_id AS actorId,s.created_at AS time,s.created_at AS serverTime,s.client_time AS captureTime,s.status,s.message,s.manual,s.reason,c.id AS collectionId,c.undone_at AS undoneAt,c.undo_reason AS undoReason,c.undone_by AS undoneBy,a.email AS undoActorEmail,i.reset_id AS resetId FROM scans s LEFT JOIN collections c ON c.scan_id=s.id LEFT JOIN admins a ON a.id=c.undone_by LEFT JOIN collection_reset_items i ON i.collection_id=c.id WHERE s.event_id=? ORDER BY s.created_at,s.rowid`,
      )
      .all(eventId) as (Omit<Snapshot['records'][number], 'manual'> & { manual: number })[];
    return {
      event,
      generatedAt: now(),
      entranceGateId: settings?.entrance_gate_id ?? null,
      gates,
      people: db
        .prepare(
          'SELECT id,full_name,email,ticket_type,company,active FROM participants WHERE event_id=? ORDER BY full_name,id',
        )
        .all(eventId) as Person[],
      records: records.map((r) => ({ ...r, manual: !!r.manual })),
      devices: db
        .prepare(
          'SELECT id,name,gate_id,revoked,last_seen FROM devices WHERE event_id=? ORDER BY created_at',
        )
        .all(eventId) as Snapshot['devices'],
    };
  })();
}
export function selectTime(
  record: Pick<AnalyticsScan, 'serverTime' | 'captureTime'>,
  basis: 'server' | 'capture',
) {
  const server = Date.parse(record.serverTime),
    capture = record.captureTime ? Date.parse(record.captureTime) : NaN;
  const plausible =
    Number.isFinite(capture) && capture <= server + 5 * 60000 && capture >= server - 30 * 86400000;
  return {
    time: new Date(basis === 'capture' && plausible ? capture : server).toISOString(),
    used: basis === 'capture' && plausible,
    fallback: basis === 'capture' && !plausible,
    delaySeconds: plausible ? Math.max(0, (server - capture) / 1000) : null,
  };
}
export function visitFromRecord(r: Snapshot['records'][number]): AnalyticsVisit {
  return {
    id: r.collectionId!,
    scanId: r.id,
    participantId: r.participantId!,
    gateId: r.gateId,
    time: r.time,
    serverTime: r.serverTime,
    captureTime: r.captureTime,
    manual: r.manual,
    deviceId: r.deviceId,
  };
}
