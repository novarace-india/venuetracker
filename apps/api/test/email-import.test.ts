import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { openDatabase, now } from '../src/db.js';
import { insertParticipant, importParticipants } from '../src/participants.js';
import { queueEmails, createEmailWorker } from '../src/email.js';
import { encrypt, verifyQr, qrPayload } from '../src/security.js';
const config = {
  databasePath: ':memory:',
  qrSecret: 'q'.repeat(40),
  encryptionKey: 'e'.repeat(40),
  origin: 'http://localhost:5173',
  production: false,
  webRoot: '/missing',
};
function fixture() {
  const db = openDatabase(':memory:');
  const id = randomUUID();
  db.prepare('INSERT INTO events VALUES (?,?,?,?,?,?,?)').run(
    id,
    'Summit',
    'UTC',
    null,
    'Hello {{name}}',
    'Welcome {{name}} to {{event}}',
    now(),
  );
  return { db, id };
}
test('durable mail job retries failure and embeds signed QR on success', async () => {
  const { db, id } = fixture();
  insertParticipant(db, id, {
    email: 'alex@example.com',
    fullName: 'Alex <Guest>',
    phone: '',
    company: '',
    ticketType: 'VIP',
    metadata: {},
    active: true,
  });
  db.prepare('INSERT INTO smtp_settings VALUES (1,?,?,?,?,?,?)').run(
    'smtp.example.com',
    587,
    0,
    'emailapikey',
    encrypt(config.encryptionKey, 'secret'),
    'sender@example.com',
  );
  assert.equal(queueEmails(db, id), 1);
  let attempts = 0;
  let delivered = false;
  const worker = createEmailWorker(db, config, async (options, mail) => {
    attempts++;
    assert.equal(options.requireTLS, true);
    if (attempts === 1) throw new Error('Temporary network failure');
    assert.equal(mail.subject, 'Hello Alex <Guest>');
    assert.match(String(mail.html), /Alex &lt;Guest&gt;/);
    assert.ok(mail.attachments?.[0].content);
    assert.equal(mail.attachments?.[0].cid, 'gatecheck-qr');
    assert.match(String(mail.html), /NOVARACE FLOW/);
    assert.match(String(mail.html), /cid:novarace-logo/);
    assert.equal(mail.attachments?.[1].cid, 'novarace-logo');
    delivered = true;
  });
  try {
    await worker.tick();
    const failed = db.prepare('SELECT * FROM email_jobs').get() as {
      status: string;
      attempts: number;
      last_error: string;
    };
    assert.equal(failed.status, 'queued');
    assert.equal(failed.attempts, 1);
    assert.match(failed.last_error, /Temporary network/);
    db.prepare('UPDATE email_jobs SET next_attempt_at=?').run('2000-01-01T00:00:00.000Z');
    await worker.tick();
    assert.equal(delivered, true);
    assert.equal(
      (db.prepare('SELECT status FROM email_jobs').get() as { status: string }).status,
      'sent',
    );
  } finally {
    await worker.stop();
    db.close();
  }
});
test('email retry limit reaches failed without losing job', async () => {
  const { db, id } = fixture();
  insertParticipant(db, id, {
    email: 'a@example.com',
    fullName: 'A',
    phone: '',
    company: '',
    ticketType: 'General',
    metadata: {},
    active: true,
  });
  db.prepare('INSERT INTO smtp_settings VALUES (1,?,?,?,?,?,?)').run(
    'smtp.example.com',
    587,
    0,
    'user',
    encrypt(config.encryptionKey, 'secret'),
    'sender@example.com',
  );
  queueEmails(db, id);
  const worker = createEmailWorker(db, config, async () => {
    throw new Error('Unavailable');
  });
  try {
    for (let i = 0; i < 5; i++) {
      db.prepare('UPDATE email_jobs SET next_attempt_at=?').run('2000-01-01T00:00:00.000Z');
      await worker.tick();
    }
    const row = db.prepare('SELECT status,attempts FROM email_jobs').get() as {
      status: string;
      attempts: number;
    };
    assert.deepEqual(row, { status: 'failed', attempts: 5 });
  } finally {
    await worker.stop();
    db.close();
  }
});
test('Excel import preserves extra columns and reports bad rows', async () => {
  const { db, id } = fixture();
  try {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Guests');
    ws.addRow(['Email*', 'Full Name*', 'Diet']);
    ws.addRow(['One@example.com', 'Guest One', 'Vegetarian']);
    ws.addRow(['one@example.com', 'Duplicate', 'Other']);
    ws.addRow(['invalid', 'Invalid', '']);
    const result = await importParticipants(
      db,
      id,
      Buffer.from(await wb.xlsx.writeBuffer()),
      'guests.xlsx',
    );
    assert.equal(result.imported, 1);
    assert.equal(result.rejected, 2);
    assert.equal(
      (db.prepare('SELECT metadata FROM participants').get() as { metadata: string }).metadata,
      '{"Diet":"Vegetarian"}',
    );
    await assert.rejects(
      importParticipants(db, id, Buffer.from('Name\nBad'), 'bad.csv'),
      /Required headers/,
    );
  } finally {
    db.close();
  }
});
test('HMAC tokens reject tampering and truncation', () => {
  const payload = qrPayload(
    config.qrSecret,
    randomUUID(),
    randomUUID(),
    'random-nonce-at-least-16',
  );
  assert.ok(verifyQr(config.qrSecret, payload));
  assert.equal(verifyQr(config.qrSecret, payload.slice(0, -5)), null);
  assert.equal(verifyQr('other-secret', payload), null);
});
