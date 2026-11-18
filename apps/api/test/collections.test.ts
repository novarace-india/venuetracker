import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import ExcelJS from 'exceljs';
import { openDatabase, now, type ParticipantRow } from '../src/db.js';
import { bootstrapAdmin, buildApp } from '../src/app.js';
import { collectionManagement, resetCollections, undoCollection } from '../src/collections.js';
import { processScan } from '../src/scans.js';
import { qrPayload } from '../src/security.js';
import { loadSnapshot } from '../src/analytics/snapshot.js';
import { aggregate } from '../src/analytics/aggregate.js';
import { excelReport } from '../src/analytics/excel.js';
import { analyticsFilterSchema } from '@gatecheck/shared';

function fixture(max = 1) {
  const db = openDatabase(':memory:');
  bootstrapAdmin(db, 'admin@example.com', 'secure-test-password');
  const actor = (db.prepare('SELECT id FROM admins').get() as { id: string }).id;
  const event = randomUUID(),
    gate = randomUUID(),
    next = randomUUID(),
    pid = randomUUID(),
    secret = 'q'.repeat(40),
    nonce = randomUUID();
  db.prepare('INSERT INTO events VALUES (?,?,?,?,?,?,?)').run(
    event,
    'Reset Test',
    'Asia/Kolkata',
    null,
    'Pass',
    'Hello',
    now(),
  );
  for (const [id, name] of [
    [gate, 'Medal'],
    [next, 'Goodies'],
  ])
    db.prepare('INSERT INTO gates VALUES (?,?,?,?,?)').run(id, event, name, max, now());
  db.prepare('INSERT INTO gate_dependencies VALUES (?,?)').run(next, gate);
  db.prepare('INSERT INTO participants VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(
    pid,
    event,
    'runner@example.com',
    'Runner',
    '',
    'General',
    '',
    '{}',
    1,
    nonce,
    now(),
  );
  const payload = qrPayload(secret, event, pid, nonce);
  const state = () => collectionManagement(db, event, pid).gates.find((g) => g.id === gate)!;
  const scan = (revision?: number, gid = gate) => {
    const input = {
      operationId: randomUUID(),
      payload,
      manual: false,
      ...(revision === undefined ? {} : { collectionRevision: revision }),
    };
    return {
      input,
      result: processScan(db, secret, { eventId: event, gateId: gid, actorId: actor }, input),
    };
  };
  const reset = (mode: 'one' | 'all' = 'all', acknowledgeImpacts = false) => {
    const g = state();
    const input = {
      operationId: randomUUID(),
      mode,
      collectionId: mode === 'one' ? g.activeCollections[0].id : undefined,
      expectedState: g.stateToken,
      reason: 'Medal handed out by mistake',
      acknowledgeImpacts,
    };
    return { input, result: resetCollections(db, event, pid, gate, actor, input) };
  };
  return { db, actor, event, gate, next, pid, secret, payload, state, scan, reset };
}
test('reset allows the same QR again, rejects old offline captures and annotates immutable replays', () => {
  const f = fixture();
  try {
    const first = f.scan(),
      duplicate = f.scan();
    assert.equal(first.result.status, 'success');
    assert.equal(duplicate.result.status, 'already');
    const reset = f.reset();
    assert.equal(reset.result.revision, 1);
    assert.equal(f.state().activeCount, 0);
    const conflict = f.scan();
    assert.equal(conflict.result.code, 'COLLECTION_RESET');
    assert.equal(f.state().activeCount, 0);
    const ctx = { eventId: f.event, gateId: f.gate, actorId: f.actor };
    assert.equal(processScan(f.db, f.secret, ctx, first.input).code, 'COLLECTION_REVERSED');
    assert.equal(processScan(f.db, f.secret, ctx, duplicate.input).code, 'COLLECTION_RESET');
    assert.equal((f.db.prepare('SELECT count(*) AS n FROM scans').get() as { n: number }).n, 3);
    assert.equal(f.scan(1).result.status, 'success');
    assert.equal(f.scan(1).result.status, 'already');
    // A lost reset response retried after a fresh delivery must not undo that new delivery.
    assert.deepEqual(
      resetCollections(f.db, f.event, f.pid, f.gate, f.actor, reset.input),
      reset.result,
    );
    assert.equal(f.state().activeCount, 1);
    assert.throws(
      () =>
        resetCollections(f.db, f.event, f.pid, f.gate, f.actor, {
          ...reset.input,
          reason: 'Changed reason',
        }),
      /already belongs/,
    );
    assert.equal(
      JSON.parse(
        (
          f.db
            .prepare('SELECT result_json FROM scans WHERE operation_id=?')
            .get(first.input.operationId) as { result_json: string }
        ).result_json,
      ).status,
      'success',
    );
    const history = collectionManagement(f.db, f.event, f.pid).history;
    assert.equal(history[0].actorEmail, 'admin@example.com');
    assert.equal(history[0].reason, reset.input.reason);
    const report = aggregate(loadSnapshot(f.db, f.event), analyticsFilterSchema.parse({}));
    assert.equal(report.summary.collections, 1);
    assert.equal(report.summary.undos, 1);
    assert.equal(
      report.scans.find((s) => s.operationId === first.input.operationId)?.resetId,
      reset.input.operationId,
    );
  } finally {
    f.db.close();
  }
});
test('one/all resets, stale snapshots, impact acknowledgement, deactivation, and gate order', () => {
  const f = fixture(3);
  try {
    f.scan();
    f.scan();
    let state = f.state();
    assert.equal(state.activeCount, 2);
    const stale = {
      operationId: randomUUID(),
      mode: 'all' as const,
      expectedState: state.stateToken,
      reason: 'Correct counter',
      acknowledgeImpacts: false,
    };
    f.scan();
    assert.throws(
      () => resetCollections(f.db, f.event, f.pid, f.gate, f.actor, stale),
      /state changed/,
    );
    assert.equal(f.state().activeCount, 3);
    f.reset('one');
    assert.equal(f.state().activeCount, 2);
    assert.equal(f.state().remaining, 1);
    assert.equal(f.scan(0).result.code, 'COLLECTION_RESET');
    assert.equal(f.scan(1, f.next).result.code, 'COLLECTION_RESET'); // revisions are per gate
    assert.equal(f.scan(0, f.next).result.status, 'success');
    assert.throws(() => f.reset(), /Acknowledge/);
    f.reset('all', true);
    assert.equal(f.state().activeCount, 0);
    assert.equal(
      collectionManagement(f.db, f.event, f.pid).gates.find((g) => g.id === f.next)?.activeCount,
      1,
    );
    assert.match(f.scan(0, f.next).result.message, /Visit Medal/);
    assert.equal(f.scan(2).result.status, 'success');
    f.db.prepare('INSERT INTO analytics_settings VALUES (?,?,?)').run(f.event, f.gate, now());
    assert.throws(() => f.reset(), /Acknowledge/);
    f.reset('all', true);
    f.db.prepare('UPDATE participants SET active=0 WHERE id=?').run(f.pid);
    assert.match(f.scan(3).result.message, /deactivated/);
  } finally {
    f.db.close();
  }
});
test('legacy undo advances the revision and a fixed ID cannot undo a new collection', () => {
  const f = fixture();
  try {
    f.scan();
    const id = f.state().activeCollections[0].id;
    undoCollection(f.db, id, f.actor, 'Wrong handout');
    assert.equal(f.state().revision, 1);
    assert.equal(f.scan().result.code, 'COLLECTION_RESET');
    assert.equal(f.scan(1).result.status, 'success');
    assert.throws(() => undoCollection(f.db, id, f.actor, 'Retry undo'), /already undone/);
    assert.equal(f.state().activeCount, 1);
  } finally {
    f.db.close();
  }
});
test('management APIs require admin, validate reasons/event ownership and expose device revisions', async () => {
  const f = fixture();
  const { app } = await buildApp(
    {
      databasePath: ':memory:',
      qrSecret: f.secret,
      encryptionKey: 'e'.repeat(40),
      origin: 'http://localhost:5173',
      production: false,
      webRoot: '/nonexistent',
    },
    { db: f.db, worker: false },
  );
  try {
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'admin@example.com', password: 'secure-test-password' },
    });
    const headers = { cookie: `gc_session=${login.cookies[0].value}` };
    const base = `/api/events/${f.event}/participants/${f.pid}`;
    const url = base + `/gates/${f.gate}/reset`;
    f.scan();
    const state = f.state();
    const payload = {
      operationId: randomUUID(),
      mode: 'all',
      expectedState: state.stateToken,
      reason: 'Correct medal',
      acknowledgeImpacts: false,
    };
    assert.equal((await app.inject({ method: 'POST', url, payload })).statusCode, 401);
    assert.equal(
      (await app.inject({ method: 'POST', url, payload: { ...payload, reason: ' ' }, headers }))
        .statusCode,
      400,
    );
    assert.equal(
      (
        await app.inject({
          method: 'GET',
          url: base.replace(f.event, randomUUID()) + '/collections',
          headers,
        })
      ).statusCode,
      404,
    );
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: base + `/gates/${randomUUID()}/reset`,
          payload,
          headers,
        })
      ).statusCode,
      404,
    );
    const code = (
      await app.inject({
        method: 'POST',
        url: `/api/events/${f.event}/pairing`,
        payload: { gateId: f.gate },
        headers,
      })
    ).json().code;
    const device = (
      await app.inject({
        method: 'POST',
        url: '/api/device/pair',
        payload: { code, name: 'Tablet' },
      })
    ).json();
    const deviceHeaders = { authorization: `Bearer ${device.token}` };
    assert.equal(
      (await app.inject({ method: 'POST', url, payload, headers: deviceHeaders })).statusCode,
      401,
    );
    const results = await Promise.all([
      app.inject({ method: 'POST', url, payload, headers }),
      app.inject({
        method: 'POST',
        url,
        payload: { ...payload, operationId: randomUUID() },
        headers,
      }),
    ]);
    assert.deepEqual(results.map((r) => r.statusCode).sort(), [200, 409]);
    assert.equal(
      (await app.inject({ method: 'GET', url: '/api/device/me', headers: deviceHeaders })).json()
        .collectionRevisions[f.pid],
      1,
    );
    const csv = await app.inject({
      method: 'GET',
      url: `/api/events/${f.event}/export/scans`,
      headers,
    });
    assert.match(csv.body, /undo_admin/);
    assert.match(csv.body, /admin@example.com/);
    const report = aggregate(loadSnapshot(f.db, f.event), analyticsFilterSchema.parse({}));
    const book = new ExcelJS.Workbook();
    await book.xlsx.load((await excelReport(report)) as never);
    assert.ok(book.getWorksheet('Journey audit')?.getRow(3).values.includes('Reset batch ID'));
  } finally {
    await app.close();
    f.db.close();
  }
});
test('migration protects queued scans following historical undo', () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = OFF');
  try {
    for (const name of ['001_initial.sql', '002_analytics.sql'])
      db.exec(readFileSync(new URL('../migrations/' + name, import.meta.url), 'utf8'));
    // Foreign keys disabled in this isolated migration fixture to focus on existing collection rows.
    db.prepare('INSERT INTO collections VALUES (?,?,?,?,?,?,?,?)').run(
      randomUUID(),
      randomUUID(),
      'participant',
      'gate',
      now(),
      now(),
      'admin',
      'Legacy undo',
    );
    db.exec(
      readFileSync(new URL('../migrations/003_collection_resets.sql', import.meta.url), 'utf8'),
    );
    assert.equal(
      (db.prepare('SELECT revision FROM participant_gate_revisions').get() as { revision: number })
        .revision,
      1,
    );
  } finally {
    db.close();
  }
});
