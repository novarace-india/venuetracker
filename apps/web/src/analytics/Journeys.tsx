import { ManageCollections } from '../ManageCollections';
import { useEffect, useState } from 'react';
import { Search, Download, ArrowRight, CheckCircle2, Clock3, ShieldAlert } from 'lucide-react';
import type {
  AnalyticsDashboard,
  AnalyticsFilters,
  AnalyticsParticipantPage,
  ParticipantJourney,
} from '@gatecheck/shared';
import { api, message, formatTime } from '../api';
import { Badge, Empty, Modal } from '../components';
import { filterQuery, downloadReport } from './useAnalytics';
import { pct, type Drill } from './Charts';
export function JourneyExplorer({
  eventId,
  data,
  filters,
  drill,
  onClear,
  onChanged,
}: {
  eventId: string;
  data: AnalyticsDashboard;
  filters: AnalyticsFilters;
  drill: Drill;
  onClear: () => void;
  onChanged: () => void;
}) {
  const [managing, setManaging] = useState(false),
    [revision, setRevision] = useState(0);
  const [search, setSearch] = useState(''),
    [outcome, setOutcome] = useState(drill.outcome ?? 'all'),
    [gateId, setGateId] = useState(drill.gateId ?? ''),
    [offset, setOffset] = useState(0),
    [page, setPage] = useState<AnalyticsParticipantPage | null>(null),
    [error, setError] = useState(''),
    [selected, setSelected] = useState<string | null>(null),
    [journey, setJourney] = useState<ParticipantJourney | null>(null),
    [busy, setBusy] = useState(false);
  const query = filterQuery(filters).toString();
  const drillKey = JSON.stringify(drill);
  useEffect(() => {
    setOutcome(drill.outcome ?? 'all');
    setGateId(drill.gateId ?? '');
    setOffset(0);
  }, [drillKey]);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      const p = new URLSearchParams(query);
      p.set('search', search);
      p.set('outcome', outcome);
      p.set('offset', String(offset));
      p.set('limit', '25');
      if (gateId) p.set('drillGateId', gateId);
      for (const key of [
        'hour',
        'transitionFrom',
        'transitionTo',
        'funnelStage',
        'reason',
      ] as const)
        if (drill[key] !== undefined) p.set(key, String(drill[key]));
      setError('');
      void api<AnalyticsParticipantPage>(`/events/${eventId}/analytics/participants?${p}`)
        .then((value) => {
          if (active) setPage(value);
        })
        .catch((e) => {
          if (active) setError(message(e));
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [eventId, query, search, outcome, gateId, offset, drillKey, revision]);
  useEffect(() => {
    if (!selected) {
      setJourney(null);
      return;
    }
    let active = true;
    setJourney(null);
    void api<ParticipantJourney>(
      `/events/${eventId}/analytics/participants/${selected}/journey?${query}`,
    )
      .then((v) => {
        if (active) setJourney(v);
      })
      .catch((e) => {
        if (active) setError(message(e));
      });
    return () => {
      active = false;
    };
  }, [selected, eventId, query, revision]);
  const gateName = (id: string) => data.allGates.find((g) => g.id === id)?.name ?? id;
  async function download(format: 'pdf' | 'xlsx') {
    if (!selected) return;
    setBusy(true);
    try {
      await downloadReport(eventId, format, { ...filters, participantId: selected });
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>Participant journeys</h2>
            <p className="small muted">
              Visits and attempts in the selected period. Completion of optional gates is not
              required attendance.
            </p>
          </div>
          {drill.label && <button onClick={onClear}>Clear chart selection</button>}
        </div>
        {drill.label && <div className="drill-label">Chart selection: {drill.label}</div>}
        <div className="journey-filters">
          <label className="search">
            <Search size={17} />
            <input
              aria-label="Search analytics participants"
              placeholder="Search name or email"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setOffset(0);
              }}
            />
          </label>
          <select
            aria-label="Journey gate"
            value={gateId}
            onChange={(e) => {
              setGateId(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All selected gates</option>
            {data.gates.map((g) => (
              <option value={g.id} key={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Journey outcome"
            value={outcome}
            onChange={(e) => {
              setOutcome(e.target.value as typeof outcome);
              setOffset(0);
            }}
          >
            <option value="all">All participants</option>
            <option value="visited">Visited in period</option>
            <option value="unvisited">No visit in period</option>
            <option value="arrived">Entrance arrival in period</option>
            <option value="not_arrived">No entrance arrival in period</option>
            <option value="denied">Rejected attempt</option>
            <option value="duplicate">Already-collected attempt</option>
            <option value="override">Manual success</option>
          </select>
        </div>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Participant</th>
                <th>Ticket / company</th>
                <th>Entrance arrival</th>
                <th>Gates visited</th>
                <th>Net collections</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {page?.items.map((p) => (
                <tr key={p.id}>
                  <td>
                    <button className="person-button" onClick={() => setSelected(p.id)}>
                      <span className="avatar">{p.fullName.slice(0, 1)}</span>
                      <span>
                        <strong>{p.fullName}</strong>
                        <small>
                          {p.email}
                          {!p.active ? ' · Deactivated' : ''}
                        </small>
                      </span>
                    </button>
                  </td>
                  <td>
                    {p.ticketType}
                    <small>{p.company || 'Not provided'}</small>
                  </td>
                  <td className="small">{formatTime(p.arrivedAt, data.event.timezone)}</td>
                  <td>
                    {p.completedGateIds.length} / {data.gates.length}
                    <small>{p.completedGateIds.map(gateName).join(', ') || 'None in period'}</small>
                  </td>
                  <td>{p.collections}</td>
                  <td>
                    <button
                      aria-label={`View journey for ${p.fullName}`}
                      onClick={() => setSelected(p.id)}
                    >
                      <ArrowRight size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {page && !page.items.length && <Empty>No participants match this selection.</Empty>}
        <div className="pagination">
          <span>{page?.total ?? 0} participants</span>
          <button disabled={!offset} onClick={() => setOffset((v) => Math.max(0, v - 25))}>
            Previous
          </button>
          <span>{Math.floor(offset / 25) + 1}</span>
          <button
            disabled={!page || offset + 25 >= page.total}
            onClick={() => setOffset((v) => v + 25)}
          >
            Next
          </button>
        </div>
      </section>
      {selected && !managing && (
        <Modal
          title={journey ? `${journey.participant.fullName} · Gate journey` : 'Participant journey'}
          error={error}
          onClose={() => setSelected(null)}
        >
          {journey ? (
            <>
              <p className="muted small">
                {journey.participant.email} · {journey.participant.ticketType} ·{' '}
                {journey.participant.company || 'No company'} ·{' '}
                {journey.participant.active ? 'Active' : 'Deactivated'}
              </p>
              <div className="journey-summary">
                <div>
                  <strong>
                    {journey.summary.completed} / {journey.summary.total}
                  </strong>
                  <span>Gates visited in period</span>
                </div>
                <div>
                  <strong>{pct(journey.summary.completionPercent)}</strong>
                  <span>Selected gates visited</span>
                </div>
                <div>
                  <strong>
                    {journey.summary.elapsedMinutes === null
                      ? '—'
                      : `${journey.summary.elapsedMinutes} min`}
                  </strong>
                  <span>Recorded visit span</span>
                </div>
              </div>
              <p className="small muted">
                The span between visits is not queue or service time. Gate prerequisites below use
                all currently effective visits; scan history follows your date and gate filters.
              </p>
              <div className="journey-gate-map">
                {journey.gates.map((g) => (
                  <div className={`journey-gate ${g.state}`} key={g.id}>
                    {g.state === 'completed' ? (
                      <CheckCircle2 size={20} />
                    ) : g.state === 'requires_previous' || g.state === 'deactivated' ? (
                      <ShieldAlert size={20} />
                    ) : (
                      <Clock3 size={20} />
                    )}
                    <div>
                      <strong>{g.name}</strong>
                      <small>
                        {g.firstVisitAt
                          ? formatTime(g.firstVisitAt, data.event.timezone)
                          : g.state === 'deactivated'
                            ? 'Participant currently deactivated'
                            : g.missingRequires.length
                              ? `Requires ${g.missingRequires.map(gateName).join(', ')}`
                              : 'No visit in selected period'}
                      </small>
                    </div>
                    <span>{g.collections} collected</span>
                  </div>
                ))}
              </div>
              <button onClick={() => setManaging(true)}>Manage collections</button>
              <h3>Recorded attempts</h3>
              <ol className="analytics-timeline">
                {journey.timeline.map((s) => (
                  <li key={s.id}>
                    <span className={`timeline-dot ${s.undoneAt ? 'undone' : s.status}`} />
                    <div>
                      <div className="timeline-title">
                        <strong>{gateName(s.gateId)}</strong>
                        <Badge status={s.undoneAt ? 'undone' : s.status} />
                      </div>
                      <p>
                        {s.message}
                        {s.manual ? ` · Manual: ${s.reason}` : ''}
                        {s.undoneAt
                          ? ` · Undone ${formatTime(s.undoneAt, data.event.timezone)} by ${s.undoActorEmail ?? s.undoneBy ?? 'admin'}: ${s.undoReason}`
                          : ''}
                      </p>
                      <small>
                        {formatTime(s.time, data.event.timezone)} (
                        {journey.timeBasis === 'server'
                          ? 'confirmation'
                          : 'analysis capture / fallback'}
                        )
                      </small>
                      <small>
                        Confirmed {formatTime(s.serverTime, data.event.timezone)}
                        {s.captureTime
                          ? ` · Device reported ${formatTime(s.captureTime, data.event.timezone)}`
                          : ''}
                      </small>
                    </div>
                  </li>
                ))}
              </ol>
              {!journey.timeline.length && (
                <p className="muted">No attempts in the selected period.</p>
              )}
              <div className="actions">
                <button disabled={busy} onClick={() => void download('xlsx')}>
                  <Download size={15} /> Journey Excel
                </button>
                <button disabled={busy} onClick={() => void download('pdf')}>
                  <Download size={15} /> Journey PDF
                </button>
              </div>
            </>
          ) : (
            <p>Loading recorded journey…</p>
          )}
        </Modal>
      )}
      {selected && managing && (
        <ManageCollections
          eventId={eventId}
          participantId={selected}
          onClose={() => setManaging(false)}
          onChanged={() => {
            setRevision((v) => v + 1);
            onChanged();
          }}
        />
      )}
    </>
  );
}
