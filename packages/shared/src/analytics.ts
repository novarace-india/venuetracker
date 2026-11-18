import { z } from 'zod';
const ids = z
  .string()
  .max(4000)
  .transform((s) => (s ? s.split(',') : []))
  .pipe(z.array(z.string().uuid()).max(100));
export const analyticsFilterSchema = z
  .object({
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    cohort: z.enum(['all', 'active', 'deactivated']).default('all'),
    ticketType: z.string().max(120).optional(),
    company: z.string().max(200).optional(),
    q: z.string().trim().max(200).default(''),
    participantId: z.string().uuid().optional(),
    gateIds: ids.default([]),
    route: ids.default([]),
    timeBasis: z.enum(['server', 'capture']).default('server'),
    bucketMinutes: z.coerce
      .number()
      .pipe(z.union([z.literal(15), z.literal(60), z.literal(1440)]))
      .default(60),
  })
  .superRefine((v, ctx) => {
    if (v.from && v.to && Date.parse(v.from) >= Date.parse(v.to))
      ctx.addIssue({ code: 'custom', message: 'From must be before To' });
    if (v.from && v.to && Date.parse(v.to) - Date.parse(v.from) > 366 * 86400000)
      ctx.addIssue({ code: 'custom', message: 'Select a window of 366 days or less' });
    if (new Set(v.route).size !== v.route.length)
      ctx.addIssue({ code: 'custom', message: 'A route cannot repeat a gate' });
  });
export const analyticsSettingsSchema = z.object({
  entranceGateId: z.string().uuid().nullable(),
  targets: z
    .array(
      z.object({ gateId: z.string().uuid(), targetPercent: z.number().min(0).max(100).nullable() }),
    )
    .max(100),
});
export type AnalyticsFilters = z.infer<typeof analyticsFilterSchema>;
export interface AnalyticsGate {
  id: string;
  name: string;
  maxCollections: number;
  requires: string[];
  targetPercent: number | null;
}
export interface AnalyticsVisit {
  id: string;
  scanId: string;
  participantId: string;
  gateId: string;
  time: string;
  serverTime: string;
  captureTime: string | null;
  manual: boolean;
  deviceId: string | null;
}
export interface AnalyticsScan {
  id: string;
  operationId: string;
  participantId: string | null;
  gateId: string;
  deviceId: string | null;
  actorId: string | null;
  time: string;
  serverTime: string;
  captureTime: string | null;
  status: 'success' | 'already' | 'denied';
  message: string;
  manual: boolean;
  reason: string | null;
  undoneAt: string | null;
  undoReason: string | null;
  undoneBy: string | null;
  undoActorEmail: string | null;
  resetId: string | null;
}
export interface AnalyticsParticipant {
  id: string;
  fullName: string;
  email: string;
  ticketType: string;
  company: string;
  active: boolean;
  arrivedAt: string | null;
  completedGateIds: string[];
  collections: number;
  attempts: number;
  lastVisitAt: string | null;
}
export interface GateMetric extends AnalyticsGate {
  visitors: number;
  collections: number;
  participationPercent: number | null;
  arrivedVisitors: number;
  attendeeConversionPercent: number | null;
  withoutEntrance: number;
  attempts: number;
  successAttempts: number;
  duplicates: number;
  denied: number;
  overrides: number;
  undos: number;
  successPercent: number | null;
  targetStatus: 'met' | 'below' | 'unrated';
  peak: { start: string; collections: number } | null;
}
export interface TimeBucket {
  start: string;
  end: string;
  label: string;
  arrivals: number;
  cumulativeArrivals: number;
  collections: number;
  attempts: number;
  gates: Record<string, number>;
}
export interface TransitionMetric {
  from: string;
  to: string;
  people: number;
  medianMinutes: number;
  p90Minutes: number;
}
export interface SegmentMetric {
  name: string;
  registered: number;
  arrived: number;
  attendancePercent: number | null;
  visitors: number;
  gateVisitors: Record<string, number>;
}
export interface FunnelStage {
  gateId: string;
  name: string;
  people: number;
  fromPreviousPercent: number | null;
  fromStartPercent: number | null;
}
export interface AnalyticsDevice {
  id: string;
  name: string;
  gateId: string;
  revoked: boolean;
  lastSeen: string | null;
  attempts: number;
  success: number;
  denied: number;
  duplicates: number;
  successPercent: number | null;
}
export interface AnalyticsReport {
  event: { id: string; name: string; timezone: string };
  generatedAt: string;
  filters: AnalyticsFilters;
  entranceGateId: string | null;
  allGates: AnalyticsGate[];
  gates: GateMetric[];
  available: { ticketTypes: string[]; companies: string[] };
  summary: {
    registered: number;
    active: number;
    deactivated: number;
    arrived: number | null;
    attendancePercent: number | null;
    notArrived: number | null;
    anyGateVisitors: number;
    collections: number;
    attempts: number;
    successAttempts: number;
    duplicates: number;
    denied: number;
    overrides: number;
    undos: number;
    successPercent: number | null;
    peak: { start: string; collections: number } | null;
    arrivalPeak: { start: string; people: number } | null;
  };
  buckets: TimeBucket[];
  effectiveBucketMinutes: number;
  heatmap: { gateId: string; hour: number; collections: number }[];
  transitions: TransitionMetric[];
  funnel: FunnelStage[];
  segments: { ticketTypes: SegmentMetric[]; companies: SegmentMetric[] };
  exceptions: { reason: string; count: number }[];
  devices: AnalyticsDevice[];
  participants: AnalyticsParticipant[];
  scans: AnalyticsScan[];
  visits: AnalyticsVisit[];
  quality: {
    unknownPassAttempts: number;
    captureFallbacks: number;
    captureTimesUsed: number;
    medianCaptureDelaySeconds: number | null;
    p90CaptureDelaySeconds: number | null;
    ambiguousTransitions: number;
    notes: string[];
  };
  insights: { level: 'info' | 'attention'; title: string; detail: string }[];
}
export interface ParticipantJourney {
  participant: AnalyticsParticipant;
  gates: (AnalyticsGate & {
    state: 'completed' | 'available' | 'requires_previous' | 'deactivated';
    firstVisitAt: string | null;
    collections: number;
    missingRequires: string[];
  })[];
  timeline: AnalyticsScan[];
  summary: {
    completed: number;
    total: number;
    completionPercent: number | null;
    elapsedMinutes: number | null;
  };
  timeBasis: 'server' | 'capture';
}
export type AnalyticsDashboard = Omit<AnalyticsReport, 'participants' | 'scans' | 'visits'>;
export interface AnalyticsParticipantPage {
  items: AnalyticsParticipant[];
  total: number;
  offset: number;
  limit: number;
}
