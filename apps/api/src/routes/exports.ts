import { HttpError } from '../scans.js';
import { helpers, type RouteContext } from './context.js';
export function exportRoutes(context: RouteContext) {
  const { app, db, admin } = context;
  const { params, event } = helpers(db);
  app.get('/api/events/:eventId/export/:kind', { preHandler: admin }, async (req, reply) => {
    const { eventId, kind } = params(req);
    event(eventId);
    let rows: Record<string, unknown>[];
    if (kind === 'scans')
      rows = db
        .prepare(
          'SELECT s.operation_id,p.email,p.full_name,g.name AS gate,s.status,s.message,s.manual,s.reason,s.client_time,s.created_at AS server_time,s.actor_id,d.name AS device,c.undone_at,c.undone_by,c.undo_reason,a.email AS undo_admin,i.reset_id FROM scans s LEFT JOIN participants p ON p.id=s.participant_id JOIN gates g ON g.id=s.gate_id LEFT JOIN devices d ON d.id=s.device_id LEFT JOIN collections c ON c.scan_id=s.id LEFT JOIN admins a ON a.id=c.undone_by LEFT JOIN collection_reset_items i ON i.collection_id=c.id WHERE s.event_id=? ORDER BY s.created_at',
        )
        .all(eventId) as Record<string, unknown>[];
    else if (kind === 'participants')
      rows = db
        .prepare(
          'SELECT p.email,p.full_name,p.phone,p.ticket_type,p.company,p.active,p.metadata,g.name AS gate,count(c.id) AS collections,max(c.created_at) AS last_collection FROM participants p LEFT JOIN gates g ON g.event_id=p.event_id LEFT JOIN collections c ON c.participant_id=p.id AND c.gate_id=g.id AND c.undone_at IS NULL WHERE p.event_id=? GROUP BY p.id,g.id ORDER BY p.full_name,g.name',
        )
        .all(eventId) as Record<string, unknown>[];
    else throw new HttpError(400, 'Choose scans or participants');
    const fields = rows.length ? Object.keys(rows[0]) : ['email'];
    const csvCell = (v: unknown) => {
      let s = String(v ?? '');
      if (/^[\s]*[=+\-@]|^[\t\r\n]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    };
    return reply
      .header('Content-Disposition', `attachment; filename="novarace-flow-${kind}.csv"`)
      .type('text/csv; charset=utf-8')
      .send(
        '\uFEFF' +
          [
            fields.map(csvCell).join(','),
            ...rows.map((r) => fields.map((f) => csvCell(r[f])).join(',')),
          ].join('\r\n'),
      );
  });
}
