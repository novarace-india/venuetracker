import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';
import { randomUUID } from 'node:crypto';
import { analyticsFilterSchema } from '@gatecheck/shared';
import { analyticsFixture } from './analytics.fixture.js';
import { aggregate } from '../src/analytics/aggregate.js';
import { participantJourney } from '../src/analytics/journey.js';
import { transitionPeople, funnelPeople } from '../src/analytics/drill.js';
import { excelReport } from '../src/analytics/excel.js';
import { pdfReport } from '../src/analytics/pdf.js';
import { buildApp, bootstrapAdmin } from '../src/app.js';
const config = {
  databasePath: ':memory:',
  qrSecret: 'q'.repeat(40),
  encryptionKey: 'e'.repeat(40),
  origin: 'http://localhost:5173',
  production: false,
  webRoot: '/nonexistent',
};
test('analytics distinguishes people, net collections, audit attempts, targets and ordered routes', () => {
  const f = analyticsFixture();
  try {
    const r = aggregate(f.snapshot(), f.filters);
    assert.equal(r.summary.registered, 5);
    assert.equal(r.summary.active, 4);
    assert.equal(r.summary.arrived, 4);
    assert.equal(r.summary.attendancePercent, 80);
    assert.equal(r.summary.arrivalPeak?.people, 1);
    assert.equal(r.summary.collections, 8);
    assert.equal(r.summary.attempts, 13);
    assert.equal(r.summary.successAttempts, 10);
    assert.equal(r.summary.duplicates, 1);
    assert.equal(r.summary.denied, 2);
    assert.equal(r.summary.overrides, 2);
    assert.equal(r.summary.undos, 2);
    assert.equal(r.gates.find((g) => g.id === f.gates.kit)?.participationPercent, 60);
    assert.equal(r.gates.find((g) => g.id === f.gates.kit)?.targetStatus, 'met');
    assert.equal(r.gates.find((g) => g.id === f.gates.meal)?.targetStatus, 'below');
    assert.deepEqual(
      r.funnel.map((s) => s.people),
      [4, 1, 1],
    );
    assert.equal(r.transitions.length, 3);
    assert.equal(
      r.transitions.find((t) => t.from === f.gates.reception && t.to === f.gates.kit)
        ?.medianMinutes,
      15,
    );
    assert.equal(r.quality.ambiguousTransitions, 1);
    assert.equal(r.buckets.at(-1)?.cumulativeArrivals, 4);
    assert.equal(
      r.buckets.reduce((sum, b) => sum + b.collections, 0),
      8,
    );
    assert.equal(
      r.heatmap.reduce((sum, h) => sum + h.collections, 0),
      8,
    );
    assert.equal(r.summary.peak?.start, '2026-11-18T03:30:00.000Z');
    assert.equal(r.quality.unknownPassAttempts, 1);
    assert.equal(transitionPeople(f.snapshot(), r, f.gates.reception, f.gates.kit).size, 1);
    assert.equal(funnelPeople(f.snapshot(), r, 2).size, 1);
  } finally {
    f.db.close();
  }
});
test('cohort, time and gate filters keep explicit consistent denominators', () => {
  const f = analyticsFixture();
  try {
    const snapshot = f.snapshot();
    const kit = aggregate(snapshot, analyticsFilterSchema.parse({ gateIds: f.gates.kit }));
    assert.equal(kit.summary.arrived, 4);
    assert.equal(kit.gates.length, 1);
    assert.equal(kit.gates[0].attendeeConversionPercent, 75);
    const noShortcut = aggregate(
      snapshot,
      analyticsFilterSchema.parse({ gateIds: [f.gates.reception, f.gates.meal].join(',') }),
    );
    assert.equal(noShortcut.transitions.length, 0);
    const active = aggregate(snapshot, analyticsFilterSchema.parse({ cohort: 'active' }));
    assert.equal(active.summary.registered, 4);
    assert.equal(active.summary.arrived, 3);
    assert.equal(active.summary.attendancePercent, 75);
    assert.equal(active.quality.unknownPassAttempts, 0);
    const period = aggregate(
      snapshot,
      analyticsFilterSchema.parse({
        from: '2026-11-18T04:00:00.000Z',
        to: '2026-11-18T05:00:00.000Z',
      }),
    );
    assert.equal(period.summary.arrived, 2);
    assert.equal(period.gates.find((g) => g.id === f.gates.meal)?.attendeeConversionPercent, 0);
    assert.equal(period.gates.find((g) => g.id === f.gates.meal)?.withoutEntrance, 1);
    const missing = aggregate(snapshot, analyticsFilterSchema.parse({ company: '__none__' }));
    assert.equal(missing.summary.registered, 1);
    assert.equal(missing.participants[0].id, f.people.dev);
    const vip = aggregate(snapshot, analyticsFilterSchema.parse({ ticketType: 'VIP' }));
    assert.equal(vip.summary.registered, 2);
    assert.equal(vip.summary.arrived, 2);
    assert.throws(
      () => aggregate(snapshot, analyticsFilterSchema.parse({ gateIds: randomUUID() })),
      /does not belong/,
    );
    assert.throws(() =>
      analyticsFilterSchema.parse({
        from: '2026-11-18T04:00:00.000Z',
        to: '2026-11-18T03:00:00.000Z',
      }),
    );
  } finally {
    f.db.close();
  }
});
test('empty cohorts and unconfigured entrance expose unavailable rates', () => {
  const f = analyticsFixture();
  try {
    const s = f.snapshot();
    s.entranceGateId = null;
    const r = aggregate(s, analyticsFilterSchema.parse({}));
    assert.equal(r.summary.arrived, null);
    assert.equal(r.summary.attendancePercent, null);
    assert.ok(r.segments.ticketTypes.every((s) => s.attendancePercent === null));
    const empty = aggregate(s, analyticsFilterSchema.parse({ q: 'nobody-matches' }));
    assert.equal(empty.summary.registered, 0);
    assert.equal(empty.summary.successPercent, null);
    assert.equal(empty.summary.collections, 0);
    assert.ok(
      empty.gates.every((g) => g.participationPercent === null && g.targetStatus === 'unrated'),
    );
    assert.equal(empty.buckets.length, 0);
  } finally {
    f.db.close();
  }
});
test('capture basis falls back for implausible clocks and preserves both timestamps', () => {
  const f = analyticsFixture();
  try {
    const r = aggregate(f.snapshot(), analyticsFilterSchema.parse({ timeBasis: 'capture' }));
    assert.equal(r.quality.captureFallbacks, 1);
    assert.equal(r.quality.captureTimesUsed, 12);
    const s = r.scans.find((s) => s.id === f.ids.aKit)!;
    assert.equal(s.time, '2026-11-18T03:35:00.000Z');
    assert.equal(s.serverTime, '2026-11-18T03:45:00.000Z');
    assert.equal(r.scans.find((s) => s.id === f.ids.unknown)?.time, '2026-11-18T05:15:00.000Z');
    assert.equal(r.quality.medianCaptureDelaySeconds, 2);
  } finally {
    f.db.close();
  }
});
test('timezone buckets preserve half-hour boundaries and repeated DST hours', () => {
  const f = analyticsFixture();
  try {
    const india = aggregate(f.snapshot(), analyticsFilterSchema.parse({ bucketMinutes: 60 }));
    assert.equal(india.buckets[0].start, '2026-11-18T03:30:00.000Z');
    const s = f.snapshot();
    s.event.timezone = 'America/New_York';
    s.records = s.records.filter((r) => r.id === f.ids.aEntrance || r.id === f.ids.bEntrance);
    s.records[0].time = s.records[0].serverTime = '2026-11-01T05:30:00.000Z';
    s.records[1].time = s.records[1].serverTime = '2026-11-01T06:30:00.000Z';
    const dst = aggregate(s, analyticsFilterSchema.parse({ bucketMinutes: 60 }));
    assert.deepEqual(
      dst.buckets.map((b) => b.start),
      ['2026-11-01T05:00:00.000Z', '2026-11-01T06:00:00.000Z'],
    );
    assert.notEqual(dst.buckets[0].label, dst.buckets[1].label);
    assert.equal(dst.buckets[1].cumulativeArrivals, 2);
  } finally {
    f.db.close();
  }
});
test('participant journey retains undone attempts without counting them as visits', () => {
  const f = analyticsFixture();
  try {
    const snapshot = f.snapshot(),
      r = aggregate(snapshot, f.filters),
      j = participantJourney(snapshot, r, f.people.alex);
    assert.equal(j.summary.completed, 3);
    assert.equal(j.summary.elapsedMinutes, 30);
    assert.equal(j.timeline.length, 5);
    assert.equal(j.timeline.filter((s) => s.undoneAt).length, 1);
    assert.equal(j.gates.find((g) => g.id === f.gates.meal)?.collections, 1);
    assert.equal(
      participantJourney(snapshot, r, f.people.dev).gates.find((g) => g.id === f.gates.kit)?.state,
      'deactivated',
    );
    assert.throws(() => participantJourney(snapshot, r, randomUUID()), /Participant/);
  } finally {
    f.db.close();
  }
});
test('Excel/PDF exports preserve snapshot values and typed workbook data', async () => {
  const f = analyticsFixture();
  try {
    const snapshot = f.snapshot(),
      r = aggregate(snapshot, f.filters);
    const xlsx = await excelReport(r),
      wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsx as never);
    assert.equal(wb.creator, 'NovaRace Flow');
    assert.match(String(wb.getWorksheet('Summary')!.getCell('A1').value), /^NovaRace Flow/);
    assert.ok(wb.getWorksheet('Journey audit'));
    assert.equal(wb.getWorksheet('Participants')!.rowCount, 8);
    assert.equal(wb.getWorksheet('Journey audit')!.rowCount, 16);
    const gates = wb.getWorksheet('Gate performance')!;
    const kit = gates.getRows(4, 3)!.find((row) => row.getCell(1).value === 'Kit Collection')!;
    assert.equal(kit.getCell(4).value, 0.6);
    assert.equal(kit.getCell(4).numFmt, '0.0%');
    assert.ok(wb.getWorksheet('Time buckets')!.getCell('A4').value instanceof Date);
    assert.equal(wb.getWorksheet('Participants')!.getCell('A4').type, ExcelJS.ValueType.String);
    const pdf = await pdfReport(r, participantJourney(snapshot, r, f.people.alex));
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    const loaded = await PDFDocument.load(pdf);
    assert.ok(loaded.getPageCount() >= 5);
    assert.ok(loaded.getPageCount() < 15);
    assert.match(loaded.getTitle() ?? '', /Analytics Summit/);
    assert.match(loaded.getTitle() ?? '', /NovaRace Flow/);
    assert.equal(loaded.getAuthor(), 'NovaRace Flow');
  } finally {
    f.db.close();
  }
});
test('analytics endpoints enforce auth, event boundaries, drill-down agreement and report downloads', async () => {
  const f = analyticsFixture();
  const { app } = await buildApp(config, { db: f.db, worker: false });
  bootstrapAdmin(f.db, 'admin@example.com', 'secure-analytics-password');
  try {
    assert.equal((await app.inject({ url: `/api/events/${f.eventId}/analytics` })).statusCode, 401);
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'admin@example.com', password: 'secure-analytics-password' },
    });
    const cookie = `gc_session=${login.cookies[0].value}`;
    const get = (url: string) => app.inject({ url, headers: { cookie } });
    const base = `/api/events/${f.eventId}/analytics`;
    const overview = await get(base);
    assert.equal(overview.statusCode, 200);
    assert.equal(overview.json().summary.attendancePercent, 80);
    assert.equal(overview.json().scans, undefined);
    const transition = await get(
      `${base}/participants?transitionFrom=${f.gates.reception}&transitionTo=${f.gates.kit}`,
    );
    assert.equal(transition.json().total, 1);
    const hour = await get(
      `${base}/participants?drillGateId=${f.gates.kit}&hour=9&outcome=visited`,
    );
    assert.equal(hour.json().total, 2);
    const reason = await get(
      `${base}/participants?reason=${encodeURIComponent('Successful manual override')}`,
    );
    assert.equal(reason.json().total, 2);
    const funnel = await get(
      `${base}/participants?route=${[f.gates.reception, f.gates.kit, f.gates.meal].join(',')}&funnelStage=2`,
    );
    assert.equal(funnel.json().total, 1);
    assert.equal((await get(`${base}/participants/${randomUUID()}/journey`)).statusCode, 404);
    assert.equal((await get(`${base}?gateIds=${randomUUID()}`)).statusCode, 400);
    const invalid = await app.inject({
      method: 'PUT',
      url: base + '/settings',
      headers: { cookie },
      payload: { entranceGateId: randomUUID(), targets: [] },
    });
    assert.equal(invalid.statusCode, 400);
    for (const format of ['xlsx', 'pdf']) {
      const response = await get(`${base}/export/${format}`);
      assert.equal(response.statusCode, 200);
      assert.match(response.headers['content-disposition'] as string, /attachment/);
      assert.ok(response.rawPayload.length > 1000);
    }
    const settings = await app.inject({
      method: 'PUT',
      url: base + '/settings',
      headers: { cookie },
      payload: {
        entranceGateId: f.gates.reception,
        targets: [{ gateId: f.gates.kit, targetPercent: 80 }],
      },
    });
    assert.equal(settings.statusCode, 200);
    assert.equal(
      (await get(base)).json().gates.find((g: { id: string }) => g.id === f.gates.kit).targetStatus,
      'below',
    );
    assert.equal((await get(`/api/events/${randomUUID()}/analytics`)).statusCode, 404);
  } finally {
    await app.close();
    f.db.close();
  }
});
