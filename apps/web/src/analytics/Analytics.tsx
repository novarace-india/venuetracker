import { useState, useRef } from 'react';
import { DateTime } from 'luxon';
import {
  Download,
  Settings2,
  RefreshCw,
  Users,
  DoorOpen,
  ScanLine,
  TrendingUp,
  ArrowUpRight,
  ChevronDown,
} from 'lucide-react';
import type { AnalyticsFilters, AnalyticsDashboard } from '@gatecheck/shared';
import type { Event } from '../types';
import { message, formatTime } from '../api';
import { Badge, Empty } from '../components';
import { defaultFilters, useAnalytics, downloadReport } from './useAnalytics';
import {
  ChartCard,
  AttendanceRing,
  ArrivalChart,
  ParticipationChart,
  ThroughputChart,
  Heatmap,
  FlowChart,
  SegmentChart,
  FunnelChart,
  pct,
  type Drill,
} from './Charts';
import { AnalyticsSettings } from './Settings';
import { JourneyExplorer } from './Journeys';
import './analytics.css';
export default function Analytics({ event }: { event: Event }) {
  const [filters, setFilters] = useState<AnalyticsFilters>(defaultFilters),
    [view, setView] = useState<'leadership' | 'operations' | 'journeys'>('leadership'),
    [drill, setDrill] = useState<Drill>({}),
    [settings, setSettings] = useState(false),
    [downloading, setDownloading] = useState(''),
    [localError, setLocalError] = useState('');
  const { data, error, loading, refresh } = useAnalytics(event.id, filters);
  const previousOptions = useRef<AnalyticsDashboard | null>(null);
  if (data) previousOptions.current = data;
  const options = data ?? previousOptions.current;
  const update = (patch: Partial<AnalyticsFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setDrill({});
    setLocalError('');
  };
  const onDrill = (next: Drill) => {
    setDrill(next);
    setView('journeys');
  };
  async function download(format: 'xlsx' | 'pdf') {
    setDownloading(format);
    setLocalError('');
    try {
      await downloadReport(event.id, format, filters);
    } catch (e) {
      setLocalError(message(e));
    } finally {
      setDownloading('');
    }
  }
  function setDate(key: 'from' | 'to', value: string) {
    if (!value) {
      update({ [key]: undefined });
      return;
    }
    const dt = DateTime.fromISO(value, { zone: event.timezone });
    if (!dt.isValid || dt.toFormat("yyyy-MM-dd'T'HH:mm") !== value) {
      setLocalError(
        'Choose a valid event-local date and time. The selected time may not exist during a daylight-saving change.',
      );
      return;
    }
    update({ [key]: dt.toUTC().toISO()! });
  }
  const inspectInterval = (index: number) => {
    if (!data) return;
    const bucket = data.buckets[index];
    const next =
      data.buckets[index + 1]?.start ??
      DateTime.fromISO(bucket.start, { zone: event.timezone })
        .plus(
          data.effectiveBucketMinutes >= 1440
            ? { days: 1 }
            : { minutes: data.effectiveBucketMinutes },
        )
        .toUTC()
        .toISO()!;
    update({
      from: new Date(
        Math.max(Date.parse(bucket.start), filters.from ? Date.parse(filters.from) : -Infinity),
      ).toISOString(),
      to: new Date(
        Math.min(Date.parse(next), filters.to ? Date.parse(filters.to) : Infinity),
      ).toISOString(),
    });
  };
  const localValue = (value: string | undefined) =>
    value ? DateTime.fromISO(value, { zone: event.timezone }).toFormat("yyyy-MM-dd'T'HH:mm") : '';
  return (
    <div className="analytics-root">
      <div className="analytics-toolbar">
        <div className="analytics-tabs" role="tablist" aria-label="Analytics views">
          {[
            ['leadership', 'Leadership overview'],
            ['operations', 'Gate operations'],
            ['journeys', 'Participant journeys'],
          ].map(([id, label]) => (
            <button
              role="tab"
              aria-selected={view === id}
              className={view === id ? 'selected' : ''}
              key={id}
              onClick={() => setView(id as typeof view)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="actions">
          <button disabled={!data} onClick={() => setSettings(true)}>
            <Settings2 size={15} /> Definitions & targets
          </button>
          <button disabled={!!downloading || !data} onClick={() => void download('xlsx')}>
            <Download size={15} />
            {downloading === 'xlsx' ? 'Preparing…' : 'Excel report'}
          </button>
          <button
            className="primary"
            disabled={!!downloading || !data}
            onClick={() => void download('pdf')}
          >
            <Download size={15} />
            {downloading === 'pdf' ? 'Preparing…' : 'PDF report'}
          </button>
        </div>
      </div>
      <section className="panel analytics-filters">
        <div className="analytics-filter-grid">
          <label className="field">
            <span>From ({event.timezone})</span>
            <input
              aria-label="Analytics from"
              type="datetime-local"
              value={localValue(filters.from)}
              onChange={(e) => setDate('from', e.target.value)}
            />
          </label>
          <label className="field">
            <span>To (exclusive)</span>
            <input
              aria-label="Analytics to"
              type="datetime-local"
              value={localValue(filters.to)}
              onChange={(e) => setDate('to', e.target.value)}
            />
          </label>
          <label className="field">
            <span>Participant cohort</span>
            <select
              aria-label="Participant cohort"
              value={filters.cohort}
              onChange={(e) => update({ cohort: e.target.value as AnalyticsFilters['cohort'] })}
            >
              <option value="all">All registrations</option>
              <option value="active">Currently active</option>
              <option value="deactivated">Currently deactivated</option>
            </select>
          </label>
          <label className="field">
            <span>Ticket type</span>
            <select
              aria-label="Ticket type"
              value={filters.ticketType ?? ''}
              onChange={(e) => update({ ticketType: e.target.value || undefined })}
            >
              <option value="">All tickets</option>
              {options?.available.ticketTypes.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Company</span>
            <select
              aria-label="Company"
              value={filters.company ?? ''}
              onChange={(e) => update({ company: e.target.value || undefined })}
            >
              <option value="">All companies</option>
              <option value="__none__">Not provided</option>
              {options?.available.companies.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Time basis</span>
            <select
              aria-label="Time basis"
              value={filters.timeBasis}
              onChange={(e) =>
                update({ timeBasis: e.target.value as AnalyticsFilters['timeBasis'] })
              }
            >
              <option value="server">Server confirmation</option>
              <option value="capture">Device capture (unverified)</option>
            </select>
          </label>
          <label className="field">
            <span>Chart interval</span>
            <select
              aria-label="Chart interval"
              value={filters.bucketMinutes}
              onChange={(e) =>
                update({
                  bucketMinutes: Number(e.target.value) as AnalyticsFilters['bucketMinutes'],
                })
              }
            >
              <option value={15}>15 minutes</option>
              <option value={60}>Hourly</option>
              <option value={1440}>Daily</option>
            </select>
          </label>
        </div>
        <div className="analytics-filter-bottom">
          <details className="gate-filter">
            <summary>
              Gates: {filters.gateIds.length ? `${filters.gateIds.length} selected` : 'all'}{' '}
              <ChevronDown size={13} />
            </summary>
            <div className="gate-filter-options">
              {options?.allGates.map((g) => (
                <label className="check" key={g.id}>
                  <input
                    type="checkbox"
                    checked={!filters.gateIds.length || filters.gateIds.includes(g.id)}
                    onChange={(e) => {
                      const current = filters.gateIds.length
                        ? filters.gateIds
                        : options!.allGates.map((x) => x.id);
                      const next = e.target.checked
                        ? [...current, g.id]
                        : current.filter((id) => id !== g.id);
                      if (!next.length) {
                        setLocalError('Select at least one gate, or use Reset filters.');
                        return;
                      }
                      update({
                        gateIds: Array.from(new Set(next)),
                        route: filters.route.filter((id) => next.includes(id)),
                      });
                    }}
                  />
                  {g.name}
                </label>
              ))}
              {!options?.allGates.length && <span>No gates</span>}
            </div>
          </details>
          <span className="small muted">
            Registrations use current profiles. Dates filter activity.
          </span>
          <button
            className="text-button"
            onClick={() => {
              setFilters(defaultFilters);
              setDrill({});
            }}
          >
            Reset filters
          </button>
          <button className="icon-button" aria-label="Refresh analytics" onClick={refresh}>
            <RefreshCw size={16} />
          </button>
        </div>
      </section>
      {(error || localError) && (
        <div className="alert error" role="alert">
          {localError || error}
          {data ? ' Displaying the last successful snapshot.' : ''}
        </div>
      )}
      {loading && !data && <Empty>Calculating the selected event snapshot…</Empty>}
      {data && (
        <>
          <div className="analytics-snapshot">
            <span className="live-label">
              <span className="status-dot" />
              Snapshot {formatTime(data.generatedAt, event.timezone)} · refreshes every 15s
            </span>
            <span>
              {data.effectiveBucketMinutes}-minute buckets ·{' '}
              {data.summary.registered.toLocaleString()} registered in cohort
            </span>
          </div>
          {!data.entranceGateId && (
            <div className="analytics-setup">
              <DoorOpen size={24} />
              <div>
                <strong>Choose the entrance gate to measure attendance</strong>
                <p>
                  Any-gate activity is available now. Attendance and arrival conversion need an
                  explicit entrance.
                </p>
              </div>
              <button onClick={() => setSettings(true)}>Set entrance gate</button>
            </div>
          )}
          {view === 'leadership' && (
            <>
              <div className="analytics-kpis">
                <KPI
                  label="Attendance in period"
                  value={pct(data.summary.attendancePercent)}
                  detail={`${data.summary.arrived ?? '—'} first arrivals / ${data.summary.registered} registered`}
                  icon={<Users size={17} />}
                  onClick={() =>
                    onDrill({ outcome: 'arrived', label: 'Entrance arrivals in period' })
                  }
                />
                <KPI
                  label="No entrance arrival in period"
                  value={data.summary.notArrived ?? '—'}
                  detail="Current cohort, selected activity window"
                  icon={<DoorOpen size={17} />}
                  onClick={() =>
                    onDrill({ outcome: 'not_arrived', label: 'No entrance arrival in period' })
                  }
                />
                <KPI
                  label="Any selected gate visitors"
                  value={data.summary.anyGateVisitors}
                  detail={`${data.summary.collections} net collections, excluding undos`}
                  icon={<ScanLine size={17} />}
                  onClick={() =>
                    onDrill({ outcome: 'visited', label: 'Any selected gate visitors' })
                  }
                />
                <KPI
                  label="Scan success"
                  value={pct(data.summary.successPercent)}
                  detail={`${data.summary.successAttempts} successful / ${data.summary.attempts} submitted attempts`}
                  icon={<TrendingUp size={17} />}
                  onClick={() => setView('operations')}
                />
              </div>
              <div className="analytics-lead-grid">
                <ChartCard
                  title="Attendance"
                  description="First effective entrance visits / registered cohort"
                >
                  <AttendanceRing data={data} onDrill={onDrill} />
                </ChartCard>
                <ChartCard
                  title="Arrival pattern"
                  action={
                    <IntervalSelect
                      data={data}
                      label="Inspect arrival interval"
                      onSelect={inspectInterval}
                    />
                  }
                  description={`First arrivals at ${data.allGates.find((g) => g.id === data.entranceGateId)?.name ?? 'the entrance'} · ${data.effectiveBucketMinutes}-minute intervals`}
                >
                  <ArrivalChart data={data} onInterval={inspectInterval} />
                  {!data.entranceGateId && (
                    <p className="small muted">
                      An entrance must be configured before arrival series can be calculated.
                    </p>
                  )}
                </ChartCard>
              </div>
              <div className="analytics-two-col">
                <ChartCard
                  title="Gate participation"
                  description="Unique visitors as a percentage of the registered cohort. Select a bar to inspect participants."
                >
                  <ParticipationChart gates={data.gates} onDrill={onDrill} />
                </ChartCard>
                <ChartCard
                  title="What the data calls for"
                  description="Observations from this snapshot; investigate context before taking action."
                >
                  <div className="analytics-insights">
                    {data.insights.map((i, index) => (
                      <article key={index} className={i.level}>
                        <span>{i.level === 'attention' ? 'Review' : 'Observed'}</span>
                        <h3>{i.title}</h3>
                        <p>{i.detail}</p>
                      </article>
                    ))}
                  </div>
                </ChartCard>
              </div>
              <div className="analytics-two-col">
                <ChartCard
                  title="Attendance by ticket type"
                  description="Top 10 groups by current registrations. Select a bar to filter this report."
                >
                  <SegmentChart
                    segments={data.segments.ticketTypes}
                    onSelect={(name) => update({ ticketType: name })}
                  />
                </ChartCard>
                <ChartCard
                  title="Attendance by company"
                  description="Top 10 groups by current registrations. Complete tables are available in Excel."
                >
                  <SegmentChart
                    segments={data.segments.companies}
                    onSelect={(name) =>
                      update({ company: name === 'Not provided' ? '__none__' : name })
                    }
                  />
                </ChartCard>
              </div>
              <FlowSection data={data} onDrill={onDrill} />
              <RouteSection
                data={data}
                route={filters.route}
                onChange={(route) => update({ route })}
                onDrill={onDrill}
              />
            </>
          )}
          {view === 'operations' && (
            <>
              <div className="analytics-kpis">
                <KPI
                  label="Net collections"
                  value={data.summary.collections}
                  detail="Undone collections excluded"
                  icon={<ScanLine size={17} />}
                  onClick={() =>
                    onDrill({ outcome: 'visited', label: 'Net collection participants' })
                  }
                />
                <KPI
                  label="Rejected attempts"
                  value={data.summary.denied}
                  detail="Invalid, inactive or gate rule rejections"
                  icon={<DoorOpen size={17} />}
                  onClick={() =>
                    onDrill({ outcome: 'denied', label: 'Participants with rejected attempts' })
                  }
                />
                <KPI
                  label="Already collected"
                  value={data.summary.duplicates}
                  detail="Repeated collection attempts"
                  icon={<RefreshCw size={17} />}
                  onClick={() =>
                    onDrill({
                      outcome: 'duplicate',
                      label: 'Participants with already-collected attempts',
                    })
                  }
                />
                <KPI
                  label="Manual successes / undos"
                  value={`${data.summary.overrides} / ${data.summary.undos}`}
                  detail="Audited exceptions; successful attempts can later be undone"
                  icon={<Settings2 size={17} />}
                  onClick={() =>
                    onDrill({ outcome: 'override', label: 'Participants with manual successes' })
                  }
                />
              </div>
              <ChartCard
                title="Counter demand over time"
                action={
                  <IntervalSelect
                    data={data}
                    label="Inspect demand interval"
                    onSelect={inspectInterval}
                  />
                }
                description={`Net collections per ${data.effectiveBucketMinutes}-minute interval. Peaks reflect recorded activity, not measured queue length.`}
              >
                <ThroughputChart data={data} onInterval={inspectInterval} />
              </ChartCard>
              <ChartCard
                title="Gate demand by local hour"
                description={`Aggregated across selected dates in ${event.timezone}. Select a cell to inspect visitors.`}
              >
                <Heatmap data={data} onDrill={onDrill} />
              </ChartCard>
              <ChartCard
                title="Gate performance scorecard"
                description="Participation and successful scan rate measure different things. Targets compare participation with current settings."
              >
                <div className="scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Gate</th>
                        <th>Visitors / net collections</th>
                        <th>Registered participation</th>
                        <th>Arrival conversion</th>
                        <th>Scan success</th>
                        <th>Exceptions</th>
                        <th>Participation target</th>
                        <th>Peak 15 minutes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.gates.map((g) => (
                        <tr key={g.id}>
                          <td>
                            <button
                              className="person-button"
                              onClick={() =>
                                onDrill({ gateId: g.id, outcome: 'visited', label: g.name })
                              }
                            >
                              {g.name}
                            </button>
                          </td>
                          <td>
                            {g.visitors} / {g.collections}
                          </td>
                          <td>
                            {pct(g.participationPercent)}
                            <small>
                              {g.visitors} / {data.summary.registered} registered
                            </small>
                          </td>
                          <td>
                            {pct(g.attendeeConversionPercent)}
                            <small>
                              {g.arrivedVisitors} arrival-cohort visitors
                              {data.entranceGateId
                                ? ` · ${g.withoutEntrance} without entrance arrival in period`
                                : ''}
                            </small>
                          </td>
                          <td>
                            {pct(g.successPercent)}
                            <small>
                              {g.successAttempts} / {g.attempts} attempts
                            </small>
                          </td>
                          <td>
                            {g.duplicates} repeats · {g.denied} denied
                            <small>
                              {g.overrides} manual · {g.undos} undone
                            </small>
                          </td>
                          <td>
                            {g.targetPercent === null ? (
                              'No target'
                            ) : (
                              <>
                                {pct(g.targetPercent)} <Badge status={g.targetStatus} />
                              </>
                            )}
                          </td>
                          <td>
                            {g.peak ? (
                              <>
                                {g.peak.collections} net collections
                                <small>{formatTime(g.peak.start, event.timezone)}</small>
                              </>
                            ) : (
                              'No activity'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ChartCard>
              <div className="analytics-two-col">
                <ChartCard
                  title="Exceptions requiring review"
                  description="Categories may overlap: a manual success can also be undone."
                >
                  <div className="exception-bars">
                    {data.exceptions.map((e) => (
                      <button
                        key={e.reason}
                        onClick={() => onDrill({ reason: e.reason, label: e.reason })}
                      >
                        <span>{e.reason}</span>
                        <div>
                          <i
                            style={{
                              width: `${(e.count / Math.max(1, ...data.exceptions.map((x) => x.count))) * 100}%`,
                            }}
                          />
                        </div>
                        <b>{e.count}</b>
                      </button>
                    ))}
                    {!data.exceptions.length && <Empty>No exceptions in this selection.</Empty>}
                  </div>
                  <p className="small muted">
                    {data.quality.unknownPassAttempts} attempts have no matched participant. They
                    appear in audit exports, not participant drill-downs. They are excluded from
                    participant-specific cohorts.
                  </p>
                </ChartCard>
                <ChartCard
                  title="Submission timing"
                  description="Device clocks are unverified. These delays are not measured network latency."
                >
                  <div className="timing-metrics">
                    <div>
                      <strong>
                        {data.quality.medianCaptureDelaySeconds === null
                          ? '—'
                          : `${data.quality.medianCaptureDelaySeconds}s`}
                      </strong>
                      <span>Median capture to confirmation</span>
                    </div>
                    <div>
                      <strong>
                        {data.quality.p90CaptureDelaySeconds === null
                          ? '—'
                          : `${data.quality.p90CaptureDelaySeconds}s`}
                      </strong>
                      <span>P90 capture to confirmation</span>
                    </div>
                  </div>
                  <p className="small muted">
                    {data.quality.captureTimesUsed} device capture timestamps used ·{' '}
                    {data.quality.captureFallbacks} fell back to server confirmation.
                  </p>
                  <p className="small muted">
                    Scans queued on disconnected tablets remain invisible centrally until submitted.
                    Last-seen times do not establish pending queue counts.
                  </p>
                </ChartCard>
              </div>
              <ChartCard
                title="Tablet activity"
                description="Last seen indicates a heartbeat, not queue completion or device failure."
              >
                <div className="scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Tablet</th>
                        <th>Gate</th>
                        <th>Attempts</th>
                        <th>Scan success</th>
                        <th>Exceptions</th>
                        <th>Last seen</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.devices.map((d) => (
                        <tr key={d.id}>
                          <td>{d.name}</td>
                          <td>{data.allGates.find((g) => g.id === d.gateId)?.name}</td>
                          <td>{d.attempts}</td>
                          <td>{pct(d.successPercent)}</td>
                          <td>
                            {d.denied} denied · {d.duplicates} repeats
                          </td>
                          <td>{formatTime(d.lastSeen, event.timezone)}</td>
                          <td>
                            <Badge status={d.revoked ? 'revoked' : 'paired'} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!data.devices.length && <Empty>No tablets assigned to the selected gates.</Empty>}
              </ChartCard>
              <FlowSection data={data} onDrill={onDrill} />
            </>
          )}
          {view === 'journeys' && (
            <JourneyExplorer
              onChanged={refresh}
              key={JSON.stringify(drill)}
              eventId={event.id}
              data={data}
              filters={filters}
              drill={drill}
              onClear={() => setDrill({})}
            />
          )}
          <details className="panel metric-definitions">
            <summary>Metric definitions, denominators & data limitations</summary>
            {data.quality.notes.map((n, i) => (
              <p className="small muted" key={i}>
                {n}
              </p>
            ))}
          </details>
          {settings && (
            <AnalyticsSettings
              eventId={event.id}
              data={data}
              onClose={() => setSettings(false)}
              onSaved={refresh}
            />
          )}
        </>
      )}
    </div>
  );
}
function KPI({
  label,
  value,
  detail,
  icon,
  onClick,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button className="analytics-kpi" onClick={onClick}>
      <span className="kpi-label">
        {label}
        {icon}
      </span>
      <strong>{typeof value === 'number' ? value.toLocaleString() : value}</strong>
      <small>{detail}</small>
      <ArrowUpRight size={14} className="kpi-arrow" />
    </button>
  );
}
function FlowSection({ data, onDrill }: { data: AnalyticsDashboard; onDrill: (d: Drill) => void }) {
  return (
    <ChartCard
      title="Observed first-visit flow"
      description="Each link counts participants moving between consecutive first visits. This is an observed route, not proof of a physical queue."
    >
      <p className="flow-mobile-hint small muted">Swipe to view the complete flow diagram.</p>
      <FlowChart data={data} onDrill={onDrill} />
      {data.transitions.length > 0 && (
        <details className="flow-details">
          <summary>Transition counts & elapsed time</summary>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>From</th>
                  <th>To</th>
                  <th>People</th>
                  <th>Median elapsed</th>
                  <th>P90 elapsed</th>
                </tr>
              </thead>
              <tbody>
                {data.transitions.map((t) => (
                  <tr key={`${t.from}:${t.to}`}>
                    <td>{data.allGates.find((g) => g.id === t.from)?.name}</td>
                    <td>{data.allGates.find((g) => g.id === t.to)?.name}</td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() =>
                          onDrill({
                            transitionFrom: t.from,
                            transitionTo: t.to,
                            label: 'Observed transition participants',
                          })
                        }
                      >
                        {t.people}
                      </button>
                    </td>
                    <td>{t.medianMinutes} min</td>
                    <td>{t.p90Minutes} min</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      <p className="small muted">
        Elapsed time is not queue or service duration. {data.quality.ambiguousTransitions} ambiguous
        transition pairs omitted because simultaneous visits have no inferred order.
      </p>
    </ChartCard>
  );
}
function RouteSection({
  data,
  route,
  onChange,
  onDrill,
}: {
  data: AnalyticsDashboard;
  route: string[];
  onChange: (route: string[]) => void;
  onDrill: (d: Drill) => void;
}) {
  return (
    <ChartCard
      title="Sequential journey completion"
      description="Choose gates in the intended order. This funnel counts ordered visits within the selected period, not arbitrary gate popularity."
    >
      <div className="route-builder">
        {route.map((id, i) => (
          <span key={id}>
            {i + 1}. {data.allGates.find((g) => g.id === id)?.name}
            <button
              aria-label={`Remove route step ${i + 1}`}
              onClick={() => onChange(route.filter((v) => v !== id))}
            >
              ×
            </button>
          </span>
        ))}
        <select
          aria-label="Add funnel gate"
          value=""
          onChange={(e) => {
            if (e.target.value) onChange([...route, e.target.value]);
          }}
        >
          <option value="">Add next gate…</option>
          {data.gates
            .filter((g) => !route.includes(g.id))
            .map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
        </select>
        {route.length > 0 && (
          <button className="text-button" onClick={() => onChange([])}>
            Clear route
          </button>
        )}
      </div>
      <FunnelChart data={data} onDrill={onDrill} />
    </ChartCard>
  );
}

function IntervalSelect({
  data,
  label,
  onSelect,
}: {
  data: AnalyticsDashboard;
  label: string;
  onSelect: (index: number) => void;
}) {
  return (
    <select
      className="interval-select"
      aria-label={label}
      value=""
      onChange={(e) => {
        if (e.target.value !== '') onSelect(Number(e.target.value));
      }}
    >
      <option value="">Inspect an interval…</option>
      {data.buckets.map((b, i) => (
        <option key={b.start} value={i}>
          {formatTime(b.start, data.event.timezone)} – {formatTime(b.end, data.event.timezone)}
        </option>
      ))}
    </select>
  );
}
