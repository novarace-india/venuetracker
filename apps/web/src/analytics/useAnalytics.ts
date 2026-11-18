import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import type { AnalyticsDashboard, AnalyticsFilters } from '@gatecheck/shared';
import { api, message } from '../api';
export const defaultFilters: AnalyticsFilters = {
  cohort: 'all',
  q: '',
  gateIds: [],
  route: [],
  timeBasis: 'server',
  bucketMinutes: 60,
};
export function filterQuery(filters: AnalyticsFilters) {
  const p = new URLSearchParams();
  for (const [key, v] of Object.entries(filters)) {
    if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) continue;
    p.set(key, Array.isArray(v) ? v.join(',') : String(v));
  }
  return p;
}
export function useAnalytics(eventId: string, filters: AnalyticsFilters) {
  const [data, setData] = useState<AnalyticsDashboard | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0);
  const query = useMemo(() => filterQuery(filters).toString(), [filters]);
  const previousSelection = useRef('');
  useEffect(() => {
    let active = true,
      inFlight = false;
    const controller = new AbortController();
    const key = eventId + query;
    if (previousSelection.current !== key) setData(null);
    previousSelection.current = key;
    setLoading(true);
    setError('');
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const next = await api<AnalyticsDashboard>(`/events/${eventId}/analytics?${query}`, {
          signal: controller.signal,
        });
        if (active) {
          setData(next);
          setError('');
        }
      } catch (e) {
        if (active && !controller.signal.aborted) setError(message(e));
      } finally {
        inFlight = false;
        if (active) setLoading(false);
      }
    };
    void load();
    const timer = setInterval(() => void load(), 15000);
    return () => {
      active = false;
      clearInterval(timer);
      controller.abort();
    };
  }, [eventId, query, revision]);
  return { data, error, loading, query, refresh: useCallback(() => setRevision((v) => v + 1), []) };
}
export async function downloadReport(
  eventId: string,
  format: 'xlsx' | 'pdf',
  filters: AnalyticsFilters,
) {
  const response = await fetch(
    `/api/events/${eventId}/analytics/export/${format}?${filterQuery(filters)}`,
    { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(120000) },
  );
  if (!response.ok) {
    const value = await response
      .json()
      .catch(() => ({ error: `Export failed (${response.status})` }));
    throw new Error(value.error);
  }
  const blob = await response.blob(),
    url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `NovaRace-Flow-analytics-${new Date().toISOString().slice(0, 10)}.${format}`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
