import { randomUUID } from 'node:crypto';
import type {
  CollectionManagement,
  CollectionResetHistory,
  CollectionResetInput,
  CollectionResetResult,
  ManagedGate,
} from '@gatecheck/shared';
import { type DB, type ParticipantRow, type GateRow, type EventRow, now, audit } from './db.js';
import { hash } from './security.js';
import { HttpError } from './errors.js';
export function collectionRevision(db: DB, participantId: string, gateId: string) {
  return db
    .prepare(
      'SELECT revision,reset_at FROM participant_gate_revisions WHERE participant_id=? AND gate_id=?',
    )
    .get(participantId, gateId) as { revision: number; reset_at: string } | undefined;
}
export function gateRevisions(db: DB, gateId: string) {
  return Object.fromEntries(
    (
      db
        .prepare('SELECT participant_id,revision FROM participant_gate_revisions WHERE gate_id=?')
        .all(gateId) as { participant_id: string; revision: number }[]
    ).map((r) => [r.participant_id, r.revision]),
  );
}
function participant(db: DB, eventId: string, id: string) {
  const p = db.prepare('SELECT * FROM participants WHERE id=? AND event_id=?').get(id, eventId) as
    ParticipantRow | undefined;
  if (!p) throw new HttpError(404, 'Participant not found in this event');
  return p;
}
function managedGate(
  db: DB,
  eventId: string,
  p: ParticipantRow,
  g: GateRow,
  entranceGateId: string | null,
): ManagedGate {
  const requires = db
    .prepare(
      'SELECT g.id,g.name FROM gate_dependencies d JOIN gates g ON g.id=d.requires_id WHERE d.gate_id=? ORDER BY g.id',
    )
    .all(g.id) as { id: string; name: string }[];
  const activeCollections = (
    db
      .prepare(
        'SELECT c.id,c.scan_id AS scanId,c.created_at AS createdAt,d.name AS deviceName,s.manual FROM collections c JOIN scans s ON s.id=c.scan_id LEFT JOIN devices d ON d.id=s.device_id WHERE c.participant_id=? AND c.gate_id=? AND c.undone_at IS NULL ORDER BY c.created_at DESC,c.rowid DESC',
      )
      .all(p.id, g.id) as {
      id: string;
      scanId: string;
      createdAt: string;
      deviceName: string | null;
      manual: number;
    }[]
  ).map((c) => ({ ...c, manual: !!c.manual }));
  const missingPrerequisites = requires
    .filter(
      (r) =>
        !db
          .prepare(
            'SELECT 1 FROM collections WHERE participant_id=? AND gate_id=? AND undone_at IS NULL LIMIT 1',
          )
          .get(p.id, r.id),
    )
    .map((r) => r.id);
  const completedDependents = db
    .prepare(
      `WITH RECURSIVE descendants(id) AS (SELECT gate_id FROM gate_dependencies WHERE requires_id=? UNION SELECT d.gate_id FROM gate_dependencies d JOIN descendants x ON d.requires_id=x.id) SELECT g.id,g.name,count(c.id) AS collections FROM descendants x JOIN gates g ON g.id=x.id JOIN collections c ON c.gate_id=g.id AND c.participant_id=? AND c.undone_at IS NULL WHERE g.event_id=? GROUP BY g.id ORDER BY g.id`,
    )
    .all(g.id, p.id, eventId) as { id: string; name: string; collections: number }[];
  const revision = collectionRevision(db, p.id, g.id);
  const state = {
    participantId: p.id,
    eventId,
    gateId: g.id,
    gateName: g.name,
    fullName: p.full_name,
    email: p.email,
    active: p.active,
    maxCollections: g.max_collections,
    requires,
    missingPrerequisites,
    activeIds: activeCollections.map((c) => c.id).sort(),
    revision: revision?.revision ?? 0,
    completedDependents,
    entrance: entranceGateId === g.id,
  };
  return {
    id: g.id,
    name: g.name,
    maxCollections: g.max_collections,
    requires,
    missingPrerequisites,
    activeCount: activeCollections.length,
    remaining: Math.max(0, g.max_collections - activeCollections.length),
    revision: revision?.revision ?? 0,
    lastResetAt: revision?.reset_at ?? null,
    stateToken: hash(JSON.stringify(state)),
    entrance: entranceGateId === g.id,
    activeCollections,
    completedDependents,
  };
}
function entrance(db: DB, eventId: string) {
  return (
    (
      db
        .prepare('SELECT entrance_gate_id FROM analytics_settings WHERE event_id=?')
        .get(eventId) as { entrance_gate_id: string | null } | undefined
    )?.entrance_gate_id ?? null
  );
}
export function collectionManagement(
  db: DB,
  eventId: string,
  participantId: string,
): CollectionManagement {
  return db.transaction(() => {
    const p = participant(db, eventId, participantId);
    const event = db
      .prepare('SELECT id,name,timezone FROM events WHERE id=?')
      .get(eventId) as EventRow;
    const gates = db
      .prepare('SELECT * FROM gates WHERE event_id=? ORDER BY created_at,rowid')
      .all(eventId) as GateRow[];
    const entranceId = entrance(db, eventId);
    const batches = db
      .prepare(
        'SELECT r.id,r.gate_id AS gateId,g.name AS gateName,r.mode,r.reason,r.actor_id AS actorId,a.email AS actorEmail,r.created_at AS createdAt,r.revision FROM collection_resets r JOIN gates g ON g.id=r.gate_id LEFT JOIN admins a ON a.id=r.actor_id WHERE r.event_id=? AND r.participant_id=? ORDER BY r.created_at DESC,r.rowid DESC LIMIT 100',
      )
      .all(eventId, p.id) as Omit<CollectionResetHistory, 'collectionIds' | 'count'>[];
    const history: CollectionResetHistory[] = batches.map((b) => {
      const ids = (
        db
          .prepare(
            'SELECT collection_id FROM collection_reset_items WHERE reset_id=? ORDER BY collection_id',
          )
          .all(b.id) as { collection_id: string }[]
      ).map((c) => c.collection_id);
      return { ...b, collectionIds: ids, count: ids.length };
    });
    const legacy = db
      .prepare(
        'SELECT c.id,c.gate_id AS gateId,g.name AS gateName,c.undo_reason AS reason,c.undone_by AS actorId,a.email AS actorEmail,c.undone_at AS createdAt FROM collections c JOIN gates g ON g.id=c.gate_id LEFT JOIN admins a ON a.id=c.undone_by WHERE c.participant_id=? AND c.undone_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM collection_reset_items i WHERE i.collection_id=c.id) ORDER BY c.undone_at DESC LIMIT 100',
      )
      .all(p.id) as {
      id: string;
      gateId: string;
      gateName: string;
      reason: string;
      actorId: string | null;
      actorEmail: string | null;
      createdAt: string;
    }[];
    history.push(
      ...legacy.map((c) => ({
        ...c,
        mode: 'legacy' as const,
        revision: null,
        collectionIds: [c.id],
        count: 1,
      })),
    );
    history.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return {
      participant: { id: p.id, fullName: p.full_name, email: p.email, active: !!p.active },
      event: { id: event.id, name: event.name, timezone: event.timezone },
      gates: gates.map((g) => managedGate(db, eventId, p, g, entranceId)),
      history: history.slice(0, 100),
      generatedAt: now(),
    };
  })();
}
export function resetCollections(
  db: DB,
  eventId: string,
  participantId: string,
  gateId: string,
  actorId: string,
  input: CollectionResetInput,
): CollectionResetResult {
  return db
    .transaction(() => {
      const fingerprint = hash(JSON.stringify({ eventId, participantId, gateId, actorId, input }));
      const prior = db
        .prepare('SELECT request_hash,result_json FROM collection_resets WHERE id=?')
        .get(input.operationId) as { request_hash: string; result_json: string } | undefined;
      if (prior) {
        if (prior.request_hash !== fingerprint)
          throw new HttpError(409, 'Reset operation ID already belongs to another request');
        return JSON.parse(prior.result_json) as CollectionResetResult;
      }
      const p = participant(db, eventId, participantId);
      const gate = db
        .prepare('SELECT * FROM gates WHERE id=? AND event_id=?')
        .get(gateId, eventId) as GateRow | undefined;
      if (!gate) throw new HttpError(404, 'Gate not found in this event');
      const state = managedGate(db, eventId, p, gate, entrance(db, eventId));
      if (state.stateToken !== input.expectedState)
        throw new HttpError(
          409,
          'Collection state changed. Refresh and review the current collections before confirming again.',
        );
      if (!state.activeCount)
        throw new HttpError(409, 'There are no active collections to reset at this counter');
      const selected =
        input.mode === 'all'
          ? state.activeCollections
          : state.activeCollections.filter((c) => c.id === input.collectionId);
      if (!selected.length)
        throw new HttpError(409, 'The selected collection is no longer active at this counter');
      const remaining = state.activeCount - selected.length;
      const dependencyImpact = remaining === 0 && state.completedDependents.length > 0;
      if ((dependencyImpact || state.entrance) && !input.acknowledgeImpacts)
        throw new HttpError(
          400,
          'Acknowledge the attendance or downstream collection impact before resetting',
        );
      const timestamp = now(),
        revision = state.revision + 1;
      const result: CollectionResetResult = {
        operationId: input.operationId,
        gateId,
        participantId,
        mode: input.mode,
        undoneCount: selected.length,
        collectionIds: selected.map((c) => c.id),
        remainingCollections: remaining,
        remainingAllowance: Math.max(0, gate.max_collections - remaining),
        revision,
        timestamp,
        message: `${selected.length} collection${selected.length === 1 ? '' : 's'} undone at ${gate.name}. A fresh QR scan can use the remaining allowance, subject to normal gate rules.`,
      };
      db.prepare('INSERT INTO collection_resets VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(
        input.operationId,
        eventId,
        participantId,
        gateId,
        input.mode,
        fingerprint,
        revision,
        actorId,
        input.reason,
        timestamp,
        JSON.stringify(result),
      );
      const undo = db.prepare(
        'UPDATE collections SET undone_at=?,undone_by=?,undo_reason=? WHERE id=? AND undone_at IS NULL',
      );
      const link = db.prepare('INSERT INTO collection_reset_items VALUES (?,?)');
      for (const c of selected) {
        if (undo.run(timestamp, actorId, input.reason, c.id).changes !== 1)
          throw new HttpError(409, 'Collection changed during reset; refresh and try again');
        link.run(input.operationId, c.id);
      }
      db.prepare(
        'INSERT INTO participant_gate_revisions VALUES (?,?,?,?) ON CONFLICT(participant_id,gate_id) DO UPDATE SET revision=excluded.revision,reset_at=excluded.reset_at',
      ).run(participantId, gateId, revision, timestamp);
      audit(db, actorId, 'collection.reset', input.operationId, {
        eventId,
        participantId,
        gateId,
        mode: input.mode,
        collectionIds: result.collectionIds,
        reason: input.reason,
        revision,
        remainingCollections: remaining,
        entrance: state.entrance,
        completedDependents: dependencyImpact ? state.completedDependents : [],
      });
      return result;
    })
    .immediate();
}
/** Compatibility route uses the same revision guard. A fixed collection ID never targets later scans. */
export function undoCollection(db: DB, id: string, actorId: string, reason: string) {
  return db
    .transaction(() => {
      const collection = db
        .prepare(
          'SELECT c.*,g.event_id FROM collections c JOIN gates g ON g.id=c.gate_id WHERE c.id=?',
        )
        .get(id) as
        | { participant_id: string; gate_id: string; event_id: string; undone_at: string | null }
        | undefined;
      if (!collection) throw new HttpError(404, 'Collection not found');
      if (collection.undone_at) throw new HttpError(409, 'Collection already undone');
      const state = collectionManagement(
        db,
        collection.event_id,
        collection.participant_id,
      ).gates.find((g) => g.id === collection.gate_id)!;
      return resetCollections(
        db,
        collection.event_id,
        collection.participant_id,
        collection.gate_id,
        actorId,
        {
          operationId: randomUUID(),
          mode: 'one',
          collectionId: id,
          expectedState: state.stateToken,
          reason,
          acknowledgeImpacts: true,
        },
      );
    })
    .immediate();
}
