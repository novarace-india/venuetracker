import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildApp, bootstrapAdmin } from '../src/app.js';
import { openDatabase } from '../src/db.js';
import { importParticipants } from '../src/participants.js';
import { queueEmails } from '../src/email.js';
import { encrypt, decrypt } from '../src/security.js';
const config = {
  databasePath: ':memory:',
  qrSecret: 'q'.repeat(40),
  encryptionKey: 'e'.repeat(40),
  origin: 'http://localhost:5173',
  production: false,
  webRoot: '/nonexistent',
};
test('Phase 1 API and transactional gate rules', async () => {
  const db = openDatabase(':memory:');
  const { app } = await buildApp(config, { db, worker: false });
  bootstrapAdmin(db, 'admin@example.com', 'secure-test-password');
  const call = async (method: string, url: string, payload?: unknown, cookie?: string) => {
    const r = await app.inject({
      method: method as 'GET',
      url,
      payload: payload as never,
      headers: cookie ? { cookie } : undefined,
    });
    let body;
    try {
      body = r.json();
    } catch {
      body = r.body;
    }
    return { status: r.statusCode, body, raw: r };
  };
  try {
    assert.equal((await call('GET', '/api/events')).status, 401);
    assert.equal(
      (await call('POST', '/api/auth/login', { email: 'admin@example.com', password: 'bad' }))
        .status,
      401,
    );
    const login = await call('POST', '/api/auth/login', {
      email: 'admin@example.com',
      password: 'secure-test-password',
    });
    const session = login.raw.cookies[0].value;
    const cookie = `gc_session=${session}`;
    const request = (method: string, url: string, payload?: unknown) =>
      call(method, url, payload, cookie);
    const e = await request('POST', '/api/events', { name: 'Test', timezone: 'Asia/Kolkata' });
    assert.equal(e.status, 201);
    const event = e.body.id;
    const other = (await request('POST', '/api/events', { name: 'Other', timezone: 'UTC' })).body
      .id;
    const gate = (
      await request('POST', `/api/events/${event}/gates`, { name: 'Reception', maxCollections: 1 })
    ).body.id;
    const kit = (
      await request('POST', `/api/events/${event}/gates`, {
        name: 'Kit',
        maxCollections: 1,
        requires: [gate],
      })
    ).body.id;
    assert.equal(
      (
        await request('PUT', `/api/events/${event}/gates/${gate}`, {
          name: 'Reception',
          maxCollections: 1,
          requires: [kit],
        })
      ).status,
      400,
    );
    const p = await request('POST', `/api/events/${event}/participants`, {
      email: 'A@example.com',
      fullName: 'Alex',
    });
    assert.equal(p.status, 201);
    assert.equal(p.body.email, 'a@example.com');
    assert.equal(p.body.token_nonce, undefined);
    const pid = p.body.id;
    assert.equal(
      (
        await request('POST', `/api/events/${event}/participants`, {
          email: 'a@example.com',
          fullName: 'Again',
        })
      ).status,
      409,
    );
    const imported = await importParticipants(
      db,
      event,
      Buffer.from(
        'Email,Full Name,Company\na@example.com,Duplicate,A\nb@example.com,Blair,B\nbad,Invalid,C\n',
      ),
      'p.csv',
    );
    assert.equal(imported.imported, 1);
    assert.equal(imported.rejected, 2);
    const payload = (await request('GET', `/api/events/${event}/participants/${pid}/pass`)).body
      .payload;
    assert.equal(
      (await request('GET', `/api/events/${event}/participants/${pid}/qr`)).raw.headers[
        'content-type'
      ],
      'image/png',
    );
    const scan = (gateId: string, data: object) =>
      request('POST', `/api/events/${event}/gates/${gateId}/scans`, data);
    assert.equal(
      (await scan(gate, { operationId: randomUUID(), payload: payload + 'x' })).body.status,
      'denied',
    );
    assert.match(
      (await scan(kit, { operationId: randomUUID(), payload })).body.message,
      /Visit Reception/,
    );
    const op = randomUUID(),
      input = { operationId: op, payload };
    const success = await scan(gate, input);
    assert.equal(success.body.status, 'success');
    assert.deepEqual((await scan(gate, input)).body, success.body);
    assert.equal((await scan(gate, { ...input, payload: 'changed' })).status, 409);
    assert.equal((await scan(gate, { operationId: randomUUID(), payload })).body.status, 'already');
    assert.equal((await scan(kit, { operationId: randomUUID(), payload })).body.status, 'success');
    const otherGate = (
      await request('POST', `/api/events/${other}/gates`, { name: 'Other gate', maxCollections: 1 })
    ).body.id;
    assert.match(
      (
        await request('POST', `/api/events/${other}/gates/${otherGate}/scans`, {
          operationId: randomUUID(),
          payload,
        })
      ).body.message,
      /different event/,
    );
    assert.equal(
      (await scan(gate, { operationId: randomUUID(), manual: true, participantId: pid })).status,
      400,
    );
    assert.equal(
      (
        await scan(gate, {
          operationId: randomUUID(),
          manual: true,
          participantId: pid,
          reason: 'Broken phone',
        })
      ).body.status,
      'success',
    );
    const concurrentParticipant = (
      await request('POST', `/api/events/${event}/participants`, {
        email: 'concurrent@example.com',
        fullName: 'Concurrent Guest',
      })
    ).body;
    const concurrentPass = (
      await request('GET', `/api/events/${event}/participants/${concurrentParticipant.id}/pass`)
    ).body.payload;
    const simultaneous = await Promise.all(
      Array.from({ length: 6 }, () =>
        scan(gate, { operationId: randomUUID(), payload: concurrentPass }),
      ),
    );
    assert.equal(simultaneous.filter((r) => r.body.status === 'success').length, 1);
    assert.equal(simultaneous.filter((r) => r.body.status === 'already').length, 5);
    await request('DELETE', `/api/events/${event}/participants/${concurrentParticipant.id}`);
    await request('PUT', `/api/events/${event}/participants/${pid}`, {
      email: 'a@example.com',
      fullName: 'Alex',
      active: false,
    });
    assert.match(
      (await scan(gate, { operationId: randomUUID(), payload })).body.message,
      /deactivated/,
    );
    assert.match(
      (
        await scan(gate, {
          operationId: randomUUID(),
          manual: true,
          participantId: pid,
          reason: 'Broken phone',
        })
      ).body.message,
      /deactivated/,
    );
    const journey = (await request('GET', `/api/events/${event}/participants/${pid}/journey`)).body;
    const collection = journey.collections[0].id;
    assert.equal(
      (await request('POST', `/api/collections/${collection}/undo`, { reason: 'Operator mistake' }))
        .status,
      200,
    );
    assert.equal(
      (await request('POST', `/api/collections/${collection}/undo`, { reason: 'Again' })).status,
      409,
    );
    const pair = (await request('POST', `/api/events/${event}/pairing`, { gateId: gate })).body;
    const paired = await call('POST', '/api/device/pair', { code: pair.code, name: 'Tablet 1' });
    assert.equal(paired.status, 200);
    assert.equal(
      (await call('POST', '/api/device/pair', { code: pair.code, name: 'Tablet 2' })).status,
      400,
    );
    const auth = { authorization: `Bearer ${paired.body.token}` };
    assert.equal(
      (await app.inject({ method: 'GET', url: '/api/device/me', headers: auth })).statusCode,
      200,
    );
    const parallel = await Promise.all(
      Array.from({ length: 4 }, () =>
        app.inject({
          method: 'POST',
          url: '/api/device/scans',
          headers: auth,
          payload: { operationId: randomUUID(), payload },
        }),
      ),
    );
    assert.ok(parallel.every((r) => r.json().status === 'denied'));
    await request('POST', `/api/devices/${paired.body.id}/revoke`, {});
    assert.equal(
      (await app.inject({ method: 'GET', url: '/api/device/me', headers: auth })).statusCode,
      401,
    );
    assert.equal(queueEmails(db, event), 1);
    assert.equal(queueEmails(db, event), 0);
    const smtp = await request('PUT', '/api/settings/smtp', {
      host: 'smtp.zeptomail.in',
      port: 587,
      secure: false,
      username: 'emailapikey',
      password: 'secret',
      fromAddress: 'events@example.com',
    });
    assert.equal(smtp.status, 200);
    assert.equal((await request('GET', '/api/settings/smtp')).body.password_encrypted, undefined);
    const cross = await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: { cookie, origin: 'https://evil.example' },
      payload: { name: 'bad', timezone: 'UTC' },
    });
    assert.equal(cross.statusCode, 403);
    assert.equal(
      (await request('GET', `/api/events/${event}/export/scans`)).raw.headers['content-type'],
      'text/csv; charset=utf-8',
    );
    assert.equal(decrypt(config.encryptionKey, encrypt(config.encryptionKey, 'secret')), 'secret');
  } finally {
    await app.close();
    db.close();
  }
});
