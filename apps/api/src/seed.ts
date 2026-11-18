import { randomUUID } from 'node:crypto';
import { configFromEnv } from './config.js';
import { openDatabase, now } from './db.js';
import { bootstrapAdmin } from './app.js';
import { insertParticipant } from './participants.js';
import ExcelJS from 'exceljs';
import { fileURLToPath } from 'node:url';
const config = configFromEnv(),
  db = openDatabase(config.databasePath);
bootstrapAdmin(
  db,
  process.env.ADMIN_EMAIL ?? 'admin@novarace.local',
  process.env.ADMIN_PASSWORD ?? '',
);
if (!db.prepare('SELECT 1 FROM events').get())
  db.transaction(() => {
    const event = randomUUID(),
      reception = randomUUID(),
      kit = randomUUID();
    db.prepare('INSERT INTO events VALUES (?,?,?,?,?,?,?)').run(
      event,
      'Founders Summit 2026',
      'Asia/Kolkata',
      '2026-12-12T03:30:00.000Z',
      'Your pass for {{event}}',
      'Hello {{name}},\nWelcome to {{event}}. Your {{ticketType}} pass is below.\nSee you at the gate!',
      now(),
    );
    for (const [id, name] of [
      [reception, 'Reception'],
      [kit, 'Kit collection'],
    ])
      db.prepare('INSERT INTO gates VALUES (?,?,?,?,?)').run(id, event, name, 1, now());
    db.prepare('INSERT INTO gate_dependencies VALUES (?,?)').run(kit, reception);
    for (const [name, email, ticket] of [
      ['Alex Morgan', 'alex@example.com', 'VIP'],
      ['Sam Patel', 'sam@example.com', 'General'],
      ['Jamie Chen', 'jamie@example.com', 'Speaker'],
    ])
      insertParticipant(db, event, {
        fullName: name,
        email,
        ticketType: ticket,
        company: 'Acme',
        phone: '',
        active: true,
        metadata: {},
      });
  })();
const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet('Participants');
ws.addRow(['Email', 'Full Name', 'Phone', 'Ticket Type', 'Company', 'Dietary Preference']);
ws.addRow(['alex@example.com', 'Alex Morgan', '+919876543210', 'VIP', 'Acme', 'Vegetarian']);
ws.addRow(['sam@example.com', 'Sam Patel', '', 'General', 'Studio', 'Standard']);
ws.getRow(1).font = { bold: true };
ws.columns.forEach((c) => {
  c.width = 25;
});
await wb.xlsx.writeFile(
  fileURLToPath(new URL('../../../samples/participants.xlsx', import.meta.url)),
);
db.close();
console.log('Seed complete. Sample workbook saved to samples/participants.xlsx');
