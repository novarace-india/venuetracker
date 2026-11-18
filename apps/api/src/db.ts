import Database from 'better-sqlite3';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export type DB = Database.Database;
export const now = () => new Date().toISOString();
export function openDatabase(filename: string): DB {
  if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true });
  const db = new Database(filename);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec('CREATE TABLE IF NOT EXISTS migrations(name TEXT PRIMARY KEY,applied_at TEXT NOT NULL)');
  const dir = fileURLToPath(new URL('../migrations/', import.meta.url));
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    if (!db.prepare('SELECT 1 FROM migrations WHERE name=?').get(file))
      db.transaction(() => {
        db.exec(readFileSync(path.join(dir, file), 'utf8'));
        db.prepare('INSERT INTO migrations VALUES (?,?)').run(file, now());
      })();
  }
  return db;
}
export function audit(
  db: DB,
  actor: string | null,
  action: string,
  id: string | null,
  detail: unknown,
) {
  db.prepare('INSERT INTO audit_log VALUES (?,?,?,?,?,?)').run(
    crypto.randomUUID(),
    actor,
    action,
    id,
    JSON.stringify(detail),
    now(),
  );
}
export interface ParticipantRow {
  id: string;
  event_id: string;
  email: string;
  full_name: string;
  phone: string;
  ticket_type: string;
  company: string;
  metadata: string;
  active: number;
  token_nonce: string;
  created_at: string;
}
export interface EventRow {
  id: string;
  name: string;
  timezone: string;
  starts_at: string | null;
  email_subject: string;
  email_body: string;
  created_at: string;
}
export interface GateRow {
  id: string;
  event_id: string;
  name: string;
  max_collections: number;
  created_at: string;
}
export interface DeviceRow {
  id: string;
  event_id: string;
  gate_id: string;
  name: string;
  revoked: number;
}
