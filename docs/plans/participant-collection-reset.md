# Collection reset implementation

1. Add reset batches/items and participant/gate revisions with historical-undo backfill; add shared contracts.
2. Implement state snapshots, transactional one/all resets and safe legacy undo delegation.
3. Add scan revision validation and reversal-aware idempotent replay; expose device revisions.
4. Update scanner captures/synchronization without mutating queued payloads.
5. Build shared admin collection management, confirmation and history; integrate both journey entry points.
6. Update reports/docs and test reset/scan races, offline conflicts, exports and browser flows.

The writing-plans skill is unavailable; this file records the approved implementation sequence directly.

## Completed

- Migration, shared contracts, snapshot-bound resets and compatibility undo implemented.
- Scanner revisions are frozen at capture, merged monotonically and preserved in offline queues.
- Participants and Analytics share collection management with reason, impact review and reset history.
- Overview, timelines, Excel/PDF/CSV audit exports and operator documentation updated.
- Validation: production build, all workspace typechecks, 18 API tests and 2 browser end-to-end tests passed. Desktop/mobile collection management screenshots inspected; offline reset conflicts and subsequent fresh QR scans verified. Local API and web servers remain available on ports 3001 and 5173.
