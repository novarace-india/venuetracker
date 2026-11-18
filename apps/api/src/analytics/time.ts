import { DateTime } from 'luxon';
import type {
  AnalyticsFilters,
  AnalyticsVisit,
  AnalyticsScan,
  TimeBucket,
} from '@gatecheck/shared';
import { HttpError } from '../scans.js';
export function inWindow(time: string, filters: AnalyticsFilters) {
  const value = Date.parse(time);
  return (
    (!filters.from || value >= Date.parse(filters.from)) &&
    (!filters.to || value < Date.parse(filters.to))
  );
}
export function bucketStart(time: string, zone: string, minutes: number) {
  const d = DateTime.fromISO(time, { zone });
  return (
    minutes >= 1440
      ? d.startOf('day')
      : minutes === 60
        ? d.startOf('hour')
        : d.set({ minute: Math.floor(d.minute / 15) * 15, second: 0, millisecond: 0 })
  )
    .toUTC()
    .toISO()!;
}
export function localLabel(time: string, zone: string) {
  return DateTime.fromISO(time, { zone }).toFormat('dd LLL HH:mm ZZZZ');
}
export function makeBuckets(
  visits: AnalyticsVisit[],
  scans: AnalyticsScan[],
  arrivals: Map<string, string>,
  filters: AnalyticsFilters,
  zone: string,
) {
  const times = [
    ...visits.map((v) => Date.parse(v.time)),
    ...scans.map((s) => Date.parse(s.time)),
    ...Array.from(arrivals.values(), (t) => Date.parse(t)),
  ];
  if (!times.length) return { buckets: [] as TimeBucket[], minutes: filters.bucketMinutes };
  let low = filters.from ? Date.parse(filters.from) : Math.min(...times.slice(0, 10000)),
    high = filters.to ? Date.parse(filters.to) - 1 : Math.max(...times.slice(0, 10000));
  // Avoid spreading an event-sized array onto the JS call stack.
  if (!filters.from) for (const t of times) low = Math.min(low, t);
  if (!filters.to) for (const t of times) high = Math.max(high, t);
  let minutes: number = filters.bucketMinutes;
  if ((high - low) / 60000 / minutes > 2048) minutes = minutes === 15 ? 60 : 1440;
  if ((high - low) / 60000 / minutes > 2048) minutes = 1440;
  if ((high - low) / 86400000 > 10000)
    throw new HttpError(400, 'Select a shorter date range (maximum 10,000 daily buckets)');
  const buckets: TimeBucket[] = [];
  const map = new Map<string, TimeBucket>();
  let cursor = DateTime.fromISO(bucketStart(new Date(low).toISOString(), zone, minutes), { zone });
  const end = Date.parse(bucketStart(new Date(high).toISOString(), zone, minutes));
  while (cursor.toMillis() <= end) {
    const start = cursor.toUTC().toISO()!;
    const b = {
      start,
      end: (minutes >= 1440 ? cursor.plus({ days: 1 }) : cursor.plus({ minutes })).toUTC().toISO()!,
      label: cursor.toFormat(minutes >= 1440 ? 'dd LLL yyyy' : 'dd LLL HH:mm ZZZZ'),
      arrivals: 0,
      cumulativeArrivals: 0,
      collections: 0,
      attempts: 0,
      gates: {},
    };
    buckets.push(b);
    map.set(start, b);
    cursor = minutes >= 1440 ? cursor.plus({ days: 1 }) : cursor.plus({ minutes });
  }
  for (const v of visits) {
    const b = map.get(bucketStart(v.time, zone, minutes));
    if (b) {
      b.collections++;
      b.gates[v.gateId] = (b.gates[v.gateId] ?? 0) + 1;
    }
  }
  for (const s of scans) {
    const b = map.get(bucketStart(s.time, zone, minutes));
    if (b) b.attempts++;
  }
  for (const t of arrivals.values()) {
    const b = map.get(bucketStart(t, zone, minutes));
    if (b) b.arrivals++;
  }
  let cumulative = 0;
  for (const b of buckets) {
    cumulative += b.arrivals;
    b.cumulativeArrivals = cumulative;
  }
  return { buckets, minutes };
}
export function peak(visits: Pick<AnalyticsVisit, 'time'>[], zone: string) {
  const groups = new Map<string, number>();
  for (const v of visits) {
    const key = bucketStart(v.time, zone, 15);
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  const rows = Array.from(groups, ([start, collections]) => ({ start, collections })).sort(
    (a, b) => b.collections - a.collections || a.start.localeCompare(b.start),
  );
  return rows[0] ?? null;
}
export function localHour(time: string, zone: string) {
  return DateTime.fromISO(time, { zone }).hour;
}
export function quantile(values: number[], q: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const p = (sorted.length - 1) * q;
  const l = Math.floor(p),
    f = p - l;
  return Math.round((sorted[l] + ((sorted[l + 1] ?? sorted[l]) - sorted[l]) * f) * 10) / 10;
}
export const percent = (numerator: number, denominator: number): number | null =>
  denominator ? Math.round((numerator / denominator) * 1000) / 10 : null;
