import { randomUUID } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { participantSchema, type ParticipantInput } from '@gatecheck/shared';
import { type DB, type ParticipantRow, now } from './db.js';
import { randomToken } from './security.js';
export function publicParticipant(p: ParticipantRow) {
  const { token_nonce, ...safe } = p;
  return { ...safe, active: !!p.active, metadata: JSON.parse(p.metadata) };
}
export function insertParticipant(db: DB, eventId: string, input: ParticipantInput) {
  const id = randomUUID();
  db.prepare('INSERT INTO participants VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(
    id,
    eventId,
    input.email,
    input.fullName,
    input.phone,
    input.ticketType,
    input.company,
    JSON.stringify(input.metadata),
    Number(input.active),
    randomToken(),
    now(),
  );
  return id;
}
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if ('text' in value) return String(value.text);
    if ('richText' in value) return value.richText.map((v) => v.text).join('');
    if ('result' in value) return String(value.result ?? '');
  }
  return String(value);
}
export async function importParticipants(
  db: DB,
  eventId: string,
  buffer: Buffer,
  filename: string,
) {
  let rows: string[][];
  if (filename.toLowerCase().endsWith('.xlsx')) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as never);
    const sheet = wb.worksheets[0];
    if (!sheet) throw new Error('Workbook has no worksheets');
    rows = [];
    sheet.eachRow({ includeEmpty: true }, (row) => {
      const cells: string[] = [];
      for (let i = 1; i <= sheet.columnCount; i++) cells.push(cellText(row.getCell(i).value));
      rows.push(cells);
    });
  } else if (filename.toLowerCase().endsWith('.csv'))
    rows = parse(buffer.toString('utf8'), {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
    });
  else throw new Error('Upload a CSV or .xlsx file');
  if (rows.length > 10001) throw new Error('Maximum 10,000 participants per import');
  const headers = (rows.shift() ?? []).map((h) => h.trim());
  const normalized = headers.map((h) => h.toLowerCase().replace(/[* _-]/g, ''));
  if (!normalized.includes('email') || !normalized.includes('fullname'))
    throw new Error('Required headers: Email, Full Name');
  if (new Set(normalized).size !== normalized.length) throw new Error('Duplicate column headers');
  const errors: { row: number; email: string; error: string }[] = [];
  let imported = 0;
  db.transaction(() => {
    rows.forEach((row, index) => {
      if (row.every((v) => !v.trim())) return;
      const data: Record<string, string> = {};
      const metadata: Record<string, string> = {};
      headers.forEach((header, i) => {
        const key = normalized[i];
        if (['email', 'fullname', 'phone', 'tickettype', 'company'].includes(key))
          data[key] = row[i] ?? '';
        else metadata[header] = row[i] ?? '';
      });
      const parsed = participantSchema.safeParse({
        email: data.email,
        fullName: data.fullname,
        phone: data.phone ?? '',
        ticketType: data.tickettype || 'General',
        company: data.company ?? '',
        metadata,
      });
      if (!parsed.success) {
        errors.push({
          row: index + 2,
          email: data.email ?? '',
          error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        });
        return;
      }
      if (
        db
          .prepare('SELECT 1 FROM participants WHERE event_id=? AND email=?')
          .get(eventId, parsed.data.email)
      ) {
        errors.push({
          row: index + 2,
          email: parsed.data.email,
          error: 'Duplicate email; existing participant unchanged',
        });
        return;
      }
      insertParticipant(db, eventId, parsed.data);
      imported++;
    });
  })();
  return { imported, rejected: errors.length, errors };
}
