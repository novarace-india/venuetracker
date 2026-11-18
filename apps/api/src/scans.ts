import { HttpError } from './errors.js';
export { HttpError } from './errors.js';
import { collectionRevision } from './collections.js';
import { randomUUID } from 'node:crypto';
import type { ScanInput, ScanResult } from '@gatecheck/shared';
import { type DB, type ParticipantRow, type GateRow, now } from './db.js';
import { hash, verifyQr } from './security.js';
export interface ScanContext {
  eventId: string;
  gateId: string;
  deviceId?: string;
  actorId?: string;
}
export function processScan(
  db: DB,
  secret: string,
  context: ScanContext,
  input: ScanInput,
): ScanResult {
  // The IMMEDIATE transaction serializes validation and collection creation across gates/devices.
  return db
    .transaction((): ScanResult => {
      const fingerprint = hash(JSON.stringify({ context, input }));
      const prior = db
        .prepare(
          'SELECT id,participant_id,gate_id,request_hash,result_json FROM scans WHERE operation_id=?',
        )
        .get(input.operationId) as
        | {
            id: string;
            participant_id: string | null;
            gate_id: string;
            request_hash: string;
            result_json: string;
          }
        | undefined;
      if (prior) {
        if (prior.request_hash !== fingerprint)
          throw new HttpError(409, 'Operation ID already belongs to another scan');
        const original = JSON.parse(prior.result_json) as ScanResult;
        const revision = prior.participant_id
          ? collectionRevision(db, prior.participant_id, prior.gate_id)
          : undefined;
        const reversed = db
          .prepare('SELECT undone_at FROM collections WHERE scan_id=? AND undone_at IS NOT NULL')
          .get(prior.id) as { undone_at: string } | undefined;
        // Preserve the immutable attempt, but never show a reversed delivery as current approval.
        if (reversed)
          return {
            ...original,
            status: 'denied',
            code: 'COLLECTION_REVERSED',
            collectionRevision: revision?.revision ?? 0,
            resetAt: reversed.undone_at,
            message:
              'This earlier collection was undone by an admin. Scan the QR again to record a fresh collection.',
          };
        if (
          original.status !== 'success' &&
          (revision?.revision ?? 0) > (original.collectionRevision ?? 0)
        )
          return {
            ...original,
            status: 'denied',
            code: 'COLLECTION_RESET',
            collectionRevision: revision!.revision,
            resetAt: revision!.reset_at,
            message:
              'This earlier attempt predates an admin reset. Scan the QR again using the updated counter state.',
          };
        return original;
      }
      const gate = db
        .prepare('SELECT * FROM gates WHERE id=? AND event_id=?')
        .get(context.gateId, context.eventId) as GateRow | undefined;
      if (!gate) throw new HttpError(404, 'Gate not found');
      let participant: ParticipantRow | undefined, denial: string | undefined;
      if (input.manual) {
        if (!input.reason || input.reason.length < 3)
          throw new HttpError(400, 'Manual overrides require a reason of at least 3 characters');
        if (!input.participantId)
          throw new HttpError(400, 'Select a participant for manual override');
        participant = db
          .prepare('SELECT * FROM participants WHERE id=?')
          .get(input.participantId) as ParticipantRow | undefined;
      } else {
        const verified = verifyQr(secret, input.payload ?? '');
        if (!verified) denial = 'Invalid QR signature';
        else if (verified.eventId !== context.eventId) denial = 'QR belongs to a different event';
        else {
          participant = db
            .prepare('SELECT * FROM participants WHERE id=? AND token_nonce=?')
            .get(verified.participantId, verified.nonce) as ParticipantRow | undefined;
        }
      }
      if (!denial && !participant) denial = 'Participant not found or QR revoked';
      if (participant && participant.event_id !== context.eventId) {
        participant = undefined;
        denial = 'Participant belongs to a different event';
      }
      if (participant && !participant.active) denial = 'Participant is deactivated';
      const revision = participant ? collectionRevision(db, participant.id, gate.id) : undefined;
      const revisionConflict =
        !denial && participant && (input.collectionRevision ?? 0) !== (revision?.revision ?? 0);
      if (revisionConflict)
        denial =
          'Collection state was reset by an admin. Counter state has been refreshed; scan the QR again.';
      const timestamp = now();
      let result: ScanResult = {
        status: 'denied',
        message: denial ?? '',
        timestamp,
        operationId: input.operationId,
      };
      if (participant) result.participant = { id: participant.id, fullName: participant.full_name };
      if (participant) result.collectionRevision = revision?.revision ?? 0;
      if (revisionConflict) {
        result.code = 'COLLECTION_RESET';
        if (revision) result.resetAt = revision.reset_at;
      }
      if (!denial && participant) {
        const previous = db
          .prepare(
            'SELECT created_at FROM collections WHERE participant_id=? AND gate_id=? AND undone_at IS NULL ORDER BY created_at DESC',
          )
          .all(participant.id, gate.id) as { created_at: string }[];
        // Overrides bypass sequence and collection limits, but never event identity or deactivation.
        if (previous.length >= gate.max_collections && !input.manual)
          result = {
            ...result,
            status: 'already',
            message: 'Already collected',
            previousTimestamp: previous[0].created_at,
          };
        else {
          const missing = db
            .prepare(
              `SELECT g.name FROM gate_dependencies d JOIN gates g ON g.id=d.requires_id WHERE d.gate_id=? AND NOT EXISTS (SELECT 1 FROM collections c WHERE c.participant_id=? AND c.gate_id=d.requires_id AND c.undone_at IS NULL)`,
            )
            .all(gate.id, participant.id) as { name: string }[];
          if (missing.length && !input.manual)
            result.message = `Visit ${missing.map((g) => g.name).join(', ')} first`;
          else
            result = {
              ...result,
              status: 'success',
              message: input.manual ? 'Manual collection recorded' : 'Collection recorded',
            };
        }
      }
      const scanId = randomUUID();
      db.prepare('INSERT INTO scans VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
        scanId,
        input.operationId,
        context.eventId,
        gate.id,
        participant?.id ?? null,
        context.deviceId ?? null,
        context.actorId ?? null,
        fingerprint,
        result.status,
        result.message,
        Number(input.manual),
        input.reason ?? null,
        input.clientTime ?? null,
        timestamp,
        JSON.stringify(result),
      );
      if (result.status === 'success' && participant)
        db.prepare(
          'INSERT INTO collections(id,scan_id,participant_id,gate_id,created_at) VALUES (?,?,?,?,?)',
        ).run(randomUUID(), scanId, participant.id, gate.id, timestamp);
      return result;
    })
    .immediate();
}
