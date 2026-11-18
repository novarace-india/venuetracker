import { Brand } from './Brand';
import { useState, useEffect, useRef, useCallback, type FormEvent } from 'react';
import {
  ScanLine,
  Wifi,
  WifiOff,
  Camera,
  Maximize,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  DoorOpen,
  Keyboard,
  RefreshCw,
} from 'lucide-react';
import type { ScanInput, ScanResult } from '@gatecheck/shared';
import { api, ApiError, json, message, formatTime } from './api';
import { Modal, Field, formData, value, Badge } from './components';
import { enqueue, queued, complete, recentReceipts, allQueueCount, type Receipt } from './offline';
interface Pair {
  token: string;
  id: string;
}
interface DeviceInfo {
  id: string;
  name: string;
  collectionRevisions?: Record<string, number>;
  event: { id: string; name: string; timezone: string };
  gate: { id: string; name: string };
}
function readStored<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null;
  } catch {
    return null;
  }
}
export function Scanner() {
  const [pair, setPair] = useState<Pair | null>(() => readStored('gc-device')),
    [info, setInfo] = useState<DeviceInfo | null>(() => readStored('gc-device-info')),
    [online, setOnline] = useState(navigator.onLine),
    [pending, setPending] = useState(0),
    [result, setResult] = useState<ScanResult | null>(null),
    [pendingNotice, setPendingNotice] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [camera, setCamera] = useState(false),
    [manual, setManual] = useState(false),
    [search, setSearch] = useState(''),
    [matches, setMatches] = useState<
      { id: string; full_name: string; email: string; active: number }[]
    >([]),
    [selected, setSelected] = useState(''),
    [receipts, setReceipts] = useState<Receipt[]>([]),
    [history, setHistory] = useState(false),
    [text, setText] = useState(''),
    [syncing, setSyncing] = useState(false);
  const revisions = useRef<{ deviceId: string; values: Record<string, number> }>({
    deviceId: pair?.id ?? '',
    values: info?.id === pair?.id ? (info?.collectionRevisions ?? {}) : {},
  });
  if (revisions.current.deviceId !== (pair?.id ?? ''))
    revisions.current = { deviceId: pair?.id ?? '', values: {} };
  function rememberRevision(participantId: string, revision: number) {
    revisions.current.values[participantId] = Math.max(
      revisions.current.values[participantId] ?? 0,
      revision,
    );
    const cached = readStored<DeviceInfo>('gc-device-info');
    if (cached?.id === revisions.current.deviceId)
      localStorage.setItem(
        'gc-device-info',
        JSON.stringify({ ...cached, collectionRevisions: revisions.current.values }),
      );
  }
  const refreshDevice = useCallback(async () => {
    if (!pair || !navigator.onLine) return;
    const data = await api<DeviceInfo>('/device/me', {}, pair.token);
    if (revisions.current.deviceId !== pair.id) return;
    // Merge monotonically: a heartbeat started before a reset must not roll back a newer scan response.
    for (const [id, revision] of Object.entries(data.collectionRevisions ?? {})) {
      if (revision > (revisions.current.values[id] ?? 0))
        lastPayload.current = { value: '', at: 0 };
      revisions.current.values[id] = Math.max(revisions.current.values[id] ?? 0, revision);
    }
    const merged = { ...data, collectionRevisions: { ...revisions.current.values } };
    setInfo(merged);
    localStorage.setItem('gc-device-info', JSON.stringify(merged));
  }, [pair]);
  const syncingRef = useRef(false),
    video = useRef<HTMLVideoElement>(null),
    buffer = useRef(''),
    lastKey = useRef(0),
    lastPayload = useRef({ value: '', at: 0 }),
    inputRef = useRef<HTMLInputElement>(null),
    showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((next: ScanResult | null, provisional = false) => {
    setResult(next);
    setPendingNotice(provisional);
    if (showTimer.current) clearTimeout(showTimer.current);
    showTimer.current = setTimeout(() => {
      setResult(null);
      setPendingNotice(false);
    }, 4500);
  }, []);
  useEffect(
    () => () => {
      if (showTimer.current) clearTimeout(showTimer.current);
    },
    [],
  );
  useEffect(() => {
    const on = () => setOnline(true),
      off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    void navigator.storage?.persist?.().catch(() => false);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  const refreshLocal = useCallback(async () => {
    if (!pair) return;
    setPending((await queued(pair.id)).length);
    setReceipts(await recentReceipts(pair.id));
  }, [pair]);
  const sync = useCallback(async () => {
    if (!pair || !navigator.onLine || syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      // FIFO replay with original operation IDs makes retries safe if a response is lost.
      // A queued scan is removed only after its final server result is saved locally.
      for (const item of await queued(pair.id)) {
        const response = await api<ScanResult>(
          '/device/scans',
          json('POST', item.input),
          pair.token,
        );
        if (
          response.participant &&
          response.collectionRevision !== undefined &&
          revisions.current.deviceId === pair.id
        )
          rememberRevision(response.participant.id, response.collectionRevision);
        if (response.code === 'COLLECTION_RESET' || response.code === 'COLLECTION_REVERSED')
          lastPayload.current = { value: '', at: 0 };
        await complete(pair.id, response);
        show(response);
        await refreshLocal();
      }
      setError('');
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 401
          ? 'Device authorization failed. Keep this device paired and ask an admin to check its status. Queued scans are preserved.'
          : `Sync paused: ${message(e)}. Queued scans are preserved.`,
      );
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [pair, show, refreshLocal]);
  useEffect(() => {
    void refreshLocal().catch((e) => setError(`Local storage failed: ${message(e)}`));
    void sync();
    const timer = setInterval(() => void sync(), 5000);
    return () => clearInterval(timer);
  }, [sync, refreshLocal, online]);
  useEffect(() => {
    const load = () => {
      void refreshDevice().catch((e) => setError(message(e)));
    };
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [refreshDevice]);
  const capture = useCallback(
    async (payload: string) => {
      if (!pair || !payload.trim()) return;
      const time = Date.now();
      if (lastPayload.current.value === payload && time - lastPayload.current.at < 1800) return;
      lastPayload.current = { value: payload, at: time };
      setText('');
      const input: ScanInput = {
        operationId: crypto.randomUUID(),
        payload: payload.trim(),
        // Freeze at physical capture. Never upgrade a queued scan after an admin reset.
        collectionRevision: revisions.current.values[payload.trim().split('.')[2]] ?? 0,
        manual: false,
        clientTime: new Date().toISOString(),
      };
      try {
        await enqueue(pair.id, input);
        await refreshLocal();
        show(null, true);
        void sync();
      } catch (e) {
        setError(`Scan was NOT saved: ${message(e)}. Free device storage and scan again.`);
      }
    },
    [pair, refreshLocal, show, sync],
  );
  useEffect(() => {
    if (!pair || manual || camera || history) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.matches('input,textarea,select') || e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === 'Enter') {
        if (buffer.current) {
          e.preventDefault();
          void capture(buffer.current);
          buffer.current = '';
        }
        return;
      }
      if (e.key.length === 1) {
        const time = Date.now();
        if (time - lastKey.current > 100) buffer.current = '';
        lastKey.current = time;
        if (buffer.current.length < 1024) buffer.current += e.key;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pair, manual, camera, history, capture]);
  useEffect(() => {
    if (!camera) return;
    let stopped = false;
    let controls: { stop: () => void } | undefined;
    void import('@zxing/browser')
      .then(async ({ BrowserQRCodeReader }) => {
        if (stopped || !video.current) return;
        const reader = new BrowserQRCodeReader();
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: 'environment' } },
          video.current,
          (decoded) => {
            if (decoded) {
              setCamera(false);
              void capture(decoded.getText());
            }
          },
        );
        if (stopped) controls.stop();
      })
      .catch((e) =>
        setError(`Camera unavailable: ${message(e)}. Use a hardware scanner or paste the QR text.`),
      );
    return () => {
      stopped = true;
      controls?.stop();
    };
  }, [camera, capture]);
  useEffect(() => {
    if (!manual || search.length < 2) {
      setMatches([]);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      void api<typeof matches>(
        `/device/participants?q=${encodeURIComponent(search)}`,
        {},
        pair!.token,
      )
        .then((rows) => {
          if (active) setMatches(rows);
        })
        .catch((e) => setError(message(e)));
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, manual, pair]);
  async function claim(e: FormEvent<HTMLFormElement>) {
    const data = formData(e);
    setBusy(true);
    setError('');
    try {
      const claimed = await api<Pair>(
        '/device/pair',
        json('POST', { code: value(data, 'code').replace(/\s/g, ''), name: value(data, 'name') }),
      );
      localStorage.setItem('gc-device', JSON.stringify(claimed));
      setPair(claimed);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function override(e: FormEvent<HTMLFormElement>) {
    const data = formData(e);
    if (!pair || !selected) return;
    setBusy(true);
    setError('');
    try {
      await enqueue(pair.id, {
        operationId: crypto.randomUUID(),
        participantId: selected,
        collectionRevision: revisions.current.values[selected] ?? 0,
        manual: true,
        reason: value(data, 'reason'),
        clientTime: new Date().toISOString(),
      });
      setManual(false);
      setSelected('');
      setSearch('');
      await refreshLocal();
      show(null, true);
      void sync();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  const fullscreen = () => {
    void document.documentElement.requestFullscreen?.().catch((e) => setError(message(e)));
  };
  if (!pair)
    return (
      <main className="scanner-pair">
        <div className="login-card">
          <Brand />
          <p className="eyebrow">GATE SCANNER</p>
          <h1>
            Give this gate
            <br />a name.
          </h1>
          <p className="muted">Ask your event admin for a one-time pairing code from Gates.</p>
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          <form onSubmit={claim}>
            <Field label="Tablet name">
              <input name="name" placeholder="Reception · Tablet 1" required maxLength={100} />
            </Field>
            <Field label="8-digit pairing code">
              <input
                name="code"
                inputMode="numeric"
                pattern="[0-9]{8}"
                maxLength={8}
                placeholder="12345678"
                required
                autoComplete="off"
              />
            </Field>
            <button disabled={busy || !online} className="primary wide">
              {busy ? 'Pairing…' : 'Pair this tablet'}
            </button>
          </form>
          <a className="scanner-link" href="/">
            Admin dashboard
          </a>
        </div>
      </main>
    );
  const state = pendingNotice ? 'pending' : (result?.status ?? 'ready');
  return (
    <main className={`scanner state-${state}`}>
      <header className="scanner-header">
        <div className="scanner-brand">
          <Brand />
          <span className="scanner-label">SCANNER</span>
        </div>
        <div className="actions">
          <span className={`connection ${online ? '' : 'offline'}`}>
            {online ? <Wifi size={17} /> : <WifiOff size={17} />} {online ? 'Online' : 'Offline'}
          </span>
          <button aria-label="Enter fullscreen" onClick={fullscreen}>
            <Maximize size={18} />
          </button>
        </div>
      </header>
      <div className="scanner-context">
        <div>
          <p className="eyebrow">{info?.event.name ?? 'PAIRED EVENT'}</p>
          <h2>{info?.gate.name ?? 'Loading gate…'}</h2>
        </div>
        <span className="mono small">{info?.name ?? 'Paired tablet'}</span>
      </div>
      {error && (
        <div role="alert" className="alert error scanner-alert">
          {error}
        </div>
      )}
      <section className={`scan-stage ${state}`} aria-live="assertive" aria-atomic="true">
        <div className="scan-emblem">
          {state === 'success' ? (
            <CheckCircle2 />
          ) : state === 'already' ? (
            <AlertTriangle />
          ) : state === 'denied' ? (
            <XCircle />
          ) : state === 'pending' ? (
            <RefreshCw />
          ) : (
            <ScanLine />
          )}
        </div>
        <p className="eyebrow">
          {state === 'ready'
            ? 'HARDWARE SCANNER READY'
            : state === 'pending'
              ? 'SAVED ON THIS TABLET'
              : state === 'success'
                ? 'COLLECTION CONFIRMED'
                : state === 'already'
                  ? 'PREVIOUS COLLECTION FOUND'
                  : 'SCAN NOT ACCEPTED'}
        </p>
        <h1>
          {pendingNotice
            ? 'Pending validation'
            : (result?.participant?.fullName ?? (result ? 'Pass not recognized' : 'Ready to scan'))}
        </h1>
        <p className="scan-message">
          {pendingNotice
            ? 'Queued safely. Wait for server confirmation before handing out an item.'
            : (result?.message ?? 'Scan an event pass to record a collection.')}
        </p>
        {result && (
          <p className="scan-time">
            {result.previousTimestamp ? 'Previously collected: ' : 'Recorded: '}
            {formatTime(result.previousTimestamp ?? result.timestamp, info?.event.timezone)}
          </p>
        )}
        {!result && !pendingNotice && (
          <div className="scan-corners">
            <span />
            <span />
            <span />
            <span />
            <ScanLine size={92} strokeWidth={1} />
          </div>
        )}
        {!online && (
          <div className="offline-note">
            <WifiOff size={16} /> Offline scans are provisional. Limits, gate order, and
            deactivations are checked when this tablet reconnects.
          </div>
        )}
      </section>
      <div className="scanner-bottom">
        <form
          className="scan-input"
          onSubmit={(e) => {
            e.preventDefault();
            void capture(text);
          }}
        >
          <Keyboard size={20} />
          <input
            ref={inputRef}
            aria-label="QR scanner input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Scanner input or paste QR text"
            autoComplete="off"
            spellCheck={false}
            maxLength={1024}
          />
          <button type="submit" disabled={!text}>
            Scan
          </button>
        </form>
        <div className="scanner-tools">
          <button onClick={() => setCamera(true)}>
            <Camera size={18} /> Camera
          </button>
          <button
            disabled={!online}
            onClick={() => {
              setManual(true);
              setSelected('');
            }}
          >
            Manual override
          </button>
          <button onClick={() => setHistory(true)}>{pending} queued · Recent results</button>
          <button
            disabled={syncing || !online}
            onClick={() =>
              void refreshDevice()
                .then(() => sync())
                .catch((e) => setError(message(e)))
            }
          >
            <RefreshCw size={16} />
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
        <p className="small muted">
          Keep this app open while syncing. Review queued scan results before leaving the gate.
        </p>
        <details>
          <summary className="small muted">Device options</summary>
          <a href="/">Admin dashboard</a>
          <button
            onClick={() =>
              void (async () => {
                if (await allQueueCount()) {
                  setError('Sync all pending scans before changing device pairing.');
                  return;
                }
                if (confirm('Remove pairing from this tablet?')) {
                  localStorage.removeItem('gc-device');
                  localStorage.removeItem('gc-device-info');
                  setPair(null);
                  setInfo(null);
                }
              })()
            }
          >
            Remove pairing
          </button>
        </details>
      </div>
      {camera && (
        <Modal error={error} title="Camera scanner" onClose={() => setCamera(false)}>
          <video ref={video} className="camera-video" playsInline muted />
          <p className="muted">
            Point the camera at the event QR. Results appear on the scanner screen.
          </p>
          {(result || pendingNotice) && (
            <div className={`alert ${result?.status === 'success' ? 'success' : 'warning'}`}>
              {pendingNotice
                ? 'Pending validation'
                : `${result?.participant?.fullName ?? 'Pass'}: ${result?.message}`}
            </div>
          )}
        </Modal>
      )}
      {manual && (
        <Modal error={error} title="Manual override" onClose={() => setManual(false)}>
          <p className="muted">
            For broken phones or an approved exception. This bypasses collection limits and gate
            order. Every override is audited.
          </p>
          <form onSubmit={override}>
            <Field label="Find participant">
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSelected('');
                }}
                placeholder="Name or email (2+ characters)"
              />
            </Field>
            <div className="match-list">
              {matches.map((p) => (
                <label className="match" key={p.id}>
                  <input
                    type="radio"
                    name="participant"
                    required
                    disabled={!p.active}
                    checked={selected === p.id}
                    onChange={() => setSelected(p.id)}
                  />
                  <span>
                    {p.full_name}
                    <small>
                      {p.email}
                      {!p.active ? ' · Deactivated' : ''}
                    </small>
                  </span>
                </label>
              ))}
            </div>
            <Field label="Reason for override">
              <textarea name="reason" required minLength={3} maxLength={500} rows={3} />
            </Field>
            <button className="primary" disabled={busy || !selected || !online}>
              Record manual collection
            </button>
          </form>
        </Modal>
      )}
      {history && (
        <Modal error={error} title="Sync & recent results" onClose={() => setHistory(false)}>
          <p className="alert warning">
            {pending} scan(s) waiting for server validation. Rejected scans need operator review.
          </p>
          <div className="receipt-list">
            {receipts.map((r) => (
              <div className="receipt" key={r.id}>
                <div>
                  <strong>{r.result.participant?.fullName ?? 'Unknown pass'}</strong>
                  <small>{r.result.message}</small>
                  <small>{formatTime(r.result.timestamp, info?.event.timezone)}</small>
                </div>
                <Badge status={r.result.status} />
              </div>
            ))}
            {!receipts.length && <p className="muted">No validated scans on this device yet.</p>}
          </div>
        </Modal>
      )}
    </main>
  );
}
