import { randomUUID } from 'node:crypto';
import { openDatabase, type DB } from '../src/db.js';
import { loadSnapshot } from '../src/analytics/snapshot.js';
import { analyticsFilterSchema } from '@gatecheck/shared';
export function analyticsFixture(db: DB = openDatabase(':memory:')) {
  const eventId = randomUUID();
  const gates = { reception: randomUUID(), kit: randomUUID(), meal: randomUUID() };
  const people = {
    alex: randomUUID(),
    blair: randomUUID(),
    casey: randomUUID(),
    dev: randomUUID(),
    erin: randomUUID(),
  };
  const creation = '2026-11-01T00:00:00.000Z';
  db.prepare('INSERT INTO events VALUES (?,?,?,?,?,?,?)').run(
    eventId,
    'Analytics Summit',
    'Asia/Kolkata',
    null,
    'Pass',
    'Hello',
    creation,
  );
  const devices: Record<string, string> = {};
  for (const [key, id] of Object.entries(gates)) {
    db.prepare('INSERT INTO gates VALUES (?,?,?,?,?)').run(
      id,
      eventId,
      key === 'reception' ? 'Reception' : key === 'kit' ? 'Kit Collection' : 'Meal',
      1,
      creation,
    );
    devices[id] = randomUUID();
    db.prepare(
      'INSERT INTO devices(id,event_id,gate_id,name,token_hash,last_seen,created_at) VALUES (?,?,?,?,?,?,?)',
    ).run(
      devices[id],
      eventId,
      id,
      `${key} tablet`,
      randomUUID(),
      '2026-11-18T05:30:00.000Z',
      creation,
    );
  }
  db.prepare('INSERT INTO gate_dependencies VALUES (?,?)').run(gates.kit, gates.reception);
  db.prepare('INSERT INTO analytics_settings VALUES (?,?,?)').run(
    eventId,
    gates.reception,
    creation,
  );
  db.prepare('INSERT INTO analytics_gate_targets VALUES (?,?)').run(gates.kit, 50);
  db.prepare('INSERT INTO analytics_gate_targets VALUES (?,?)').run(gates.meal, 50);
  for (const [key, id] of Object.entries(people)) {
    db.prepare('INSERT INTO participants VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(
      id,
      eventId,
      `${key}@example.com`,
      key[0].toUpperCase() + key.slice(1) + ' Guest',
      '',
      key === 'alex' || key === 'casey' ? 'VIP' : 'General',
      key === 'casey' ? 'Studio' : key === 'dev' ? '' : 'Acme',
      '{}',
      key === 'dev' ? 0 : 1,
      randomUUID(),
      creation,
    );
  }
  const ids: Record<string, string> = {};
  function add(
    key: string,
    person: string | null,
    gate: string,
    time: string,
    status: 'success' | 'already' | 'denied' = 'success',
    options: { manual?: boolean; undone?: boolean; message?: string; capture?: string | null } = {},
  ) {
    const id = randomUUID();
    const timestamp = `2026-11-18T${time}:00.000Z`;
    const capture =
      options.capture === undefined
        ? new Date(Date.parse(timestamp) - 2000).toISOString()
        : options.capture;
    const message =
      options.message ??
      (status === 'success'
        ? 'Collection recorded'
        : status === 'already'
          ? 'Already collected'
          : 'Visit Reception first');
    const result = JSON.stringify({ status, message, timestamp, operationId: id });
    db.prepare('INSERT INTO scans VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
      id,
      id,
      eventId,
      gate,
      person,
      devices[gate],
      null,
      id,
      status,
      message,
      Number(options.manual ?? false),
      options.manual ? 'Approved exception' : null,
      capture,
      timestamp,
      result,
    );
    if (status === 'success')
      db.prepare(
        'INSERT INTO collections(id,scan_id,participant_id,gate_id,created_at,undone_at,undone_by,undo_reason) VALUES (?,?,?,?,?,?,?,?)',
      ).run(
        randomUUID(),
        id,
        person,
        gate,
        timestamp,
        options.undone ? '2026-11-18T05:45:00.000Z' : null,
        options.undone ? 'test-admin' : null,
        options.undone ? 'Correction' : null,
      );
    ids[key] = id;
  }
  add('aEntrance', people.alex, gates.reception, '03:30');
  add('aKit', people.alex, gates.kit, '03:45', 'success', { capture: '2026-11-18T03:35:00.000Z' });
  add('aDuplicate', people.alex, gates.kit, '03:46', 'already');
  add('aMeal', people.alex, gates.meal, '04:00');
  add('aOverrideUndone', people.alex, gates.meal, '04:01', 'success', {
    manual: true,
    undone: true,
  });
  add('bDenied', people.blair, gates.meal, '03:35', 'denied');
  add('bOverride', people.blair, gates.kit, '03:40', 'success', { manual: true });
  add('bEntrance', people.blair, gates.reception, '04:10');
  add('cUndone', people.casey, gates.reception, '04:30', 'success', { undone: true });
  add('cEntrance', people.casey, gates.reception, '04:45');
  add('cKitTied', people.casey, gates.kit, '04:45');
  add('dEntrance', people.dev, gates.reception, '05:00');
  add('unknown', null, gates.reception, '05:15', 'denied', {
    message: 'Invalid QR signature',
    capture: '2030-01-01T00:00:00.000Z',
  });
  return {
    db,
    eventId,
    gates,
    people,
    ids,
    filters: analyticsFilterSchema.parse({
      route: [gates.reception, gates.kit, gates.meal].join(','),
    }),
    snapshot: () => loadSnapshot(db, eventId),
  };
}
