# API reference

JSON bodies and errors (`{"error":"description"}`). IDs are UUIDs, timestamps ISO 8601 UTC. Admin login sets an HttpOnly session cookie. Browser writes must come from the configured `PUBLIC_ORIGIN`. A successful collection is returned as JSON with `status: "success"`; a rule rejection is a **200** with `status: "denied"` or `"already"`, so it can be durably acknowledged by scanners. HTTP errors are transport/auth/input problems and leave device scans queued.

| Method   | Route                                             | Purpose / request body                          |
| -------- | ------------------------------------------------- | ----------------------------------------------- |
| GET      | `/api/health`                                     | Health probe                                    |
| POST     | `/api/auth/login`                                 | `{email,password}`                              |
| GET      | `/api/auth/me`                                    | Current admin                                   |
| POST     | `/api/auth/logout`                                | Revoke current session                          |
| GET/POST | `/api/events`                                     | List / create event                             |
| PUT      | `/api/events/:eventId`                            | Update event                                    |
| GET/POST | `/api/events/:eventId/participants`               | Search/page / create participant                |
| PUT      | `/api/events/:eventId/participants/:id`           | Replace participant profile                     |
| DELETE   | `/api/events/:eventId/participants/:id`           | Soft deactivate; audit retained                 |
| POST     | `/api/events/:eventId/import`                     | Multipart field `file`, CSV or XLSX             |
| GET      | `/api/events/:eventId/participants/:id/qr`        | Signed pass PNG, no cache                       |
| GET      | `/api/events/:eventId/participants/:id/pass`      | Signed payload for authorized integrations      |
| POST     | `/api/events/:eventId/participants/:id/revoke-qr` | Rotate QR nonce; old pass becomes invalid       |
| GET      | `/api/events/:eventId/participants/:id/journey`   | Scan history and reversible collections         |
| GET/POST | `/api/events/:eventId/gates`                      | List / create gate                              |
| PUT      | `/api/events/:eventId/gates/:id`                  | Replace gate rules                              |
| POST     | `/api/events/:eventId/gates/:id/scans`            | Admin scan or override                          |
| POST     | `/api/collections/:id/undo`                       | Admin-only `{reason}` (3–500 characters)        |
| GET/PUT  | `/api/settings/smtp`                              | Read safe settings / save encrypted credentials |
| GET/POST | `/api/events/:eventId/emails`                     | Latest 200 jobs / queue passes                  |
| POST     | `/api/emails/:id/retry`                           | Reset a failed job                              |
| GET      | `/api/events/:eventId/dashboard`                  | Counts and latest 50 scan attempts              |
| POST     | `/api/events/:eventId/pairing`                    | `{gateId}` → `{code,expiresAt}`                 |
| GET      | `/api/events/:eventId/devices`                    | Device status and last seen                     |
| POST     | `/api/devices/:id/revoke`                         | Immediately revoke device authorization         |
| GET      | `/api/events/:eventId/export/scans`               | CSV scan attempts                               |
| GET      | `/api/events/:eventId/export/participants`        | CSV per-participant, per-gate status            |
| POST     | `/api/device/pair`                                | Public, throttled `{code,name}` → `{token,id}`  |
| GET      | `/api/device/me`                                  | Device heartbeat, event and gate details        |
| GET      | `/api/device/participants?q=...`                  | Online manual lookup, minimum 2 characters      |
| POST     | `/api/device/scans`                               | Device-bound scan / manual override             |

### Event

```json
{
  "name": "Summit",
  "timezone": "Asia/Kolkata",
  "startsAt": "2026-12-12T03:30:00.000Z",
  "emailSubject": "Your pass for {{event}}",
  "emailBody": "Hello {{name}}, welcome!"
}
```

Response rows use database-style keys (`starts_at`, `email_subject`, `email_body`). Create and update schemas use camelCase. `startsAt` may be null. Subject and body default on create; send both when updating custom templates.

### Participant

```json
{
  "email": "alex@example.com",
  "fullName": "Alex Morgan",
  "phone": "+919876543210",
  "ticketType": "VIP",
  "company": "Acme",
  "active": true,
  "metadata": { "Diet": "Vegetarian" }
}
```

GET search: `?q=alex&limit=50&offset=0`, maximum limit 500; returns `{items,total}`. Responses use `full_name`, `ticket_type`, a boolean `active`, and parsed metadata. Token nonces are never in participant listing responses.

### Gate

```json
{ "name": "Kit collection", "maxCollections": 1, "requires": ["previous-gate-uuid"] }
```

All dependencies are required (AND). Max collections counts only non-undone collections. Updates cannot introduce dependency cycles. Gate response uses `max_collections` and `requires`.

### Scan

```json
{
  "operationId": "a-stable-uuid-per-capture",
  "payload": "gc1.event.participant.nonce.hmac",
  "clientTime": "2026-12-12T04:00:00.000Z"
}
```

The device supplies its Bearer token, not event/gate IDs. Admin scans use the gate-specific route. Client times are audit context only; server processing time controls rule evaluation. Replay the exact body with the exact operation ID after network failures.

```json
{
  "status": "success",
  "message": "Collection recorded",
  "participant": { "id": "participant-uuid", "fullName": "Alex Morgan" },
  "timestamp": "2026-12-12T04:00:01.000Z",
  "operationId": "original-operation-uuid"
}
```

`already` results include `previousTimestamp`. Invalid signatures, wrong-event passes, inactive participants, revoked passes and missing dependencies produce `denied` results. Missing or revoked device credentials produce HTTP 401.

Manual override: `{operationId,manual:true,participantId,reason,clientTime}`. Requires a reason, bypasses sequence and maximum collections, but preserves event and active-state checks.

### SMTP

```json
{
  "host": "smtp.zeptomail.in",
  "port": 587,
  "secure": false,
  "username": "emailapikey",
  "password": "SMTP_TOKEN",
  "fromAddress": "events@example.com"
}
```

Omit `password` to preserve an existing password. GET omits credentials and uses `from_address`. POST emails with `{}` for all active participants, or `{participantIds:[...]}` for selected participants. Failed jobs retain attempts and error information for operator review.

## Analytics endpoints

All routes require admin session authentication.

| Method | Route                                                     | Purpose                                                                                             |
| ------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| GET    | `/api/events/:eventId/analytics`                          | Aggregated snapshot, charts, settings, insights and definitions. Omits raw participant/scan arrays. |
| GET    | `/api/events/:eventId/analytics/participants`             | Paginated participant drill-down.                                                                   |
| GET    | `/api/events/:eventId/analytics/participants/:id/journey` | Event-isolated filtered timeline and current prerequisites.                                         |
| PUT    | `/api/events/:eventId/analytics/settings`                 | Set entrance gate and participation targets.                                                        |
| GET    | `/api/events/:eventId/analytics/export/xlsx`              | Download workbook snapshot.                                                                         |
| GET    | `/api/events/:eventId/analytics/export/pdf`               | Download leadership report; add `participantId` to include an individual journey.                   |

Shared query parameters: `from` and `to` (ISO datetime; inclusive/exclusive), `cohort` (`all`, `active`, `deactivated`), `ticketType`, `company` (`__none__` selects missing company), `q` (global participant name/email cohort), `participantId`, `gateIds` (comma-separated UUIDs), `route` (ordered comma-separated gate UUIDs), `timeBasis` (`server` or `capture`), `bucketMinutes` (`15`, `60`, `1440`). Explicit From/To windows are limited to 366 days. Dense chart periods automatically increase interval; the effective interval is returned.

Participant-list-only parameters: `search`, `limit` (1-100, default 25), `offset`, `drillGateId`, `outcome` (`all`, `visited`, `unvisited`, `arrived`, `not_arrived`, `denied`, `duplicate`, `override`), `hour` (local hour 0-23), `transitionFrom` plus `transitionTo`, `funnelStage` (zero-based selected route index), and `reason` (exception category). These table-only drill parameters do not change top-level export scope.

Settings body:

```json
{
  "entranceGateId": "event-gate-uuid-or-null",
  "targets": [{ "gateId": "event-gate-uuid", "targetPercent": 70 }]
}
```

Use JSON null, not the string `"null"`, to clear an entrance or individual target. Targets omitted from the list remain unchanged. All supplied gates must belong to the event; duplicates are rejected. Changes are audited.

## Participant collection management and reset

`GET /api/events/:eventId/participants/:id/collections` (admin) returns the current event-wide participant state: gates, active collection IDs, allowance, prerequisites, revisions, impact details and each gate's `stateToken`, plus reset history.

`POST /api/events/:eventId/participants/:id/gates/:gateId/reset` (admin):

```json
{
  "operationId": "new-uuid",
  "mode": "all",
  "expectedState": "stateToken-from-current-management-response",
  "reason": "Medal was recorded at the wrong counter",
  "acknowledgeImpacts": true
}
```

For `mode: "one"`, also supply `collectionId`. For `all`, omit it. Reasons must contain 3–500 trimmed characters. Acknowledgement is required for entrance resets or removal of the last prerequisite collection when downstream counters have collections. The reset is atomic, counter-specific and does not cascade. A changed snapshot returns 409. Retry the exact request with the same UUID after a lost response; changing content with the same UUID returns 409. The response includes affected IDs, count, UTC time, revision and remaining allowance at that operation's completion.

`GET /api/device/me` includes `collectionRevisions: { "participant-uuid": 1 }` for the paired gate. Scan inputs accept `collectionRevision` (nonnegative integer). Capture it when the QR is physically read; keep it unchanged during offline replay. Omission means zero, for compatibility with pre-reset clients. Stale revisions return HTTP 200 with `status: "denied"`, `code: "COLLECTION_RESET"`, current `collectionRevision` and `resetAt`. Save the receipt, stop retrying that operation, update future capture state and ask for a fresh scan. Never auto-upgrade an existing queue entry. Replaying an undone successful operation returns `COLLECTION_REVERSED` without altering the original scan audit. Custom admin scan clients must use the current revision too.

The legacy `/api/collections/:id/undo` route uses the same revision/audit mechanism; repeat undo of the same fixed ID returns 409. New UIs should use the snapshot-bound reset route.
