import { BRAND } from '../brand.js';
import ExcelJS from 'exceljs';
import type { AnalyticsReport } from '@gatecheck/shared';
import { HttpError } from '../scans.js';
export async function excelReport(r: AnalyticsReport): Promise<Buffer> {
  const rowsEstimate =
    r.participants.length * Math.max(1, r.gates.length) + r.scans.length + r.visits.length;
  if (rowsEstimate > 750000)
    throw new HttpError(
      422,
      'This Excel report is too large. Narrow the participant, date or gate filters.',
    );
  const wb = new ExcelJS.Workbook();
  wb.creator = BRAND.name;
  wb.created = new Date(r.generatedAt);
  wb.modified = new Date(r.generatedAt);
  type Column = { header: string; key: string; width?: number; format?: string };
  function sheet(name: string, columns: Column[], rows: Record<string, unknown>[]) {
    if (rows.length > 1048572)
      throw new HttpError(422, `Too many rows in ${name}; narrow the filters`);
    const ws = wb.addWorksheet(name, {
      views: [{ state: 'frozen', ySplit: 3 }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    ws.headerFooter = { oddFooter: '&LNovaRace Flow&RPage &P of &N' };
    ws.columns = columns.map((c) => ({ key: c.key, width: c.width ?? 22 }));
    ws.addRow([`${BRAND.name} - ${r.event.name} - ${name}`]);
    ws.mergeCells(1, 1, 1, Math.max(1, columns.length));
    ws.getRow(1).font = { name: 'Calibri', bold: true, size: 16, color: { argb: 'FF282462' } };
    ws.getRow(1).height = 44;
    ws.getRow(1).alignment = { vertical: 'middle', wrapText: true };
    ws.addRow([
      `Snapshot ${r.generatedAt} | ${r.event.timezone} | ${r.filters.timeBasis === 'server' ? 'Server confirmation' : 'Device capture (unverified)'} time`,
    ]);
    ws.mergeCells(2, 1, 2, Math.max(1, columns.length));
    ws.getRow(2).height = 30;
    ws.getRow(2).alignment = { vertical: 'middle', wrapText: true };
    ws.getRow(2).font = { name: 'Calibri', size: 10, color: { argb: 'FF61758B' } };
    ws.addRow(columns.map((c) => c.header));
    ws.getRow(3).height = 30;
    ws.getRow(3).eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF282462' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 10 };
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
    for (const row of rows) {
      const excelRow = ws.addRow(columns.map((c) => row[c.key] ?? null));
      excelRow.font = { name: 'Calibri', size: 10 };
      excelRow.alignment = { vertical: 'top', wrapText: true };
      excelRow.height = Math.min(
        400,
        Math.max(
          21,
          ...columns.map((c) => {
            const v = row[c.key];
            if (typeof v !== 'string') return 21;
            return (
              v
                .split('\n')
                .reduce(
                  (sum, line) =>
                    sum + Math.max(1, Math.ceil(line.length / Math.max(5, (c.width ?? 22) - 3))),
                  0,
                ) *
                13 +
              7
            );
          }),
        ),
      );
      for (let i = 0; i < columns.length; i++)
        if (columns[i].format) excelRow.getCell(i + 1).numFmt = columns[i].format!;
      if (excelRow.number % 2 === 0)
        excelRow.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F2FA' } };
        });
    }
    ws.autoFilter = {
      from: { row: 3, column: 1 },
      to: { row: Math.max(3, ws.rowCount), column: columns.length },
    };
    return ws;
  }
  const pct = (v: number | null) => (v === null ? null : v / 100);
  const dt = (v: string | null) => (v ? new Date(v) : null);
  const gateName = (id: string) => r.allGates.find((g) => g.id === id)?.name ?? id;
  const person = new Map(r.participants.map((p) => [p.id, p]));
  const filters = [
    ['From (inclusive)', r.filters.from ?? 'All recorded activity'],
    ['To (exclusive)', r.filters.to ?? 'All recorded activity'],
    ['Participant cohort', r.filters.cohort],
    ['Ticket type', r.filters.ticketType ?? 'All'],
    ['Company', r.filters.company === '__none__' ? 'Not provided' : (r.filters.company ?? 'All')],
    ['Participant search', r.filters.q || 'None'],
    ['Participant ID', r.filters.participantId ?? 'All'],
    ['Gates', r.gates.map((g) => g.name).join(', ') || 'None'],
    ['Entrance gate', r.entranceGateId ? gateName(r.entranceGateId) : 'Not configured'],
    ['Ordered funnel', r.filters.route.map(gateName).join(' > ') || 'Not selected'],
    ['Chart bucket (minutes)', r.effectiveBucketMinutes],
  ];
  sheet(
    'Summary',
    [
      { header: 'Metric', key: 'metric', width: 42 },
      { header: 'Value', key: 'value', width: 26 },
      { header: 'Definition', key: 'definition', width: 85 },
    ],
    [
      {
        metric: 'Registered participants',
        value: r.summary.registered,
        definition: 'Current participant cohort; date filter does not change registrations',
      },
      {
        metric: 'Active participants',
        value: r.summary.active,
        definition: 'Current active profiles in cohort',
      },
      {
        metric: 'Deactivated participants',
        value: r.summary.deactivated,
        definition: 'Current deactivated profiles in cohort',
      },
      {
        metric: 'Arrivals',
        value: r.summary.arrived,
        definition:
          'First effective entrance visit occurs in selected period; unavailable without entrance',
      },
      {
        metric: 'Attendance (%)',
        value: r.summary.attendancePercent,
        definition: 'Arrivals / registered cohort x 100; numeric percentage points',
      },
      {
        metric: 'No entrance arrival in period',
        value: r.summary.notArrived,
        definition: 'Registered cohort minus arrivals in selected period',
      },
      {
        metric: 'Any selected gate visitors',
        value: r.summary.anyGateVisitors,
        definition: 'Unique participants with at least one net visit to selected gates',
      },
      {
        metric: 'Peak 15-minute first arrivals',
        value: r.summary.arrivalPeak?.people ?? null,
        definition: r.summary.arrivalPeak
          ? `Interval starts ${r.summary.arrivalPeak.start} (UTC)`
          : 'No entrance activity / entrance not configured',
      },
      {
        metric: 'Net collections',
        value: r.summary.collections,
        definition: 'Effective collections excluding undos',
      },
      {
        metric: 'Scan attempts',
        value: r.summary.attempts,
        definition:
          'Submitted operation IDs, including valid unknown-pass attempts for unfiltered cohort',
      },
      {
        metric: 'Successful attempts',
        value: r.summary.successAttempts,
        definition: 'Includes subsequently undone successes',
      },
      {
        metric: 'Already collected attempts',
        value: r.summary.duplicates,
        definition: 'Server already-collected results',
      },
      { metric: 'Rejected attempts', value: r.summary.denied, definition: 'Denied scan results' },
      {
        metric: 'Successful manual overrides',
        value: r.summary.overrides,
        definition: 'Audited successful manual scan attempts, including subsequently undone ones',
      },
      {
        metric: 'Undone successes',
        value: r.summary.undos,
        definition: 'Scans in period whose collections are currently undone',
      },
      ...filters.map(([metric, value]) => ({
        metric,
        value,
        definition: 'Applied report filter / setting',
      })),
    ],
  );
  const gateRows = r.gates.map((g) => ({
    ...g,
    participation: pct(g.participationPercent),
    conversion: pct(g.attendeeConversionPercent),
    successRate: pct(g.successPercent),
    target: pct(g.targetPercent),
    peakStart: dt(g.peak?.start ?? null),
    peakCollections: g.peak?.collections ?? null,
  }));
  sheet(
    'Gate performance',
    [
      { header: 'Gate', key: 'name', width: 26 },
      { header: 'Unique visitors', key: 'visitors', format: '#,##0' },
      { header: 'Net collections', key: 'collections', format: '#,##0' },
      { header: 'Registered participation', key: 'participation', format: '0.0%' },
      { header: 'Arrival cohort conversion', key: 'conversion', format: '0.0%' },
      { header: 'No entrance in period', key: 'withoutEntrance' },
      { header: 'Target participation', key: 'target', format: '0.0%' },
      { header: 'Target status', key: 'targetStatus' },
      { header: 'Attempts', key: 'attempts' },
      { header: 'Successful attempts', key: 'successAttempts' },
      { header: 'Scan success', key: 'successRate', format: '0.0%' },
      { header: 'Already collected', key: 'duplicates' },
      { header: 'Rejected', key: 'denied' },
      { header: 'Manual successes', key: 'overrides' },
      { header: 'Undone successes', key: 'undos' },
      {
        header: 'Peak 15 min start (UTC)',
        key: 'peakStart',
        width: 26,
        format: 'yyyy-mm-dd hh:mm:ss',
      },
      { header: 'Peak collections', key: 'peakCollections' },
    ],
    gateRows,
  );
  sheet(
    'Time buckets',
    [
      { header: 'Start (UTC)', key: 'utc', width: 25, format: 'yyyy-mm-dd hh:mm:ss' },
      { header: 'End (UTC)', key: 'endUtc', width: 25, format: 'yyyy-mm-dd hh:mm:ss' },
      { header: 'Local interval label', key: 'label', width: 30 },
      { header: 'New arrivals', key: 'arrivals' },
      { header: 'Cumulative period arrivals', key: 'cumulativeArrivals' },
      { header: 'Net collections', key: 'collections' },
      { header: 'Attempts', key: 'attempts' },
      ...r.gates.map((g) => ({ header: g.name, key: g.id, width: 22 })),
    ],
    r.buckets.map((b) => ({
      ...b,
      utc: dt(b.start),
      endUtc: dt(b.end),
      ...Object.fromEntries(r.gates.map((g) => [g.id, b.gates[g.id] ?? 0])),
    })),
  );
  sheet(
    'Gate hour heatmap',
    [
      { header: 'Gate', key: 'gate', width: 28 },
      { header: 'Local hour of day', key: 'hour' },
      { header: 'Net collections', key: 'collections' },
    ],
    r.heatmap.map((h) => ({ ...h, gate: gateName(h.gateId) })),
  );
  sheet(
    'Transitions',
    [
      { header: 'From gate', key: 'from', width: 28 },
      { header: 'To gate', key: 'to', width: 28 },
      { header: 'People', key: 'people' },
      { header: 'Median elapsed minutes', key: 'medianMinutes', format: '0.0' },
      { header: 'P90 elapsed minutes', key: 'p90Minutes', format: '0.0' },
    ],
    r.transitions.map((t) => ({ ...t, from: gateName(t.from), to: gateName(t.to) })),
  );
  sheet(
    'Funnel',
    [
      { header: 'Ordered gate', key: 'name', width: 28 },
      { header: 'Sequential visitors', key: 'people' },
      { header: 'From previous step', key: 'previous', format: '0.0%' },
      { header: 'From first step', key: 'start', format: '0.0%' },
    ],
    r.funnel.map((f) => ({
      ...f,
      previous: pct(f.fromPreviousPercent),
      start: pct(f.fromStartPercent),
    })),
  );
  for (const [name, rows] of [
    ['Ticket segments', r.segments.ticketTypes],
    ['Company segments', r.segments.companies],
  ] as const)
    sheet(
      name,
      [
        { header: 'Segment', key: 'name', width: 30 },
        { header: 'Registered', key: 'registered' },
        { header: 'Arrivals', key: 'arrived' },
        { header: 'Attendance', key: 'rate', format: '0.0%' },
        { header: 'Any selected gate visitors', key: 'visitors' },
        ...r.gates.map((g) => ({ header: g.name, key: g.id })),
      ],
      rows.map((s) => ({
        ...s,
        rate: pct(s.attendancePercent),
        ...Object.fromEntries(r.gates.map((g) => [g.id, s.gateVisitors[g.id] ?? 0])),
      })),
    );
  sheet(
    'Participants',
    [
      { header: 'Participant ID', key: 'id', width: 38 },
      { header: 'Name', key: 'fullName', width: 28 },
      { header: 'Email', key: 'email', width: 32 },
      { header: 'Ticket type', key: 'ticketType' },
      { header: 'Company', key: 'company', width: 28 },
      { header: 'Active', key: 'active' },
      { header: 'First arrival (UTC)', key: 'arrival', width: 26, format: 'yyyy-mm-dd hh:mm:ss' },
      { header: 'Visited gates in period', key: 'completed', width: 40 },
      { header: 'Net collections', key: 'collections' },
      { header: 'Attempts', key: 'attempts' },
    ],
    r.participants.map((p) => ({
      ...p,
      arrival: dt(p.arrivedAt),
      completed: p.completedGateIds.map(gateName).join(', '),
    })),
  );
  const pv = new Map<string, typeof r.visits>();
  for (const v of r.visits) {
    const key = `${v.participantId}:${v.gateId}`;
    const list = pv.get(key) ?? [];
    list.push(v);
    pv.set(key, list);
  }
  sheet(
    'Participant gate status',
    [
      { header: 'Participant ID', key: 'id', width: 38 },
      { header: 'Name', key: 'name', width: 28 },
      { header: 'Email', key: 'email', width: 32 },
      { header: 'Gate', key: 'gate', width: 26 },
      { header: 'Visited in period', key: 'visited' },
      { header: 'Net collections', key: 'collections' },
      { header: 'First visit (UTC)', key: 'first', width: 25, format: 'yyyy-mm-dd hh:mm:ss' },
    ],
    r.participants.flatMap((p) =>
      r.gates.map((g) => {
        const rows = pv.get(`${p.id}:${g.id}`) ?? [];
        return {
          id: p.id,
          name: p.fullName,
          email: p.email,
          gate: g.name,
          visited: rows.length > 0,
          collections: rows.length,
          first: dt(rows[0]?.time ?? null),
        };
      }),
    ),
  );
  sheet(
    'Journey audit',
    [
      { header: 'Operation ID', key: 'operationId', width: 38 },
      { header: 'Participant ID', key: 'participantId', width: 38 },
      { header: 'Name', key: 'name', width: 28 },
      { header: 'Email', key: 'email', width: 32 },
      { header: 'Gate', key: 'gate', width: 26 },
      { header: 'Result', key: 'status' },
      { header: 'Message', key: 'message', width: 45 },
      { header: 'Analysis time (UTC)', key: 'analysis', width: 26, format: 'yyyy-mm-dd hh:mm:ss' },
      { header: 'Server time (UTC)', key: 'server', width: 26, format: 'yyyy-mm-dd hh:mm:ss' },
      { header: 'Device capture (UTC)', key: 'capture', width: 26, format: 'yyyy-mm-dd hh:mm:ss' },
      { header: 'Manual', key: 'manual' },
      { header: 'Reason', key: 'reason', width: 40 },
      { header: 'Undone at (UTC)', key: 'undone', width: 26, format: 'yyyy-mm-dd hh:mm:ss' },
      { header: 'Undo reason', key: 'undoReason', width: 40 },
      { header: 'Undo admin', key: 'undoActorEmail', width: 32 },
      { header: 'Undo admin ID', key: 'undoneBy', width: 38 },
      { header: 'Reset batch ID', key: 'resetId', width: 38 },
      { header: 'Device ID', key: 'deviceId', width: 38 },
      { header: 'Admin actor ID', key: 'actorId', width: 38 },
    ],
    r.scans.map((s) => ({
      ...s,
      name: s.participantId ? (person.get(s.participantId)?.fullName ?? 'Unknown') : 'Unknown pass',
      email: s.participantId ? (person.get(s.participantId)?.email ?? '') : '',
      gate: gateName(s.gateId),
      analysis: dt(s.time),
      server: dt(s.serverTime),
      capture: dt(s.captureTime),
      undone: dt(s.undoneAt),
    })),
  );
  sheet(
    'Exceptions',
    [
      { header: 'Reason / category', key: 'reason', width: 65 },
      { header: 'Attempts', key: 'count' },
    ],
    r.exceptions,
  );
  sheet(
    'Devices',
    [
      { header: 'Device', key: 'name', width: 28 },
      { header: 'Gate', key: 'gate', width: 26 },
      { header: 'Revoked', key: 'revoked' },
      { header: 'Last seen (UTC)', key: 'last', width: 26, format: 'yyyy-mm-dd hh:mm:ss' },
      { header: 'Attempts', key: 'attempts' },
      { header: 'Successful attempts', key: 'success' },
      { header: 'Already collected', key: 'duplicates' },
      { header: 'Rejected', key: 'denied' },
      { header: 'Success rate', key: 'rate', format: '0.0%' },
    ],
    r.devices.map((d) => ({
      ...d,
      gate: gateName(d.gateId),
      last: dt(d.lastSeen),
      rate: pct(d.successPercent),
    })),
  );
  sheet(
    'Definitions',
    [
      { header: 'Topic', key: 'topic', width: 35 },
      { header: 'Definition / observation', key: 'detail', width: 110 },
    ],
    [
      ...r.quality.notes.map((detail, i) => ({ topic: `Definition ${i + 1}`, detail })),
      { topic: 'Clock fallbacks', detail: r.quality.captureFallbacks },
      { topic: 'Device capture times used', detail: r.quality.captureTimesUsed },
      { topic: 'Unassigned pass attempts', detail: r.quality.unknownPassAttempts },
      { topic: 'Ambiguous first-visit transitions', detail: r.quality.ambiguousTransitions },
      {
        topic: 'Median capture-to-confirmation seconds',
        detail: r.quality.medianCaptureDelaySeconds,
      },
      { topic: 'P90 capture-to-confirmation seconds', detail: r.quality.p90CaptureDelaySeconds },
      ...r.insights.map((i) => ({ topic: i.title, detail: i.detail })),
    ],
  );
  return Buffer.from(await wb.xlsx.writeBuffer());
}
