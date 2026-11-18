import { useEffect, useState } from 'react';
import type {
  CollectionManagement,
  CollectionResetInput,
  CollectionResetResult,
  ManagedGate,
} from '@gatecheck/shared';
import { api, ApiError, json, message, formatTime } from './api';
import { Modal, Field } from './components';

/** Operational state always covers the whole event, independently of report filters. */
export function ManageCollections({
  eventId,
  participantId,
  onClose,
  onChanged,
}: {
  eventId: string;
  participantId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<CollectionManagement | null>(null);
  const [selection, setSelection] = useState<{
    gate: ManagedGate;
    mode: 'one' | 'all';
    collectionId?: string;
  } | null>(null);
  const [reason, setReason] = useState(''),
    [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [pending, setPending] = useState<CollectionResetInput | null>(null);
  const base = `/events/${eventId}/participants/${participantId}`;
  async function load() {
    setData(await api<CollectionManagement>(base + '/collections'));
  }
  useEffect(() => {
    let active = true;
    void api<CollectionManagement>(base + '/collections')
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) setError(message(e));
      });
    return () => {
      active = false;
    };
  }, [base]);
  function choose(gate: ManagedGate, mode: 'one' | 'all', collectionId?: string) {
    setSelection({ gate, mode, collectionId });
    setReason('');
    setAck(false);
    setPending(null);
    setError('');
    setNotice('');
  }
  const count = selection ? (selection.mode === 'all' ? selection.gate.activeCount : 1) : 0;
  const impact =
    !!selection &&
    (selection.gate.entrance ||
      (selection.gate.activeCount === count && selection.gate.completedDependents.length > 0));
  async function submit() {
    if (!selection) return;
    // Keep the identical operation and snapshot after a lost response. Retrying must never undo a later scan.
    const input = pending ?? {
      operationId: crypto.randomUUID(),
      mode: selection.mode,
      collectionId: selection.collectionId,
      expectedState: selection.gate.stateToken,
      reason: reason.trim(),
      acknowledgeImpacts: ack,
    };
    setPending(input);
    setBusy(true);
    setError('');
    try {
      const result = await api<CollectionResetResult>(
        base + `/gates/${selection.gate.id}/reset`,
        json('POST', input),
      );
      setSelection(null);
      setPending(null);
      setNotice(
        `${result.undoneCount} collection(s) undone. Ask the volunteer to sync the tablet, then scan the same QR again.`,
      );
      onChanged();
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status < 500) {
        setPending(null);
        if (e.status === 409) {
          setSelection(null);
          try {
            await load();
          } catch {
            /* Original conflict remains visible. */
          }
        }
      }
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={data ? `${data.participant.fullName} · Manage collections` : 'Manage collections'}
      error={error}
      onClose={onClose}
      dismissible={!busy}
    >
      {notice && (
        <p role="status" className="alert success">
          {notice}
        </p>
      )}
      {!data ? (
        <p>Loading current collections…</p>
      ) : (
        <>
          <p className="muted">
            {data.participant.email} · {data.event.name}. Current state across the entire event.
            Times in {data.event.timezone}.
          </p>
          {!data.participant.active && (
            <p className="alert warning">
              Participant is deactivated. Undoing collections does not reactivate their pass.
            </p>
          )}
          {selection ? (
            <section className="collection-review">
              <h3>
                {selection.mode === 'all' ? 'Reset all collections' : 'Undo collection'} ·{' '}
                {selection.gate.name}
              </h3>
              <p>
                Undo {count} collection(s). Active collections: {selection.gate.activeCount} →{' '}
                {selection.gate.activeCount - count}. Remaining allowance:{' '}
                {Math.max(0, selection.gate.maxCollections - selection.gate.activeCount + count)}.
              </p>
              <p>
                The same QR stays valid. Future scans must satisfy the current prerequisites and
                collection limit.
              </p>
              {selection.gate.entrance && (
                <p className="alert warning">
                  This is the entrance gate. Removing an arrival can change attendance and flow
                  reports.
                </p>
              )}
              {selection.gate.activeCount === count &&
                selection.gate.completedDependents.length > 0 && (
                  <p className="alert warning">
                    Completed downstream counters:{' '}
                    {selection.gate.completedDependents.map((g) => g.name).join(', ')}. Their
                    collections will remain. New scans still require their direct prerequisites.
                  </p>
                )}
              <Field label="Reason for undo">
                <textarea
                  rows={3}
                  minLength={3}
                  maxLength={500}
                  value={reason}
                  disabled={!!pending}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
              {impact && (
                <label className="collection-ack">
                  <input
                    type="checkbox"
                    checked={ack}
                    disabled={!!pending}
                    onChange={(e) => setAck(e.target.checked)}
                  />{' '}
                  I acknowledge the attendance and downstream collection impact.
                </label>
              )}
              {pending && !busy && (
                <p className="alert warning">
                  The response was not confirmed. Retry this exact reset to safely check its
                  outcome.
                </p>
              )}
              <div className="actions">
                <button disabled={busy || !!pending} onClick={() => setSelection(null)}>
                  Cancel
                </button>
                <button
                  className="primary"
                  disabled={busy || reason.trim().length < 3 || (impact && !ack)}
                  onClick={() => void submit()}
                >
                  {busy
                    ? 'Saving…'
                    : pending
                      ? 'Retry same reset'
                      : selection.mode === 'all'
                        ? 'Confirm counter reset'
                        : 'Confirm undo'}
                </button>
              </div>
            </section>
          ) : (
            <>
              <div className="collection-cards">
                {data.gates.map((g) => (
                  <section className="collection-card" key={g.id}>
                    <div className="section-title">
                      <h3>
                        {g.name}
                        {g.entrance ? ' · Entrance' : ''}
                      </h3>
                      <span className="badge">
                        {g.activeCount} / {g.maxCollections} collected
                      </span>
                    </div>
                    <p>
                      {g.remaining} remaining · Requires:{' '}
                      {g.requires.map((r) => r.name).join(', ') || 'None'}
                    </p>
                    {g.missingPrerequisites.length > 0 && (
                      <p className="small muted">
                        Not yet satisfied:{' '}
                        {g.requires
                          .filter((r) => g.missingPrerequisites.includes(r.id))
                          .map((r) => r.name)
                          .join(', ')}
                      </p>
                    )}
                    {g.activeCollections.map((c) => (
                      <div className="journey-row" key={c.id}>
                        <div>
                          <strong>{formatTime(c.createdAt, data.event.timezone)}</strong>
                          <small>
                            {c.deviceName ?? 'Admin'}
                            {c.manual ? ' · Manual override' : ''}
                          </small>
                        </div>
                        <button onClick={() => choose(g, 'one', c.id)}>Undo this collection</button>
                      </div>
                    ))}
                    {!g.activeCount && <p className="small muted">No active collections.</p>}
                    <div className="actions">
                      <button
                        disabled={!g.activeCount}
                        onClick={() => choose(g, 'one', g.activeCollections[0]?.id)}
                      >
                        Undo latest
                      </button>
                      <button disabled={!g.activeCount} onClick={() => choose(g, 'all')}>
                        Reset all at this counter
                      </button>
                    </div>
                  </section>
                ))}
              </div>
              {!data.gates.length && <p>No gates configured.</p>}
              <h3>Reset history</h3>
              <p className="small muted">
                Most recent 100 resets. Original scan attempts remain in the audit history.
              </p>
              {data.history.map((h) => (
                <div className="collection-history" key={h.id}>
                  <strong>
                    {h.gateName} · {h.count} undone
                  </strong>
                  <small>
                    {formatTime(h.createdAt, data.event.timezone)} ·{' '}
                    {h.actorEmail ?? h.actorId ?? 'Legacy admin'}
                  </small>
                  <p>{h.reason}</p>
                  <small className="mono">Reset: {h.id}</small>
                </div>
              ))}
              {!data.history.length && <p className="muted">No collections have been undone.</p>}
              <button
                onClick={() => {
                  setError('');
                  void load().catch((e) => setError(message(e)));
                }}
              >
                Refresh current state
              </button>
            </>
          )}
        </>
      )}
    </Modal>
  );
}
