import type {
  AnalyticsFilters,
  AnalyticsReport,
  AnalyticsScan,
  AnalyticsParticipant,
  AnalyticsVisit,
  SegmentMetric,
  TransitionMetric,
  FunnelStage,
} from '@gatecheck/shared';
import { HttpError } from '../scans.js';
import { type Snapshot, selectTime, visitFromRecord } from './snapshot.js';
import { inWindow, makeBuckets, peak, localHour, quantile, percent, localLabel } from './time.js';
export function aggregate(snapshot: Snapshot, filters: AnalyticsFilters): AnalyticsReport {
  const { event } = snapshot;
  const gateSet = new Set(snapshot.gates.map((g) => g.id));
  for (const id of [...filters.gateIds, ...filters.route])
    if (!gateSet.has(id)) throw new HttpError(400, 'A selected gate does not belong to this event');
  const selectedGates = snapshot.gates.filter(
    (g) => !filters.gateIds.length || filters.gateIds.includes(g.id),
  );
  const selectedIds = new Set(selectedGates.map((g) => g.id));
  if (filters.route.some((id) => !selectedIds.has(id)))
    throw new HttpError(400, 'Funnel gates must also be included in the gate filter');
  const query = filters.q.toLowerCase();
  const people = snapshot.people.filter(
    (p) =>
      (filters.cohort === 'all' || !!p.active === (filters.cohort === 'active')) &&
      (!filters.ticketType || p.ticket_type === filters.ticketType) &&
      (!filters.company ||
        (filters.company === '__none__' ? p.company === '' : p.company === filters.company)) &&
      (!filters.participantId || p.id === filters.participantId) &&
      (!query || `${p.full_name} ${p.email}`.toLowerCase().includes(query)),
  );
  const personIds = new Set(people.map((p) => p.id));
  const unassignedAllowed =
    filters.cohort === 'all' &&
    !filters.ticketType &&
    !filters.company &&
    !filters.q &&
    !filters.participantId;
  const timed = snapshot.records.map((r) => ({ ...r, ...selectTime(r, filters.timeBasis) }));
  const allVisits = timed
    .filter(
      (r) => r.collectionId && !r.undoneAt && r.participantId && personIds.has(r.participantId),
    )
    .map(visitFromRecord)
    .sort((a, b) => a.time.localeCompare(b.time));
  // Entrance calculation is deliberately independent of the selected counter filters.
  const firstEntrance = new Map<string, string>();
  for (const v of allVisits)
    if (v.gateId === snapshot.entranceGateId && !firstEntrance.has(v.participantId))
      firstEntrance.set(v.participantId, v.time);
  const arrivals = new Map(Array.from(firstEntrance).filter(([, t]) => inWindow(t, filters)));
  const arrivedIds = new Set(arrivals.keys());
  const windowVisits = allVisits.filter((v) => inWindow(v.time, filters));
  const visits = windowVisits.filter((v) => selectedIds.has(v.gateId));
  const chosenRecords = timed.filter(
    (r) =>
      selectedIds.has(r.gateId) &&
      inWindow(r.time, filters) &&
      (r.participantId ? personIds.has(r.participantId) : unassignedAllowed),
  );
  const scans: AnalyticsScan[] = chosenRecords.map(
    ({ collectionId, used, fallback, delaySeconds, ...r }) => r,
  );
  const gateVisits = new Map<string, AnalyticsVisit[]>(),
    gateScans = new Map<string, AnalyticsScan[]>(),
    personVisits = new Map<string, AnalyticsVisit[]>(),
    personScans = new Map<string, AnalyticsScan[]>();
  for (const v of visits) {
    push(gateVisits, v.gateId, v);
    push(personVisits, v.participantId, v);
  }
  for (const s of scans) {
    push(gateScans, s.gateId, s);
    if (s.participantId) push(personScans, s.participantId, s);
  }
  const gates = selectedGates.map((g) => {
    const gv = gateVisits.get(g.id) ?? [],
      gs = gateScans.get(g.id) ?? [];
    const visitorIds = new Set(gv.map((v) => v.participantId));
    const arrivedVisitors = Array.from(visitorIds).filter((id) => arrivedIds.has(id)).length;
    const participationPercent = percent(visitorIds.size, people.length);
    return {
      ...g,
      visitors: visitorIds.size,
      collections: gv.length,
      participationPercent,
      arrivedVisitors,
      attendeeConversionPercent: snapshot.entranceGateId
        ? percent(arrivedVisitors, arrivals.size)
        : null,
      withoutEntrance: visitorIds.size - arrivedVisitors,
      attempts: gs.length,
      successAttempts: gs.filter((s) => s.status === 'success').length,
      duplicates: gs.filter((s) => s.status === 'already').length,
      denied: gs.filter((s) => s.status === 'denied').length,
      overrides: gs.filter((s) => s.manual && s.status === 'success').length,
      undos: gs.filter((s) => s.undoneAt).length,
      successPercent: percent(gs.filter((s) => s.status === 'success').length, gs.length),
      targetStatus:
        g.targetPercent === null || participationPercent === null
          ? ('unrated' as const)
          : participationPercent >= g.targetPercent
            ? ('met' as const)
            : ('below' as const),
      peak: peak(gv, event.timezone),
    };
  });
  const participants: AnalyticsParticipant[] = people.map((p) => {
    const pv = personVisits.get(p.id) ?? [];
    return {
      id: p.id,
      fullName: p.full_name,
      email: p.email,
      ticketType: p.ticket_type,
      company: p.company,
      active: !!p.active,
      arrivedAt: arrivals.get(p.id) ?? null,
      completedGateIds: Array.from(new Set(pv.map((v) => v.gateId))),
      collections: pv.length,
      attempts: personScans.get(p.id)?.length ?? 0,
      lastVisitAt: pv.at(-1)?.time ?? null,
    };
  });
  const movements = movement(windowVisits, selectedIds);
  const funnel = makeFunnel(windowVisits, filters.route, snapshot);
  const buckets = makeBuckets(visits, scans, arrivals, filters, event.timezone);
  const heatCounts = new Map<string, number>();
  for (const v of visits) {
    const key = `${v.gateId}:${localHour(v.time, event.timezone)}`;
    heatCounts.set(key, (heatCounts.get(key) ?? 0) + 1);
  }
  const heatmap = gates.flatMap((g) =>
    Array.from({ length: 24 }, (_, hour) => ({
      gateId: g.id,
      hour,
      collections: heatCounts.get(`${g.id}:${hour}`) ?? 0,
    })),
  );
  const exceptions = new Map<string, number>();
  for (const s of scans) {
    if (s.status !== 'success') exceptions.set(s.message, (exceptions.get(s.message) ?? 0) + 1);
    if (s.manual && s.status === 'success')
      exceptions.set(
        'Successful manual override',
        (exceptions.get('Successful manual override') ?? 0) + 1,
      );
    if (s.undoneAt)
      exceptions.set('Undone collection', (exceptions.get('Undone collection') ?? 0) + 1);
  }
  const deviceScans = new Map<string, AnalyticsScan[]>();
  for (const s of scans) if (s.deviceId) push(deviceScans, s.deviceId, s);
  const devices = snapshot.devices
    .filter((d) => selectedIds.has(d.gate_id))
    .map((d) => {
      const rows = deviceScans.get(d.id) ?? [];
      const success = rows.filter((r) => r.status === 'success').length;
      return {
        id: d.id,
        name: d.name,
        gateId: d.gate_id,
        revoked: !!d.revoked,
        lastSeen: d.last_seen,
        attempts: rows.length,
        success,
        denied: rows.filter((r) => r.status === 'denied').length,
        duplicates: rows.filter((r) => r.status === 'already').length,
        successPercent: percent(success, rows.length),
      };
    });
  const delays = chosenRecords.flatMap((r) => (r.delaySeconds === null ? [] : [r.delaySeconds]));
  const arrivalPeak = snapshot.entranceGateId
    ? peak(
        Array.from(arrivals.values(), (time) => ({ time })),
        event.timezone,
      )
    : null;
  const summary = {
    registered: people.length,
    active: people.filter((p) => p.active).length,
    deactivated: people.filter((p) => !p.active).length,
    arrived: snapshot.entranceGateId ? arrivals.size : null,
    attendancePercent: snapshot.entranceGateId ? percent(arrivals.size, people.length) : null,
    notArrived: snapshot.entranceGateId ? people.length - arrivals.size : null,
    anyGateVisitors: new Set(visits.map((v) => v.participantId)).size,
    collections: visits.length,
    attempts: scans.length,
    successAttempts: scans.filter((s) => s.status === 'success').length,
    duplicates: scans.filter((s) => s.status === 'already').length,
    denied: scans.filter((s) => s.status === 'denied').length,
    overrides: scans.filter((s) => s.manual && s.status === 'success').length,
    undos: scans.filter((s) => s.undoneAt).length,
    successPercent: percent(scans.filter((s) => s.status === 'success').length, scans.length),
    peak: peak(visits, event.timezone),
    arrivalPeak: arrivalPeak ? { start: arrivalPeak.start, people: arrivalPeak.collections } : null,
  };
  const notes = [
    'Registered cohort uses current participant profiles, including deactivated people when All is selected. Date filters apply to activity, not registration dates. Historical registration and eligibility snapshots are not available.',
    'Only submitted scans are visible. Offline scans still on tablets are not included. Last seen is a heartbeat, not proof of queue completion or a device fault.',
    'Net visits exclude undone collections. Scan success includes successful attempts later undone. Duplicate operation retries are already deduplicated by the scan API.',
    'Attendance counts first effective entrance visits in the selected period. Counter conversion counts visitors who also belong to that arrival cohort. Visitors without an entrance arrival in the period are shown separately.',
    'Date windows include From and exclude To. Screen labels use event timezone. Device-capture times are unverified; implausible or absent values fall back to confirmation. Capture-to-confirmation delay is not measured network latency.',
    'Flow uses the first effective visit to each gate in the period; repeated visits are excluded. Equal-time first visits have no inferred order. Inter-gate elapsed time is not queue waiting or service duration.',
    'Unknown-pass attempts cannot be assigned to a ticket, company, name or active-status cohort. They are included only for the unfiltered All cohort and remain available in its scan audit.',
    'Gate targets compare unique visitors with the registered cohort using current settings. Unvisited does not mean failed: counters may be optional, and ticket eligibility is not modeled.',
  ];
  if (buckets.minutes !== filters.bucketMinutes)
    notes.push(
      `Chart interval increased from ${filters.bucketMinutes} to ${buckets.minutes} minutes to keep the selected period readable.`,
    );
  const report: AnalyticsReport = {
    event,
    generatedAt: snapshot.generatedAt,
    filters,
    entranceGateId: snapshot.entranceGateId,
    allGates: snapshot.gates,
    gates,
    available: {
      ticketTypes: Array.from(new Set(snapshot.people.map((p) => p.ticket_type))).sort(),
      companies: Array.from(new Set(snapshot.people.map((p) => p.company).filter(Boolean))).sort(),
    },
    summary,
    buckets: buckets.buckets,
    effectiveBucketMinutes: buckets.minutes,
    heatmap,
    transitions: movements.transitions,
    funnel,
    segments: {
      ticketTypes: segment(participants, (p) => p.ticketType, !!snapshot.entranceGateId),
      companies: segment(
        participants,
        (p) => p.company || 'Not provided',
        !!snapshot.entranceGateId,
      ),
    },
    exceptions: Array.from(exceptions, ([reason, count]) => ({ reason, count })).sort(
      (a, b) => b.count - a.count,
    ),
    devices,
    participants,
    scans,
    visits,
    quality: {
      unknownPassAttempts: scans.filter((s) => !s.participantId).length,
      captureFallbacks: chosenRecords.filter((r) => r.fallback).length,
      captureTimesUsed: chosenRecords.filter((r) => r.used).length,
      medianCaptureDelaySeconds: quantile(delays, 0.5),
      p90CaptureDelaySeconds: quantile(delays, 0.9),
      ambiguousTransitions: movements.ambiguous,
      notes,
    },
    insights: [],
  };
  if (!snapshot.entranceGateId)
    report.insights.push({
      level: 'attention',
      title: 'Set the entrance gate',
      detail:
        'Attendance and attendee conversion need an explicit entrance gate. Any-gate visitors are shown separately.',
    });
  if (summary.arrivalPeak)
    report.insights.push({
      level: 'info',
      title: 'Peak arrival interval',
      detail: `${summary.arrivalPeak.people} first arrivals in the 15-minute interval starting ${localLabel(summary.arrivalPeak.start, event.timezone)}. This counts people, separately from counter collections.`,
    });
  if (summary.peak)
    report.insights.push({
      level: 'info',
      title: 'Peak counter demand',
      detail: `${summary.peak.collections} net collections in the 15-minute interval starting ${localLabel(summary.peak.start, event.timezone)}. Use this observed demand when planning shifts.`,
    });
  const below = gates.filter((g) => g.targetStatus === 'below');
  if (below.length)
    report.insights.push({
      level: 'attention',
      title: 'Participation below target',
      detail: `${below.map((g) => g.name).join(', ')}. Compare timing, optional uptake and eligibility before treating this as an operational failure.`,
    });
  if (summary.denied || summary.duplicates)
    report.insights.push({
      level: 'attention',
      title: 'Review scan exceptions',
      detail: `${summary.denied} rejected and ${summary.duplicates} already-collected attempts. Inspect reasons and participants before changing gate rules.`,
    });
  const noEntrance = gates.filter((g) => g.id !== snapshot.entranceGateId && g.withoutEntrance > 0);
  if (snapshot.entranceGateId && noEntrance.length)
    report.insights.push({
      level: 'attention',
      title: 'Counter visitors outside the arrival cohort',
      detail: `${noEntrance.map((g) => `${g.name}: ${g.withoutEntrance}`).join('; ')}. Check date filters, manual overrides and entrance assignment.`,
    });
  if (!scans.length)
    report.insights.push({
      level: 'info',
      title: 'No submitted activity in this selection',
      detail:
        'Try a wider period or cohort. Pending tablet scans appear only after synchronization.',
    });
  return report;
}
function push<T>(map: Map<string, T[]>, key: string, item: T) {
  const rows = map.get(key);
  if (rows) rows.push(item);
  else map.set(key, [item]);
}
function segment(
  people: AnalyticsParticipant[],
  key: (p: AnalyticsParticipant) => string,
  hasEntrance: boolean,
): SegmentMetric[] {
  const groups = new Map<string, AnalyticsParticipant[]>();
  for (const p of people) push(groups, key(p), p);
  return Array.from(groups, ([name, rows]) => {
    const gateVisitors: Record<string, number> = {};
    for (const p of rows)
      for (const g of p.completedGateIds) gateVisitors[g] = (gateVisitors[g] ?? 0) + 1;
    const arrived = rows.filter((p) => p.arrivedAt).length;
    return {
      name,
      registered: rows.length,
      arrived,
      attendancePercent: hasEntrance ? percent(arrived, rows.length) : null,
      visitors: rows.filter((p) => p.collections).length,
      gateVisitors,
    };
  }).sort((a, b) => b.registered - a.registered || a.name.localeCompare(b.name));
}
function movement(visits: AnalyticsVisit[], selected: Set<string>) {
  const byPerson = new Map<string, AnalyticsVisit[]>();
  for (const v of visits) push(byPerson, v.participantId, v);
  const groups = new Map<string, { from: string; to: string; gaps: number[] }>();
  let ambiguous = 0;
  for (const rows of byPerson.values()) {
    const seen = new Set<string>();
    const first = rows.filter((v) => {
      if (seen.has(v.gateId)) return false;
      seen.add(v.gateId);
      return true;
    });
    // Do not invent transitions into or out of a simultaneous group of first visits.
    const timeCounts = new Map<string, number>();
    for (const v of first) timeCounts.set(v.time, (timeCounts.get(v.time) ?? 0) + 1);
    for (let i = 1; i < first.length; i++) {
      const a = first[i - 1],
        b = first[i];
      if (!selected.has(a.gateId) || !selected.has(b.gateId)) continue;
      if ((timeCounts.get(a.time) ?? 0) > 1 || (timeCounts.get(b.time) ?? 0) > 1) {
        ambiguous++;
        continue;
      }
      const key = `${a.gateId}:${b.gateId}`;
      const group = groups.get(key) ?? { from: a.gateId, to: b.gateId, gaps: [] };
      group.gaps.push((Date.parse(b.time) - Date.parse(a.time)) / 60000);
      groups.set(key, group);
    }
  }
  const transitions: TransitionMetric[] = Array.from(groups.values(), (g) => ({
    from: g.from,
    to: g.to,
    people: g.gaps.length,
    medianMinutes: quantile(g.gaps, 0.5)!,
    p90Minutes: quantile(g.gaps, 0.9)!,
  })).sort(
    (a, b) => b.people - a.people || a.from.localeCompare(b.from) || a.to.localeCompare(b.to),
  );
  return { transitions, ambiguous };
}
function makeFunnel(visits: AnalyticsVisit[], route: string[], snapshot: Snapshot): FunnelStage[] {
  if (!route.length) return [];
  const byPerson = new Map<string, AnalyticsVisit[]>();
  for (const v of visits) push(byPerson, v.participantId, v);
  const counts = route.map(() => 0);
  for (const rows of byPerson.values()) {
    let index = 0;
    let last = -Infinity;
    for (const v of rows) {
      const t = Date.parse(v.time);
      if (v.gateId === route[index] && t > last) {
        counts[index]++;
        index++;
        last = t;
        if (index === route.length) break;
      }
    }
  }
  return route.map((gateId, i) => ({
    gateId,
    name: snapshot.gates.find((g) => g.id === gateId)!.name,
    people: counts[i],
    fromPreviousPercent: i ? percent(counts[i], counts[i - 1]) : null,
    fromStartPercent: percent(counts[i], counts[0]),
  }));
}
