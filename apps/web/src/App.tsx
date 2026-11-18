import { ManageCollections } from './ManageCollections';
import { Brand } from './Brand';
import { useEffect, useState, useCallback, lazy, Suspense, type FormEvent } from 'react';
import {
  DoorOpen,
  LayoutDashboard,
  Users,
  ScanLine,
  Mail,
  Settings,
  Tablet,
  Plus,
  LogOut,
  Download,
  Search,
  Upload,
  ArrowUpRight,
  RefreshCw,
  ChevronRight,
  ChartNoAxesCombined,
} from 'lucide-react';
import { api, json, message, formatTime } from './api';
import { Modal, Field, Empty, Badge, formData, value } from './components';
import type {
  Event,
  Participant,
  Gate,
  Dashboard,
  Device,
  Collection,
  Activity,
  EmailJob,
} from './types';
const Analytics = lazy(() => import('./analytics/Analytics'));
type Tab = 'Analytics' | 'Overview' | 'Participants' | 'Gates' | 'Emails' | 'Devices' | 'Settings';
const tabs = [
  ['Overview', LayoutDashboard],
  ['Analytics', ChartNoAxesCombined],
  ['Participants', Users],
  ['Gates', ScanLine],
  ['Emails', Mail],
  ['Devices', Tablet],
  ['Settings', Settings],
] as const;
export function App() {
  const [auth, setAuth] = useState<'loading' | 'in' | 'out'>('loading'),
    [events, setEvents] = useState<Event[]>([]),
    [eventId, setEventId] = useState(''),
    [tab, setTab] = useState<Tab>('Overview'),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const [managing, setManaging] = useState<string | null>(null);
  const [modal, setModal] = useState<'event' | 'participant' | 'gate' | 'journey' | 'qr' | null>(
      null,
    ),
    [editingEvent, setEditingEvent] = useState<Event | null>(null),
    [editingParticipant, setEditingParticipant] = useState<Participant | null>(null),
    [editingGate, setEditingGate] = useState<Gate | null>(null),
    [dashboard, setDashboard] = useState<Dashboard | null>(null),
    [participants, setParticipants] = useState<Participant[]>([]),
    [total, setTotal] = useState(0),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(0),
    [gates, setGates] = useState<Gate[]>([]),
    [devices, setDevices] = useState<Device[]>([]),
    [jobs, setJobs] = useState<EmailJob[]>([]),
    [pairing, setPairing] = useState<{ code: string; expiresAt: string } | null>(null),
    [journey, setJourney] = useState<{ scans: Activity[]; collections: Collection[] } | null>(null),
    [importResult, setImportResult] = useState<{
      imported: number;
      rejected: number;
      errors: { row: number; email: string; error: string }[];
    } | null>(null),
    [smtp, setSmtp] = useState<{
      host: string;
      port: number;
      secure: number;
      username: string;
      from_address: string;
    } | null>(null);
  const event = events.find((e) => e.id === eventId);
  const base = `/events/${eventId}`;
  const refresh = () => setRevision((v) => v + 1);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void api('/auth/me')
      .then(() => setAuth('in'))
      .catch(() => setAuth('out'));
  }, []);
  const loadEvents = useCallback(async () => {
    const rows = await api<Event[]>('/events');
    setEvents(rows);
    setEventId((id) => (rows.some((e) => e.id === id) ? id : (rows[0]?.id ?? '')));
  }, []);
  useEffect(() => {
    if (auth === 'in') void loadEvents().catch((e) => setError(message(e)));
  }, [auth, revision, loadEvents]);
  useEffect(() => {
    if (!eventId || auth !== 'in') return;
    let active = true;
    setError('');
    const load = async () => {
      try {
        const [d, g] = await Promise.all([
          api<Dashboard>(base + '/dashboard'),
          api<Gate[]>(base + '/gates'),
        ]);
        if (active) {
          setDashboard(d);
          setGates(g);
        }
      } catch (e) {
        if (active) setError(message(e));
      }
    };
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [eventId, revision, auth]);
  useEffect(() => {
    if (!eventId || auth !== 'in') return;
    let active = true;
    const timeout = setTimeout(() => {
      void api<{ items: Participant[]; total: number }>(
        base + `/participants?q=${encodeURIComponent(query)}&offset=${page * 50}&limit=50`,
      )
        .then((data) => {
          if (active) {
            setParticipants(data.items);
            setTotal(data.total);
          }
        })
        .catch((e) => {
          if (active) setError(message(e));
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [eventId, query, page, revision, auth]);
  useEffect(() => {
    if (!eventId || auth !== 'in') return;
    let active = true;
    const load = async () => {
      try {
        if (tab === 'Devices') {
          const data = await api<Device[]>(base + '/devices');
          if (active) setDevices(data);
        }
        if (tab === 'Emails') {
          const data = await api<EmailJob[]>(base + '/emails');
          if (active) setJobs(data);
        }
        if (tab === 'Settings') {
          const data = await api<typeof smtp>('/settings/smtp');
          if (active) setSmtp(data);
        }
      } catch (e) {
        if (active) setError(message(e));
      }
    };
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [tab, eventId, revision, auth]);
  async function login(e: FormEvent<HTMLFormElement>) {
    const data = formData(e);
    await run(async () => {
      await api(
        '/auth/login',
        json('POST', { email: value(data, 'email'), password: value(data, 'password') }),
      );
      setAuth('in');
    });
  }
  async function saveEvent(e: FormEvent<HTMLFormElement>) {
    const data = formData(e);
    await run(async () => {
      const starts = value(data, 'startsAt');
      const saved = await api<Event>(
        editingEvent ? `/events/${editingEvent.id}` : '/events',
        json(editingEvent ? 'PUT' : 'POST', {
          name: value(data, 'name'),
          timezone: value(data, 'timezone'),
          startsAt: starts ? new Date(starts + ':00Z').toISOString() : null,
          emailSubject: editingEvent?.email_subject ?? 'Your pass for {{event}}',
          emailBody:
            editingEvent?.email_body ??
            'Hello {{name}},\nWelcome to {{event}}. Show this QR at the gate.\nTicket: {{ticketType}}',
        }),
      );
      setEventId(saved.id);
      setModal(null);
      refresh();
    });
  }
  async function saveParticipant(e: FormEvent<HTMLFormElement>) {
    const data = formData(e);
    await run(async () => {
      await api(
        base + '/participants' + (editingParticipant ? `/${editingParticipant.id}` : ''),
        json(editingParticipant ? 'PUT' : 'POST', {
          email: value(data, 'email'),
          fullName: value(data, 'fullName'),
          phone: value(data, 'phone'),
          ticketType: value(data, 'ticketType'),
          company: value(data, 'company'),
          active: !!data.get('active'),
          metadata: JSON.parse(value(data, 'metadata') || '{}'),
        }),
      );
      setModal(null);
      refresh();
    });
  }
  async function saveGate(e: FormEvent<HTMLFormElement>) {
    const data = formData(e);
    await run(async () => {
      await api(
        base + '/gates' + (editingGate ? `/${editingGate.id}` : ''),
        json(editingGate ? 'PUT' : 'POST', {
          name: value(data, 'name'),
          maxCollections: Number(value(data, 'maxCollections')),
          requires: data.getAll('requires'),
        }),
      );
      setModal(null);
      refresh();
    });
  }
  async function openJourney(p: Participant) {
    setEditingParticipant(p);
    setJourney(null);
    setModal('journey');
    await run(async () => setJourney(await api(base + `/participants/${p.id}/journey`)));
  }
  async function sendEmails(ids?: string[]) {
    await run(async () => {
      const result = await api<{ queued: number }>(
        base + '/emails',
        json('POST', ids ? { participantIds: ids } : {}),
      );
      setNotice(`${result.queued} email(s) queued. Delivery continues in the background.`);
      refresh();
    });
  }
  if (auth === 'loading')
    return (
      <main className="login">
        <Brand />
        <p>Opening NovaRace Flow…</p>
      </main>
    );
  if (auth === 'out')
    return (
      <main className="login">
        <div className="login-card">
          <Brand />
          <p className="eyebrow">EVENT OPERATIONS</p>
          <h1>
            Check-in and
            <br />
            gate operations.
          </h1>
          <p className="muted">Sign in to prepare your event and manage check-ins.</p>
          {error && (
            <p role="alert" className="alert error">
              {error}
            </p>
          )}
          <form onSubmit={login}>
            <Field label="Email">
              <input name="email" type="email" autoComplete="username" required />
            </Field>
            <Field label="Password">
              <input name="password" type="password" autoComplete="current-password" required />
            </Field>
            <button disabled={busy} className="primary wide">
              {busy ? 'Signing in…' : 'Sign in'}
              <ArrowUpRight size={17} />
            </button>
          </form>
          <a className="scanner-link" href="/scanner">
            Open gate scanner <ChevronRight size={16} />
          </a>
        </div>
        <aside className="login-aside">
          <img
            className="login-hero-logo"
            src="/brand/novarace-white.png"
            alt="NovaRace"
            width="240"
            height="97"
          />
          <p>
            Arrival.
            <br />
            Every checkpoint.
            <br />
            The full picture.
          </p>
          <small>NovaRace Flow brings check-in, collections and event analytics together.</small>
          <div className="brand-colour-strip" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
        </aside>
      </main>
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand href="/" />
        <div className="event-select">
          <span className="eyebrow">WORKSPACE</span>
          <select
            aria-label="Select event"
            value={eventId}
            onChange={(e) => {
              setEventId(e.target.value);
              setPage(0);
              setQuery('');
              setPairing(null);
            }}
          >
            <option value="" disabled>
              Select event
            </option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <button
            className="text-button"
            onClick={() => {
              setEditingEvent(null);
              setModal('event');
            }}
          >
            <Plus size={14} /> Create event
          </button>
        </div>
        <nav>
          {tabs.map(([name, Icon]) => (
            <button
              key={name}
              className={tab === name ? 'active' : ''}
              onClick={() => setTab(name)}
            >
              <Icon size={18} />
              {name}
              {tab === name && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <a href="/scanner" className="scanner-link">
            <ScanLine size={18} /> Open scanner <ArrowUpRight size={16} />
          </a>
          <span className="small muted">Event check-in and gate operations.</span>
          <button
            className="text-button"
            onClick={() =>
              void run(async () => {
                await api('/auth/logout', json('POST', {}));
                setAuth('out');
              })
            }
          >
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <span className="breadcrumb">
            Events <ChevronRight size={14} /> {event?.name ?? 'Get started'}
          </span>
          <a href="/scanner" className="pill">
            <span className="status-dot" /> Gate scanner <ArrowUpRight size={14} />
          </a>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {event ? `${event.timezone} · EVENT OPERATIONS` : 'WELCOME TO NOVARACE FLOW'}
              </p>
              <h1>{tab === 'Overview' ? 'Your event, in view.' : tab}</h1>
              <p className="muted">
                {
                  {
                    Analytics: 'Attendance, participant movement and counter performance.',
                    Overview: 'A live view of arrivals, collections, and the people behind them.',
                    Participants: 'Every guest, ready for the gate.',
                    Gates: 'Set the checkpoints and the order of the journey.',
                    Emails: 'Put a personal event pass in every inbox.',
                    Devices: 'Keep your gate tablets connected and accounted for.',
                    Settings: 'The details that keep your event running.',
                  }[tab]
                }
              </p>
            </div>
            <div className="actions">
              {event && (
                <button
                  onClick={() => {
                    setEditingEvent(event);
                    setModal('event');
                  }}
                >
                  Edit event
                </button>
              )}
              {tab === 'Participants' && event && (
                <button
                  className="primary"
                  onClick={() => {
                    setEditingParticipant(null);
                    setModal('participant');
                  }}
                >
                  <Plus size={16} /> Add participant
                </button>
              )}
              {tab === 'Gates' && event && (
                <button
                  className="primary"
                  onClick={() => {
                    setEditingGate(null);
                    setModal('gate');
                  }}
                >
                  <Plus size={16} /> Add gate
                </button>
              )}
            </div>
          </div>
          {error && (
            <div role="alert" className="alert error">
              {error}
              <button className="text-button" onClick={() => setError('')}>
                Dismiss
              </button>
            </div>
          )}
          {notice && (
            <div role="status" className="alert success">
              {notice}
            </div>
          )}
          {!event ? (
            <Empty>
              <DoorOpen size={42} />
              <h2>Your first event starts here.</h2>
              <p>Create an event, add participants, and open your gates.</p>
              <button
                className="primary"
                onClick={() => {
                  setEditingEvent(null);
                  setModal('event');
                }}
              >
                Create event
              </button>
            </Empty>
          ) : (
            <>
              {tab === 'Analytics' && (
                <Suspense fallback={<Empty>Opening analytics…</Empty>}>
                  <Analytics key={event.id} event={event} />
                </Suspense>
              )}
              {tab === 'Overview' && dashboard && (
                <>
                  <div className="stats">
                    <article className="stat">
                      <span>Participants</span>
                      <strong>{dashboard.participants.total.toLocaleString()}</strong>
                      <small>{dashboard.participants.active ?? 0} active passes</small>
                    </article>
                    <article className="stat">
                      <span>Collections</span>
                      <strong>
                        {dashboard.gates
                          .reduce((sum, g) => sum + g.collections, 0)
                          .toLocaleString()}
                      </strong>
                      <small>Across {gates.length} gates</small>
                    </article>
                    <article className="stat">
                      <span>Passes emailed</span>
                      <strong>
                        {dashboard.emails.find((e) => e.status === 'sent')?.count ?? 0}
                      </strong>
                      <small>
                        {dashboard.emails
                          .filter((e) => ['queued', 'sending'].includes(e.status))
                          .reduce((sum, e) => sum + e.count, 0)}{' '}
                        awaiting delivery
                      </small>
                    </article>
                  </div>
                  <section className="panel">
                    <div className="section-title">
                      <h2>Gate activity</h2>
                      <span className="live-label">
                        <span className="status-dot" /> Updates every 5s
                      </span>
                    </div>
                    <div className="gate-cards">
                      {dashboard.gates.map((g) => (
                        <article className="gate-card" key={g.id}>
                          <div className="gate-symbol">
                            <DoorOpen size={23} />
                          </div>
                          <h3>{g.name}</h3>
                          <div className="gate-count">
                            {g.people}
                            <span>/ {dashboard.participants.active ?? 0} people</span>
                          </div>
                          <progress
                            max={Math.max(dashboard.participants.active ?? 0, 1)}
                            value={g.people}
                          />
                          <p className="small muted">
                            {g.collections} collections · Limit {g.max_collections} per person
                          </p>
                        </article>
                      ))}
                      {!gates.length && <Empty>Add a gate to start tracking collections.</Empty>}
                    </div>
                  </section>
                  <section className="panel">
                    <div className="section-title">
                      <h2>Recent scans</h2>
                      <span className="small muted">Server-validated activity</span>
                    </div>
                    <ActivityTable rows={dashboard.activity} timezone={event.timezone} />
                  </section>
                </>
              )}
              {tab === 'Participants' && (
                <>
                  <section className="panel import-panel">
                    <div>
                      <Upload size={22} />
                      <div>
                        <h3>Bring your guest list</h3>
                        <p className="small muted">
                          CSV or Excel · Email and Full Name required · Up to 10,000 rows
                        </p>
                      </div>
                    </div>
                    <label className="button">
                      {busy ? 'Importing…' : 'Import participants'}
                      <input
                        aria-label="Import participants"
                        type="file"
                        accept=".csv,.xlsx"
                        hidden
                        disabled={busy}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (file)
                            void run(async () => {
                              const body = new FormData();
                              body.append('file', file);
                              setImportResult(
                                await api(base + '/import', { method: 'POST', body }),
                              );
                              refresh();
                            });
                        }}
                      />
                    </label>
                  </section>
                  {importResult && (
                    <section className="panel">
                      <h3>
                        {importResult.imported} imported · {importResult.rejected} rejected
                      </h3>
                      {importResult.errors.length > 0 && (
                        <div className="scroll">
                          <table>
                            <thead>
                              <tr>
                                <th>Row</th>
                                <th>Email</th>
                                <th>Issue</th>
                              </tr>
                            </thead>
                            <tbody>
                              {importResult.errors.map((r) => (
                                <tr key={r.row}>
                                  <td>{r.row}</td>
                                  <td>{r.email}</td>
                                  <td>{r.error}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </section>
                  )}
                  <section className="panel">
                    <div className="section-title">
                      <div className="search">
                        <Search size={17} />
                        <input
                          aria-label="Search participants"
                          placeholder="Search name or email…"
                          value={query}
                          onChange={(e) => {
                            setQuery(e.target.value);
                            setPage(0);
                          }}
                        />
                      </div>
                      <a className="button" href={'/api' + base + '/export/participants'}>
                        <Download size={15} /> Export status
                      </a>
                    </div>
                    <div className="scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Participant</th>
                            <th>Ticket</th>
                            <th>Company</th>
                            <th>Status</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {participants.map((p) => (
                            <tr key={p.id}>
                              <td>
                                <button
                                  className="person-button"
                                  onClick={() => void openJourney(p)}
                                >
                                  <span className="avatar">{p.full_name.slice(0, 1)}</span>
                                  <span>
                                    <strong>{p.full_name}</strong>
                                    <small>{p.email}</small>
                                  </span>
                                </button>
                              </td>
                              <td>{p.ticket_type}</td>
                              <td>{p.company || '—'}</td>
                              <td>
                                <Badge status={p.active ? 'active' : 'deactivated'} />
                              </td>
                              <td>
                                <div className="row-actions">
                                  <button
                                    aria-label={`Manage collections for ${p.full_name}`}
                                    onClick={() => setManaging(p.id)}
                                  >
                                    Collections
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingParticipant(p);
                                      setModal('participant');
                                    }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingParticipant(p);
                                      setModal('qr');
                                    }}
                                  >
                                    QR
                                  </button>
                                  <button
                                    disabled={busy || !p.active}
                                    onClick={() => void sendEmails([p.id])}
                                  >
                                    Email pass
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!participants.length && (
                      <Empty>No participants found. Import your list or add a participant.</Empty>
                    )}
                    <div className="pagination">
                      <span>{total} participants</span>
                      <button disabled={!page} onClick={() => setPage((p) => p - 1)}>
                        Previous
                      </button>
                      <span>{page + 1}</span>
                      <button
                        disabled={(page + 1) * 50 >= total}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        Next
                      </button>
                    </div>
                  </section>
                </>
              )}
              {tab === 'Gates' && (
                <div className="gate-grid">
                  {gates.map((g) => (
                    <section className="panel" key={g.id}>
                      <div className="section-title">
                        <span className="gate-symbol">
                          <DoorOpen />
                        </span>
                        <button
                          onClick={() => {
                            setEditingGate(g);
                            setModal('gate');
                          }}
                        >
                          Edit gate
                        </button>
                      </div>
                      <h2>{g.name}</h2>
                      <p className="muted">Up to {g.max_collections} collection(s) per person</p>
                      <p className="small">
                        Requires:{' '}
                        {g.requires.map((id) => gates.find((r) => r.id === id)?.name).join(', ') ||
                          'No previous gate'}
                      </p>
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() =>
                          void run(async () =>
                            setPairing(
                              await api(base + '/pairing', json('POST', { gateId: g.id })),
                            ),
                          )
                        }
                      >
                        Pair a tablet
                      </button>
                    </section>
                  ))}
                  {!gates.length && <Empty>Create your first gate, such as Reception.</Empty>}
                </div>
              )}
              {pairing && ['Gates', 'Devices'].includes(tab) && (
                <section className="panel pairing">
                  <span className="eyebrow">ONE-TIME PAIRING CODE</span>
                  <strong>{pairing.code}</strong>
                  <p>
                    Open <a href="/scanner">the scanner</a> on your tablet and enter this code.
                  </p>
                  <small className="muted">
                    Expires {formatTime(pairing.expiresAt, event.timezone)}
                  </small>
                  <button onClick={() => setPairing(null)}>Dismiss</button>
                </section>
              )}
              {tab === 'Emails' && (
                <>
                  <section className="panel">
                    <div className="section-title">
                      <div>
                        <h2>Event pass template</h2>
                        <p className="small muted">
                          Variables: {'{{name}}, {{email}}, {{event}}, {{ticketType}}, {{company}}'}
                          . The QR image is embedded automatically.
                        </p>
                      </div>
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() => {
                          if (confirm('Queue a pass email for every active participant?'))
                            void sendEmails();
                        }}
                      >
                        <Mail size={16} /> Send all passes
                      </button>
                    </div>
                    <form
                      key={event.id + event.email_body + event.email_subject}
                      onSubmit={(e) => {
                        const data = formData(e);
                        void run(async () => {
                          await api(
                            base,
                            json('PUT', {
                              name: event.name,
                              timezone: event.timezone,
                              startsAt: event.starts_at,
                              emailSubject: value(data, 'subject'),
                              emailBody: value(data, 'body'),
                            }),
                          );
                          setNotice('Email template saved.');
                          refresh();
                        });
                      }}
                    >
                      <Field label="Subject">
                        <input name="subject" required defaultValue={event.email_subject} />
                      </Field>
                      <Field label="Message">
                        <textarea name="body" rows={6} required defaultValue={event.email_body} />
                      </Field>
                      <button disabled={busy}>Save template</button>
                    </form>
                  </section>
                  <section className="panel">
                    <h2>Email delivery</h2>
                    <p className="small muted">
                      Failed deliveries retry up to five times. Re-send from Participants after
                      delivery.
                    </p>
                    <div className="scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Recipient</th>
                            <th>Status</th>
                            <th>Attempts</th>
                            <th>Details</th>
                          </tr>
                        </thead>
                        <tbody>
                          {jobs.map((j) => (
                            <tr key={j.id}>
                              <td>
                                <strong>{j.full_name}</strong>
                                <small>{j.email}</small>
                              </td>
                              <td>
                                <Badge status={j.status} />
                              </td>
                              <td>{j.attempts}</td>
                              <td>
                                {j.last_error || formatTime(j.sent_at, event.timezone)}
                                {j.status === 'failed' && (
                                  <button
                                    disabled={busy}
                                    onClick={() =>
                                      void run(async () => {
                                        await api(`/emails/${j.id}/retry`, json('POST', {}));
                                        refresh();
                                      })
                                    }
                                  >
                                    <RefreshCw size={14} /> Retry
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!jobs.length && (
                      <Empty>
                        No emails queued yet. Configure SMTP in Settings, then send your passes.
                      </Empty>
                    )}
                  </section>
                </>
              )}
              {tab === 'Devices' && (
                <section className="panel">
                  <h2>Paired tablets</h2>
                  <p className="muted small">
                    Pair a tablet from Gates. Last seen updates while the scanner is online.
                  </p>
                  <div className="scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Device</th>
                          <th>Gate</th>
                          <th>Status</th>
                          <th>Last seen</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {devices.map((d) => (
                          <tr key={d.id}>
                            <td>{d.name}</td>
                            <td>{d.gate_name}</td>
                            <td>
                              <Badge status={d.revoked ? 'revoked' : 'paired'} />
                            </td>
                            <td>{formatTime(d.last_seen, event.timezone)}</td>
                            <td>
                              <button
                                disabled={busy || !!d.revoked}
                                onClick={() => {
                                  if (
                                    confirm(
                                      `Revoke ${d.name}? Its queued scans will not sync until the device is authorized again.`,
                                    )
                                  )
                                    void run(async () => {
                                      await api(`/devices/${d.id}/revoke`, json('POST', {}));
                                      refresh();
                                    });
                                }}
                              >
                                Revoke
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!devices.length && (
                    <Empty>No devices paired yet. Generate a pairing code from Gates.</Empty>
                  )}
                </section>
              )}
              {tab === 'Settings' && (
                <div className="settings-grid">
                  <section className="panel">
                    <h2>SMTP delivery</h2>
                    <p className="small muted">
                      For ZeptoMail: use your account’s SMTP host, port 587, username emailapikey,
                      and SMTP token. TLS is required.
                    </p>
                    <form
                      key={smtp?.host ?? 'empty'}
                      onSubmit={(e) => {
                        const data = formData(e);
                        void run(async () => {
                          await api(
                            '/settings/smtp',
                            json('PUT', {
                              host: value(data, 'host'),
                              port: Number(value(data, 'port')),
                              secure: !!data.get('secure'),
                              username: value(data, 'username'),
                              password: value(data, 'password') || undefined,
                              fromAddress: value(data, 'fromAddress'),
                            }),
                          );
                          setNotice('SMTP settings saved.');
                          refresh();
                        });
                      }}
                    >
                      <Field label="SMTP host">
                        <input
                          name="host"
                          required
                          defaultValue={smtp?.host ?? 'smtp.zeptomail.in'}
                        />
                      </Field>
                      <div className="form-grid">
                        <Field label="Port">
                          <input
                            name="port"
                            type="number"
                            min={1}
                            max={65535}
                            required
                            defaultValue={smtp?.port ?? 587}
                          />
                        </Field>
                        <label className="check">
                          <input name="secure" type="checkbox" defaultChecked={!!smtp?.secure} />{' '}
                          Implicit TLS (port 465)
                        </label>
                      </div>
                      <Field label="Username">
                        <input
                          name="username"
                          required
                          defaultValue={smtp?.username ?? 'emailapikey'}
                        />
                      </Field>
                      <Field
                        label={smtp ? 'Password (leave blank to keep existing)' : 'SMTP password'}
                      >
                        <input
                          name="password"
                          type="password"
                          autoComplete="new-password"
                          required={!smtp}
                        />
                      </Field>
                      <Field label="Verified sender email">
                        <input
                          name="fromAddress"
                          type="email"
                          required
                          defaultValue={smtp?.from_address}
                        />
                      </Field>
                      <button className="primary" disabled={busy}>
                        Save SMTP settings
                      </button>
                    </form>
                  </section>
                  <section className="panel">
                    <h2>Event data</h2>
                    <p className="muted">
                      Download your scan audit and participant collection status.
                    </p>
                    <a className="button" href={'/api' + base + '/export/scans'}>
                      <Download size={16} /> Export scan log
                    </a>
                    <a className="button" href={'/api' + base + '/export/participants'}>
                      <Download size={16} /> Export participant status
                    </a>
                    <p className="small muted">
                      All exported timestamps are UTC. On-screen times use {event.timezone}.
                    </p>
                  </section>
                </div>
              )}
            </>
          )}
        </div>
      </main>
      {modal === 'event' && (
        <Modal
          error={error}
          title={editingEvent ? 'Edit event' : 'Create event'}
          onClose={() => setModal(null)}
        >
          <form onSubmit={saveEvent}>
            <Field label="Event name">
              <input name="name" required maxLength={160} defaultValue={editingEvent?.name} />
            </Field>
            <Field label="IANA timezone">
              <input
                name="timezone"
                required
                defaultValue={editingEvent?.timezone ?? 'Asia/Kolkata'}
                placeholder="Asia/Kolkata"
              />
            </Field>
            <Field label="Start (UTC)">
              <input
                name="startsAt"
                type="datetime-local"
                defaultValue={editingEvent?.starts_at?.slice(0, 16)}
              />
            </Field>
            <p className="small muted">
              The start field is entered in UTC. Event activity displays in the timezone above.
            </p>
            <button className="primary" disabled={busy}>
              Save event
            </button>
          </form>
        </Modal>
      )}
      {modal === 'participant' && (
        <Modal
          error={error}
          title={editingParticipant ? 'Edit participant' : 'Add participant'}
          onClose={() => setModal(null)}
        >
          <form onSubmit={saveParticipant}>
            <Field label="Full name">
              <input
                name="fullName"
                required
                maxLength={200}
                defaultValue={editingParticipant?.full_name}
              />
            </Field>
            <Field label="Email">
              <input name="email" type="email" required defaultValue={editingParticipant?.email} />
            </Field>
            <div className="form-grid">
              <Field label="Phone">
                <input name="phone" defaultValue={editingParticipant?.phone} />
              </Field>
              <Field label="Ticket type">
                <input
                  name="ticketType"
                  defaultValue={editingParticipant?.ticket_type ?? 'General'}
                />
              </Field>
            </div>
            <Field label="Company">
              <input name="company" defaultValue={editingParticipant?.company} />
            </Field>
            <Field label="Extra metadata (JSON object)">
              <textarea
                name="metadata"
                rows={3}
                defaultValue={JSON.stringify(editingParticipant?.metadata ?? {}, null, 2)}
              />
            </Field>
            <label className="check">
              <input
                name="active"
                type="checkbox"
                defaultChecked={editingParticipant?.active ?? true}
              />{' '}
              Active pass
            </label>
            <button className="primary" disabled={busy}>
              Save participant
            </button>
          </form>
        </Modal>
      )}
      {modal === 'gate' && (
        <Modal
          error={error}
          title={editingGate ? 'Edit gate' : 'Add gate'}
          onClose={() => setModal(null)}
        >
          <form onSubmit={saveGate}>
            <Field label="Gate name">
              <input name="name" required maxLength={100} defaultValue={editingGate?.name} />
            </Field>
            <Field label="Maximum collections per participant">
              <input
                name="maxCollections"
                type="number"
                min={1}
                max={100}
                required
                defaultValue={editingGate?.max_collections ?? 1}
              />
            </Field>
            <fieldset>
              <legend>Required previous gates</legend>
              {gates
                .filter((g) => g.id !== editingGate?.id)
                .map((g) => (
                  <label className="check" key={g.id}>
                    <input
                      name="requires"
                      value={g.id}
                      type="checkbox"
                      defaultChecked={editingGate?.requires.includes(g.id)}
                    />
                    {g.name}
                  </label>
                ))}
              <p className="small muted">Participants must collect at every selected gate first.</p>
            </fieldset>
            <button className="primary" disabled={busy}>
              Save gate
            </button>
          </form>
        </Modal>
      )}
      {modal === 'qr' && editingParticipant && (
        <Modal
          error={error}
          title={editingParticipant.full_name + ' · Event pass'}
          onClose={() => setModal(null)}
        >
          <div className="qr-preview">
            <img
              alt="Participant QR pass"
              src={'/api' + base + `/participants/${editingParticipant.id}/qr`}
            />
            <p>{editingParticipant.email}</p>
            <a
              className="button"
              download="event-pass.png"
              href={'/api' + base + `/participants/${editingParticipant.id}/qr`}
            >
              Download QR
            </a>
            <button
              onClick={() => {
                if (confirm('Invalidate this QR? Previously emailed passes will stop working.'))
                  void run(async () => {
                    await api(
                      base + `/participants/${editingParticipant.id}/revoke-qr`,
                      json('POST', {}),
                    );
                    setModal(null);
                    setNotice('Old QR revoked. Open QR again to get the new pass.');
                  });
              }}
            >
              Replace QR
            </button>
          </div>
        </Modal>
      )}
      {modal === 'journey' && editingParticipant && !managing && (
        <Modal
          error={error}
          title={editingParticipant.full_name + ' · Journey'}
          onClose={() => setModal(null)}
        >
          {journey ? (
            <>
              <div className="section-title">
                <h3>Collections</h3>
                <button onClick={() => setManaging(editingParticipant.id)}>
                  Manage collections
                </button>
              </div>
              {journey.collections.map((c) => (
                <div className="journey-row" key={c.id}>
                  <div>
                    <strong>{c.gate_name}</strong>
                    <small>{formatTime(c.created_at, event?.timezone)}</small>
                    {c.undone_at && <span className="small">Undone: {c.undo_reason}</span>}
                  </div>
                </div>
              ))}
              {!journey.collections.length && <p className="muted">No collections yet.</p>}
              <h3>Scan history</h3>
              <ActivityTable rows={journey.scans} timezone={event?.timezone ?? 'UTC'} />
            </>
          ) : (
            <p>Loading journey…</p>
          )}
        </Modal>
      )}
      {managing && (
        <ManageCollections
          eventId={eventId}
          participantId={managing}
          onClose={() => setManaging(null)}
          onChanged={() => {
            refresh();
            if (editingParticipant)
              void api<{ scans: Activity[]; collections: Collection[] }>(
                base + `/participants/${editingParticipant.id}/journey`,
              )
                .then(setJourney)
                .catch((e) => setError(message(e)));
          }}
        />
      )}
    </div>
  );
}
function ActivityTable({ rows, timezone }: { rows: Activity[]; timezone: string }) {
  return (
    <div className="scroll">
      <table>
        <thead>
          <tr>
            <th>Participant</th>
            <th>Gate</th>
            <th>Result</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.full_name ?? 'Unknown pass'}</td>
              <td>{r.gate_name}</td>
              <td>
                <Badge status={r.undone_at ? 'undone' : r.status} />
                <small>
                  {r.message}
                  {r.manual ? ' · Manual override' : ''}
                  {r.reason ? ` · ${r.reason}` : ''}
                  {r.undone_at ? ` · Undone: ${r.undo_reason}` : ''}
                </small>
              </td>
              <td className="mono small">{formatTime(r.created_at, timezone)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <Empty>Ready when your first guest arrives.</Empty>}
    </div>
  );
}
