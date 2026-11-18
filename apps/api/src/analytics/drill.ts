import type { AnalyticsReport } from '@gatecheck/shared';
import type { Snapshot } from './snapshot.js';
import { selectTime, visitFromRecord } from './snapshot.js';
import { inWindow, localHour } from './time.js';
export function transitionPeople(
  snapshot: Snapshot,
  report: AnalyticsReport,
  from: string,
  to: string,
) {
  const allowed = new Set(report.participants.map((p) => p.id));
  const visits = snapshot.records
    .filter((r) => r.collectionId && !r.undoneAt && r.participantId && allowed.has(r.participantId))
    .map((r) => visitFromRecord({ ...r, time: selectTime(r, report.filters.timeBasis).time }))
    .filter((v) => inWindow(v.time, report.filters))
    .sort((a, b) => a.time.localeCompare(b.time));
  const groups = new Map<string, typeof visits>();
  for (const v of visits) {
    const list = groups.get(v.participantId) ?? [];
    list.push(v);
    groups.set(v.participantId, list);
  }
  const ids = new Set<string>();
  for (const [id, rows] of groups) {
    const seen = new Set<string>();
    const first = rows.filter((v) => {
      if (seen.has(v.gateId)) return false;
      seen.add(v.gateId);
      return true;
    });
    const counts = new Map<string, number>();
    for (const v of first) counts.set(v.time, (counts.get(v.time) ?? 0) + 1);
    for (let i = 1; i < first.length; i++)
      if (
        first[i - 1].gateId === from &&
        first[i].gateId === to &&
        counts.get(first[i - 1].time) === 1 &&
        counts.get(first[i].time) === 1
      )
        ids.add(id);
  }
  return ids;
}
export function funnelPeople(snapshot: Snapshot, report: AnalyticsReport, stage: number) {
  const route = report.filters.route.slice(0, stage + 1);
  const allowed = new Set(report.participants.map((p) => p.id));
  const visits = snapshot.records
    .filter((r) => r.collectionId && !r.undoneAt && r.participantId && allowed.has(r.participantId))
    .map((r) => visitFromRecord({ ...r, time: selectTime(r, report.filters.timeBasis).time }))
    .filter((v) => inWindow(v.time, report.filters))
    .sort((a, b) => a.time.localeCompare(b.time));
  const states = new Map<string, { index: number; last: number }>();
  const ids = new Set<string>();
  for (const v of visits) {
    const state = states.get(v.participantId) ?? { index: 0, last: -Infinity };
    const time = Date.parse(v.time);
    if (v.gateId === route[state.index] && time > state.last) {
      state.index++;
      state.last = time;
      if (state.index === route.length) ids.add(v.participantId);
    }
    states.set(v.participantId, state);
  }
  return ids;
}
export function hourPeople(report: AnalyticsReport, hour: number, gateId?: string) {
  return new Set(
    report.visits
      .filter(
        (v) =>
          (!gateId || v.gateId === gateId) && localHour(v.time, report.event.timezone) === hour,
      )
      .map((v) => v.participantId),
  );
}
