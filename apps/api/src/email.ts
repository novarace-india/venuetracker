import { BRAND, brandLogo } from './brand.js';
import nodemailer from 'nodemailer';
import QRCode from 'qrcode';
import type { SMTPTransportOptions } from 'nodemailer/lib/smtp-transport';
import type { SendMailOptions } from 'nodemailer/lib/mailer';
import { randomUUID } from 'node:crypto';
import { type DB, type ParticipantRow, type EventRow, now } from './db.js';
import { decrypt, qrPayload } from './security.js';
import type { Config } from './config.js';
interface SMTPRow {
  host: string;
  port: number;
  secure: number;
  username: string;
  password_encrypted: string;
  from_address: string;
}
const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export function template(text: string, p: ParticipantRow, event: EventRow) {
  const variables: Record<string, string> = {
    name: p.full_name,
    email: p.email,
    event: event.name,
    ticketType: p.ticket_type,
    company: p.company,
  };
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => variables[key] ?? '');
}
export function queueEmails(db: DB, eventId: string, ids?: string[]) {
  const participants = db
    .prepare('SELECT id FROM participants WHERE event_id=? AND active=1')
    .all(eventId) as { id: string }[];
  let queued = 0;
  db.transaction(() => {
    for (const p of participants) {
      if (ids && !ids.includes(p.id)) continue;
      const r = db
        .prepare(
          'INSERT OR IGNORE INTO email_jobs(id,participant_id,next_attempt_at,created_at) VALUES (?,?,?,?)',
        )
        .run(randomUUID(), p.id, now(), now());
      queued += r.changes;
    }
  })();
  return queued;
}
async function sendSmtp(options: SMTPTransportOptions, mail: SendMailOptions) {
  const transport = nodemailer.createTransport(options);
  try {
    await transport.sendMail(mail);
  } finally {
    transport.close();
  }
}
export function createEmailWorker(db: DB, config: Config, deliver = sendSmtp) {
  let busy = false;
  let stopped = false;
  // Only one process owns the SQLite queue. Interrupted sends are retried on restart;
  // SMTP cannot guarantee exactly-once delivery if the connection dies after acceptance.
  db.prepare("UPDATE email_jobs SET status='queued' WHERE status='sending'").run();
  async function tick() {
    if (busy || stopped) return;
    const settings = db.prepare('SELECT * FROM smtp_settings WHERE id=1').get() as
      SMTPRow | undefined;
    if (!settings) return;
    const job = db
      .prepare(
        "SELECT * FROM email_jobs WHERE status='queued' AND next_attempt_at<=? ORDER BY created_at LIMIT 1",
      )
      .get(now()) as { id: string; participant_id: string; attempts: number } | undefined;
    if (!job) return;
    busy = true;
    try {
      db.prepare("UPDATE email_jobs SET status='sending',attempts=attempts+1 WHERE id=?").run(
        job.id,
      );
      const p = db
        .prepare('SELECT * FROM participants WHERE id=?')
        .get(job.participant_id) as ParticipantRow;
      if (!p.active) throw new Error('Participant deactivated');
      const event = db.prepare('SELECT * FROM events WHERE id=?').get(p.event_id) as EventRow;
      const qr = await QRCode.toBuffer(
        qrPayload(config.qrSecret, p.event_id, p.id, p.token_nonce),
        { width: 420, margin: 2 },
      );
      const text = template(event.email_body, p, event);
      const transportOptions: SMTPTransportOptions = {
        host: settings.host,
        port: settings.port,
        secure: !!settings.secure,
        requireTLS: !settings.secure,
        auth: {
          user: settings.username,
          pass: decrypt(config.encryptionKey, settings.password_encrypted),
        },
        connectionTimeout: 15000,
        socketTimeout: 20000,
      };
      await deliver(transportOptions, {
        from: settings.from_address,
        to: p.email,
        subject: template(event.email_subject, p, event),
        text,
        html: `<div style="background:${BRAND.colors.paper};padding:32px;font-family:Arial,sans-serif;color:${BRAND.colors.indigo}"><div style="max-width:540px;margin:auto;background:white;border:1px solid #e3e1ef;border-radius:16px;overflow:hidden"><div style="background:${BRAND.colors.indigo};padding:24px 28px"><img src="cid:novarace-logo" alt="NovaRace" width="148" height="60" style="display:inline-block;vertical-align:middle"/><span style="display:inline-block;vertical-align:middle;border-left:1px solid #68638f;padding-left:20px;margin-left:20px;font-size:30px;font-weight:bold;color:white">${BRAND.product}</span></div><div style="padding:28px"><p style="letter-spacing:2px;font-size:11px;color:${BRAND.colors.grey}">${BRAND.name.toUpperCase()} · EVENT PASS</p><h1 style="font-size:27px">${escapeHtml(event.name)}</h1><p style="white-space:pre-line;line-height:1.7;color:${BRAND.colors.charcoal}">${escapeHtml(text)}</p><img src="cid:gatecheck-qr" alt="Your event QR code" width="280" height="280" style="display:block;max-width:100%;height:auto"/><p style="font-size:13px;color:${BRAND.colors.grey}">Keep this pass ready at the gate.</p></div><div style="height:5px;background:${BRAND.colors.sky}"></div></div></div>`,
        attachments: [
          { filename: 'novarace-flow-pass.png', content: qr, cid: 'gatecheck-qr' },
          { filename: 'novarace-logo.png', content: brandLogo, cid: 'novarace-logo' },
        ],
        messageId: `<${job.id}@gatecheck.local>`,
      });
      db.prepare("UPDATE email_jobs SET status='sent',sent_at=?,last_error=NULL WHERE id=?").run(
        now(),
        job.id,
      );
    } catch (error) {
      const attempts = job.attempts + 1;
      const message = error instanceof Error ? error.message : 'SMTP delivery failed';
      db.prepare('UPDATE email_jobs SET status=?,last_error=?,next_attempt_at=? WHERE id=?').run(
        attempts >= 5 ? 'failed' : 'queued',
        message.slice(0, 500),
        new Date(Date.now() + Math.min(3600, 30 * 2 ** attempts) * 1000).toISOString(),
        job.id,
      );
    } finally {
      busy = false;
    }
  }
  const timer = setInterval(() => {
    void tick();
  }, 1000);
  timer.unref();
  return {
    tick,
    async stop() {
      stopped = true;
      clearInterval(timer);
      while (busy) await new Promise((resolve) => setTimeout(resolve, 50));
    },
  };
}
