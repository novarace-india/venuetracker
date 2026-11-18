# GateCheck analytics - approved design

Add Analytics beside the existing operational overview. Three views cover leadership, gate operations and participant journeys. Charts use the existing navy/blue palette, with teal for confirmed arrivals, amber for exceptions, and explicit axis labels and sample sizes. Interactive filters and chart selections expose underlying participants.

## Data and definitions

A separate analytics settings table selects an entrance gate and optional per-gate registered-participant participation targets. This avoids altering existing event/gate INSERT contracts and preserves scanner behavior. Empty events produce unavailable percentages, not invented zero attendance. Without an entrance configured, attendance metrics are unavailable; any-gate visitors remain separately measurable.

Default cohort: all currently registered participants, including deactivated records. Filters for current active status, ticket type, company, search or a specific participant apply consistently to numerator and denominator. Registrations are a current snapshot, not a historical registration ledger. Date filters select scan/visit activity, not registration creation. Invalid passes cannot be assigned to participant cohorts; expose them separately for the unfiltered cohort.

Effective visits exclude undone collections. Unique visitors and collection counts are separate. First effective entrance visit defines arrival; arrivals in the chosen period form the attendance numerator. Counter conversion is the intersection of counter visitors and that arrival cohort divided by arrivals. Also show visitors without an entrance arrival in the period. Successful scan attempts include subsequently undone successes in the audit, separately from net collections. Gate targets use unique visitors / registered cohort; no target means unrated, never a fabricated success score.

Server confirmation time is default. An optional device-capture basis uses plausible reported capture times (not over five minutes ahead of confirmation or over 30 days behind); otherwise it falls back to confirmation. Both timestamps and fallback/delay counts are retained and disclosed. Device clocks are unverified. Offline scans not yet submitted cannot appear centrally.

Buckets align with the event timezone, include zero intervals, and preserve DST offsets. Dense periods automatically use larger intervals with the effective interval disclosed. Heatmap uses local hour of day. Gate peak is the busiest 15-minute interval of effective collections. Journey and movement analyses use each gate's first effective visit, ordered by chosen time; equal-time gates have no inferred order. A funnel only represents a user-selected ordered route and counts sequential completion. Inter-gate elapsed time is not queue or service duration.

## Implementation

Shared TypeScript schemas/types; isolated analytics snapshot loader and pure aggregation; authenticated read/settings/export endpoints; lazy-loaded React analytics with Recharts and native interactive flow diagram; paginated participant drill-down with event-isolated timelines. Existing scan APIs and operational overview stay available.

Reports are generated server-side from the same aggregation. ExcelJS creates typed numeric, percentage and date columns with summary, gate performance, time buckets, cohort segments, transitions, participants/gate status, journey audit, devices and definitions. PDFKit generates a paginated leadership report with vector charts, definitions, filter metadata and optional selected participant journey. PDF summaries clearly identify top-N summaries; full filtered detail is in Excel. Auth and same-origin protection apply to settings and exports. No attendee QR tokens or device secrets enter reports.

## Verification

Fixtures cover duplicates, undos, deactivation, empty denominators, event boundaries, segments, date cutoffs, entrance outside gate filters, sequential funnels, same-time ambiguity, device-time fallbacks and DST. Load exported workbooks and PDFs, verify calculations and content. Browser tests exercise filters, drill-downs, configuration and actual downloads at desktop/mobile widths. Render sample report pages for visual QA. Build and existing scanner tests must pass.
