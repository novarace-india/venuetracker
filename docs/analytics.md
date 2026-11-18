# NovaRace Flow analytics

Open **Analytics** in the admin sidebar. The original **Overview** remains the fast operational view. Analytics refreshes every 15 seconds and displays its last successful snapshot time. Exports calculate a new consistent snapshot when requested; their generated timestamp can therefore be newer than the screen.

## Set definitions first

1. Open **Definitions & targets**.
2. Select the actual entrance gate, usually Reception. NovaRace Flow will not infer attendance from meal or kit collections.
3. Optionally enter participation targets for individual gates. Targets are percentages of the currently selected registered cohort. A blank target is unrated. Counters may be optional or ticket-specific; gate eligibility is not modeled automatically.
4. Save. Settings affect reports, not QR permissions or gate rules.

## Views

**Leadership overview** shows attendance, first-arrival trends, gate participation, factual observations, ticket/company comparisons, observed first-visit flow, and a selectable ordered-route funnel.

**Gate operations** shows net throughput over time, a local-hour heatmap, gate scorecards, rejection/duplicate/override/undo categories, reported capture-to-confirmation timing and tablet activity. A peak interval is observed volume; it is not measured capacity or queue length.

**Participant journeys** supports search, gate/outcome selection and chart drill-downs. Open a person to see visited gates, prerequisites and an attempt timeline, including overrides, rejections and undo reasons. A currently available gate means its prerequisite visits exist in the full effective history; its in-period visit state still follows the selected date window.

Click participation bars, attendance ring segments, flow links, funnel steps, heatmap cells and exception categories to inspect participants. Unknown/invalid passes cannot be matched to a participant; audit exports preserve these attempts, so a participant drill-down can contain fewer people than the number of attempts in a chart. Some participants contribute more than one attempt.

## Filters and timing

- Date fields use the event timezone; From is inclusive and To is exclusive. Stored/exported raw timestamps are UTC.
- Cohort defaults to **All registrations**, including currently deactivated profiles. Current status, ticket and company filters apply consistently to visitors and the registered denominator. Date filtering selects activity, not historical registration counts.
- Attendance always uses the configured entrance even when a separate counter is selected in the gate filter.
- **Server confirmation** is the default time basis. **Device capture** uses the submitted timestamp only when it is no more than five minutes ahead of confirmation and no more than 30 days behind. Missing or implausible capture times fall back to server time. Device clocks remain unverified.
- Capture-to-confirmation delay is based on device-reported clocks, with small negative differences shown as zero. It is not measured network latency or queue time.
- Charts use 15-minute, hourly or daily intervals aligned with the event timezone, preserving repeated DST hours. Cumulative arrivals are plotted through interval end; throughput and heatmap counts are interval totals. Long periods automatically use larger intervals, with the actual interval disclosed.
- The heatmap combines counts by local hour of day across selected dates. Repeated DST hours combine in this heatmap; time-series buckets remain distinct.
- Scans still queued on disconnected tablets do not appear in server analytics. Last seen does not establish that a queue is empty.

## Metric dictionary

| Metric                             | Calculation / interpretation                                                                                                                                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registered                         | Number of current participant records matching the selected cohort. Historical registration/eligibility snapshots are not available.                                                                                                                    |
| Arrival                            | A participant's first effective entrance collection occurs in the selected period.                                                                                                                                                                      |
| Attendance                         | Arrivals / registered cohort. Unavailable until an entrance is configured; also unavailable for a zero denominator.                                                                                                                                     |
| No entrance arrival in period      | Registered cohort minus arrivals. This does not mean never attended if the selected period omits their earlier arrival.                                                                                                                                 |
| Unique gate visitors               | Distinct participants with effective, non-undone collections at the gate in the period.                                                                                                                                                                 |
| Net collections                    | Successful collections excluding all currently undone collections. Repeat allowances/manual collections can make this larger than unique visitors.                                                                                                      |
| Registered participation           | Unique gate visitors / registered cohort.                                                                                                                                                                                                               |
| Arrival conversion                 | Gate visitors who also belong to the selected period's arrival cohort / arrivals in that period.                                                                                                                                                        |
| Without entrance arrival in period | Gate visitors outside that arrival cohort. Examine filters, earlier arrivals, overrides or entrance configuration.                                                                                                                                      |
| Scan success                       | Successful submitted attempts / all included submitted attempts. Successful attempts later undone remain historical successes in this rate.                                                                                                             |
| Duplicate                          | Server returned Already collected. Replays of the same operation ID do not add attempts.                                                                                                                                                                |
| Manual success                     | A successful manual attempt, including those later undone.                                                                                                                                                                                              |
| Undone success                     | An included scan whose associated collection is currently undone. The undo itself can have occurred outside the chosen scan-time window.                                                                                                                |
| Gate peak                          | Busiest 15-minute interval by net collections; earliest interval wins ties.                                                                                                                                                                             |
| First-visit transition             | A person's next different gate in the sequence of first effective visits in the period. Repeated visits are excluded. No link is inferred into/out of tied first-visit timestamps. Filtering out an intermediate gate does not create a false shortcut. |
| Inter-gate elapsed time            | Median/P90 time between those first visits. This is not service duration or queue waiting time.                                                                                                                                                         |
| Ordered funnel                     | Participants with strictly increasing-time visits to each selected gate in the chosen order. Independent gates are not automatically a funnel.                                                                                                          |
| Participation target               | Compare registered participation against the configured percentage target. Without a target, the gate is unrated. This is not a volunteer performance score.                                                                                            |

Unknown-pass attempts cannot be assigned to a current status, ticket, company, name or participant cohort. They are included only when those participant filters are absent and All registrations is selected.

## Reports

**Excel report** downloads a typed `.xlsx` snapshot with summary/filter metadata, gate performance, time buckets, gate-hour heatmap, transitions, funnel, ticket/company segments, participants, participant/gate status, journey audit, exceptions, devices and definitions. Numeric percentages and UTC dates remain sortable typed cells. It is a snapshot, not a live-linked workbook. No QR secrets or device tokens are exported.

**PDF report** downloads a paginated leadership summary with KPI cards, cumulative arrival chart, gate participation chart, scorecards, peak periods, movement, funnel, segment tables, exceptions, device activity and definitions. PDF transition/segment summaries are explicitly top-N; complete detail is in Excel. A selected participant's **Journey PDF** also includes their gate status and timeline; **Journey Excel** contains the report limited to that participant.

Global event/date/gate/cohort filters carry into downloads. Participant table search and chart drill selections are exploratory and are **not** automatically applied to the top-level report buttons. Use the individual Journey download buttons for a report restricted to one participant, or apply the global cohort filters. This distinction prevents an unexplained subset from being presented as the full event report.

Exports are admin-only and rate limited to 12 per minute. Large Excel outputs above 750,000 estimated detail rows require narrower filters instead of silently truncating data. No measured queue length, service duration, inventory balance, live on-site occupancy or individual volunteer staffing score is inferred from collection records alone.

## Validation

Integration fixtures independently check cohort denominators, duplicates, undos, tied visits, current deactivation, entrance/gate-filter independence, half-hour timezones, DST, capture-time fallback, export cell types and event/auth boundaries. Browser tests exercise the real charts, filtered journeys, settings and binary report downloads. The scanner end-to-end test still runs independently against its own event.

## Dependency verification

On 18 November 2026, `npm audit --omit=dev` reported no known production dependency vulnerabilities. The development/build dependency tree still reports the upstream `picomatch` ReDoS advisory (GHSA-fc5q-39xc-vjpf). The available latest `picomatch` version is included in the affected range. The PWA/build chain was not downgraded to hide this advisory; monitor the upstream fix and keep build configuration restricted to the event team.
