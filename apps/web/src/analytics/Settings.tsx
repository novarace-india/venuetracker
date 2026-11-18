import { useState, type FormEvent } from 'react';
import type { AnalyticsDashboard } from '@gatecheck/shared';
import { api, json, message } from '../api';
import { Modal, Field, formData, value } from '../components';
export function AnalyticsSettings({
  eventId,
  data,
  onClose,
  onSaved,
}: {
  eventId: string;
  data: AnalyticsDashboard;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function save(e: FormEvent<HTMLFormElement>) {
    const values = formData(e);
    setBusy(true);
    setError('');
    try {
      await api(
        `/events/${eventId}/analytics/settings`,
        json('PUT', {
          entranceGateId: value(values, 'entrance') || null,
          targets: data.allGates.map((g) => {
            const raw = value(values, `target-${g.id}`);
            return { gateId: g.id, targetPercent: raw === '' ? null : Number(raw) };
          }),
        }),
      );
      onSaved();
      onClose();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Analytics definitions & targets" error={error} onClose={onClose}>
      <form onSubmit={save}>
        <Field label="Entrance gate for attendance">
          <select
            aria-label="Entrance gate for attendance"
            name="entrance"
            defaultValue={data.entranceGateId ?? ''}
          >
            <option value="">Not configured</option>
            {data.allGates.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>
        <p className="small muted">
          Attendance counts the first effective visit at this gate in the selected period. Changing
          the entrance recalculates reports; it does not change scan permissions or history.
        </p>
        <h3>Gate participation targets</h3>
        <p className="small muted">
          Target = expected percentage of the registered cohort visiting a gate. Leave blank for
          unrated counters. Set targets according to optional activities and ticket eligibility;
          eligibility is not automatically inferred.
        </p>
        {data.allGates.map((g) => (
          <Field key={g.id} label={`${g.name} target (%)`}>
            <input
              type="number"
              min={0}
              max={100}
              step="0.1"
              name={`target-${g.id}`}
              defaultValue={g.targetPercent ?? ''}
              placeholder="No target"
            />
          </Field>
        ))}
        {!data.allGates.length && <p>Create a gate before configuring analytics.</p>}
        <button className="primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save analytics settings'}
        </button>
      </form>
    </Modal>
  );
}
