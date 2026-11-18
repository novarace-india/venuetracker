import { z } from 'zod';
import {
  analyticsFilterSchema,
  analyticsSettingsSchema,
  type AnalyticsParticipantPage,
} from '@gatecheck/shared';
import { audit, now } from '../db.js';
import { HttpError } from '../scans.js';
import { helpers, type RouteContext } from './context.js';
import { transitionPeople, funnelPeople, hourPeople } from '../analytics/drill.js';
import { loadSnapshot } from '../analytics/snapshot.js';
import { aggregate } from '../analytics/aggregate.js';
import { participantJourney } from '../analytics/journey.js';
import { excelReport } from '../analytics/excel.js';
import { pdfReport } from '../analytics/pdf.js';
export function analyticsRoutes({ app, db, admin }: RouteContext) {
  const { params, event } = helpers(db);
  const report = (eventId: string, query: unknown) => {
    const filters = analyticsFilterSchema.parse(query);
    const snapshot = loadSnapshot(db, eventId);
    return { snapshot, data: aggregate(snapshot, filters) };
  };
  app.get('/api/events/:eventId/analytics', { preHandler: admin }, async (req) => {
    const { data } = report(params(req).eventId, req.query);
    const { participants, scans, visits, ...dashboard } = data;
    return dashboard;
  });
  app.get('/api/events/:eventId/analytics/participants', { preHandler: admin }, async (req) => {
    const { data, snapshot } = report(params(req).eventId, req.query);
    const query = z
      .object({
        limit: z.coerce.number().int().min(1).max(100).default(25),
        offset: z.coerce.number().int().min(0).default(0),
        search: z.string().max(200).default(''),
        drillGateId: z.string().uuid().optional(),
        hour: z.coerce.number().int().min(0).max(23).optional(),
        transitionFrom: z.string().uuid().optional(),
        transitionTo: z.string().uuid().optional(),
        funnelStage: z.coerce.number().int().min(0).max(99).optional(),
        reason: z.string().max(500).optional(),
        outcome: z
          .enum([
            'all',
            'visited',
            'unvisited',
            'arrived',
            'not_arrived',
            'denied',
            'duplicate',
            'override',
          ])
          .default('all'),
      })
      .parse(req.query);
    if (query.drillGateId && !data.gates.some((g) => g.id === query.drillGateId))
      throw new HttpError(400, 'Choose a gate included in the selected report');
    if (!!query.transitionFrom !== !!query.transitionTo)
      throw new HttpError(400, 'A transition requires both gates');
    for (const id of [query.transitionFrom, query.transitionTo])
      if (id && !data.gates.some((g) => g.id === id))
        throw new HttpError(400, 'Transition gates must be selected event gates');
    if (query.funnelStage !== undefined && query.funnelStage >= data.filters.route.length)
      throw new HttpError(400, 'Choose a valid funnel step');
    const transitionIds =
      query.transitionFrom && query.transitionTo
        ? transitionPeople(snapshot, data, query.transitionFrom, query.transitionTo)
        : null;
    const funnelIds =
      query.funnelStage !== undefined ? funnelPeople(snapshot, data, query.funnelStage) : null;
    const hourIds =
      query.hour !== undefined ? hourPeople(data, query.hour, query.drillGateId) : null;
    const reasonIds = query.reason
      ? new Set(
          data.scans
            .filter((s) =>
              query.reason === 'Successful manual override'
                ? s.manual && s.status === 'success'
                : query.reason === 'Undone collection'
                  ? !!s.undoneAt
                  : s.message === query.reason && s.status !== 'success',
            )
            .flatMap((s) => (s.participantId ? [s.participantId] : [])),
        )
      : null;
    const search = query.search.toLowerCase();
    const byStatus = new Set(
      data.scans
        .filter(
          (s) =>
            (!query.drillGateId || s.gateId === query.drillGateId) &&
            (query.outcome === 'denied'
              ? s.status === 'denied'
              : query.outcome === 'duplicate'
                ? s.status === 'already'
                : s.manual && s.status === 'success'),
        )
        .flatMap((s) => (s.participantId ? [s.participantId] : [])),
    );
    const items = data.participants.filter((p) => {
      if (search && !`${p.fullName} ${p.email}`.toLowerCase().includes(search)) return false;
      if (
        (transitionIds && !transitionIds.has(p.id)) ||
        (funnelIds && !funnelIds.has(p.id)) ||
        (reasonIds && !reasonIds.has(p.id))
      )
        return false;
      if (hourIds && query.outcome !== 'unvisited' && !hourIds.has(p.id)) return false;
      const visited = hourIds
        ? hourIds.has(p.id)
        : query.drillGateId
          ? p.completedGateIds.includes(query.drillGateId)
          : p.completedGateIds.length > 0;
      if (query.outcome === 'visited') return visited;
      if (query.outcome === 'unvisited') return !visited;
      if (query.outcome === 'arrived') return !!p.arrivedAt;
      if (query.outcome === 'not_arrived') return !p.arrivedAt;
      if (['denied', 'duplicate', 'override'].includes(query.outcome)) return byStatus.has(p.id);
      return true;
    });
    return {
      items: items.slice(query.offset, query.offset + query.limit),
      total: items.length,
      offset: query.offset,
      limit: query.limit,
    } satisfies AnalyticsParticipantPage;
  });
  app.get(
    '/api/events/:eventId/analytics/participants/:id/journey',
    { preHandler: admin },
    async (req) => {
      const { snapshot, data } = report(params(req).eventId, req.query);
      return participantJourney(snapshot, data, params(req).id);
    },
  );
  app.put('/api/events/:eventId/analytics/settings', { preHandler: admin }, async (req) => {
    const { eventId } = params(req);
    event(eventId);
    const input = analyticsSettingsSchema.parse(req.body);
    const ids = [
      ...(input.entranceGateId ? [input.entranceGateId] : []),
      ...input.targets.map((t) => t.gateId),
    ];
    for (const id of ids)
      if (!db.prepare('SELECT 1 FROM gates WHERE id=? AND event_id=?').get(id, eventId))
        throw new HttpError(400, 'Analytics settings must use gates in this event');
    if (new Set(input.targets.map((t) => t.gateId)).size !== input.targets.length)
      throw new HttpError(400, 'Duplicate gate target');
    db.transaction(() => {
      db.prepare(
        'INSERT INTO analytics_settings VALUES (?,?,?) ON CONFLICT(event_id) DO UPDATE SET entrance_gate_id=excluded.entrance_gate_id,updated_at=excluded.updated_at',
      ).run(eventId, input.entranceGateId, now());
      for (const target of input.targets) {
        if (target.targetPercent === null)
          db.prepare('DELETE FROM analytics_gate_targets WHERE gate_id=?').run(target.gateId);
        else
          db.prepare(
            'INSERT INTO analytics_gate_targets VALUES (?,?) ON CONFLICT(gate_id) DO UPDATE SET target_percent=excluded.target_percent',
          ).run(target.gateId, target.targetPercent);
      }
      audit(db, req.adminId!, 'analytics.settings', eventId, input);
    })();
    return { ok: true };
  });
  app.get(
    '/api/events/:eventId/analytics/export/:format',
    { preHandler: admin, config: { rateLimit: { max: 12, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const format = z.enum(['xlsx', 'pdf']).parse(params(req).format);
      const { snapshot, data } = report(params(req).eventId, req.query);
      const filename = `novarace-flow-analytics-${data.generatedAt.slice(0, 10)}.${format}`;
      const buffer =
        format === 'xlsx'
          ? await excelReport(data)
          : await pdfReport(
              data,
              data.filters.participantId
                ? participantJourney(snapshot, data, data.filters.participantId)
                : undefined,
            );
      return reply
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .type(
          format === 'xlsx'
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : 'application/pdf',
        )
        .send(buffer);
    },
  );
}
