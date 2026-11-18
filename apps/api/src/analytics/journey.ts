import type { AnalyticsReport, ParticipantJourney } from '@gatecheck/shared';
import type { Snapshot } from './snapshot.js';
import { HttpError } from '../scans.js';
import { percent } from './time.js';
export function participantJourney(
  snapshot: Snapshot,
  report: AnalyticsReport,
  id: string,
): ParticipantJourney {
  const participant = report.participants.find((p) => p.id === id);
  if (!participant)
    throw new HttpError(404, 'Participant is not in this event and selected cohort');
  const visits = report.visits.filter((v) => v.participantId === id);
  const historicGates = new Set(
    snapshot.records
      .filter((r) => r.participantId === id && r.collectionId && !r.undoneAt)
      .map((r) => r.gateId),
  );
  const gates = report.gates.map((g) => {
    const rows = visits.filter((v) => v.gateId === g.id);
    const missingRequires = g.requires.filter((gateId) => !historicGates.has(gateId));
    return {
      id: g.id,
      name: g.name,
      maxCollections: g.maxCollections,
      targetPercent: g.targetPercent,
      requires: g.requires,
      state: rows.length
        ? ('completed' as const)
        : !participant.active
          ? ('deactivated' as const)
          : missingRequires.length
            ? ('requires_previous' as const)
            : ('available' as const),
      firstVisitAt: rows[0]?.time ?? null,
      collections: rows.length,
      missingRequires,
    };
  });
  const completed = gates.filter((g) => g.state === 'completed').length;
  return {
    participant,
    gates,
    timeline: report.scans
      .filter((s) => s.participantId === id)
      .sort((a, b) => a.time.localeCompare(b.time)),
    summary: {
      completed,
      total: gates.length,
      completionPercent: percent(completed, gates.length),
      elapsedMinutes:
        visits.length >= 2
          ? Math.round((Date.parse(visits.at(-1)!.time) - Date.parse(visits[0].time)) / 6000) / 10
          : null,
    },
    timeBasis: report.filters.timeBasis,
  };
}
