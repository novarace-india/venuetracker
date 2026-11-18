# NovaRace Flow

A small, single-server event check-in system. Fastify + SQLite, a React admin dashboard, and an installable offline scanner for Android Chrome. No Redis, external database, or cloud account required. SMTP is the only external service used for email.

## Quick start

Requires Node.js **22 LTS or newer** and npm. Native `better-sqlite3` binaries normally install automatically; platforms without a prebuilt binary need Python and a C++ build toolchain.

```sh
npm ci
npm run setup
npm run dev
```

`setup` creates `.env` with separate random signing/encryption secrets and a random admin password, applies migrations, seeds a demo event and writes the sample Excel workbook. Existing `.env` and events are preserved. Read `ADMIN_EMAIL` and `ADMIN_PASSWORD` from your local `.env`; secrets are never printed by setup.

- Admin: http://localhost:5173
- Scanner: http://localhost:5173/scanner
- API health: http://127.0.0.1:3001/api/health

Use **localhost:5173**, matching `PUBLIC_ORIGIN` in `.env`. The Vite proxy keeps cookies and API requests on one origin. The shared package is built by setup; rebuild it after changing shared schemas.

### Production build locally

```sh
npm run build
```

Set `PUBLIC_ORIGIN=http://localhost:3001` in `.env`, keep `NODE_ENV=development` for local HTTP, then:

```sh
npm start
```

Both dashboard and scanner now run at http://localhost:3001. Production offline/PWA behavior is available after visiting the scanner online once. Vite development mode does **not** install the service worker.

## Event setup

1. Create an event and choose an IANA timezone, such as `Asia/Kolkata`. The optional event start input is explicitly UTC.
2. Import `samples/participants.xlsx` or `samples/participants.csv`, or add participants individually.
3. Add gates. Set collection limits and optionally require one or more previous gates. Dependency cycles and references to other events are rejected.
4. Open Settings and configure SMTP, then Emails to customize the pass and queue delivery.
5. From Gates, generate a pairing code. Open `/scanner` on the gate tablet, name it, and enter the eight-digit code. Codes expire after ten minutes and can only be claimed once.
6. Connect a USB/Bluetooth QR scanner configured as a keyboard with an **Enter suffix**. Scan a pass. Camera scanning and paste input are available as fallbacks.

### Imports

CSV (UTF-8, comma-delimited) and `.xlsx` are supported. Required headers: `Email`, `Full Name`; `*` suffixes are accepted. Optional: `Phone`, `Ticket Type`, `Company`. Every other column becomes string metadata. Keep phone columns formatted as text in Excel.

Emails are trimmed, lowercased, and unique within each event. Duplicate rows and invalid rows are reported with row numbers; valid rows are imported atomically. Existing participant data is never silently overwritten. Limits: 5 MB per file and 10,000 participant rows. Only the first worksheet is imported. Formula cached results may be read; formulas are never executed. Import files should come from your trusted event team.

### Email

Settings are global to this installation. For ZeptoMail use the SMTP host shown in your account (region matters), port 587 with implicit TLS **unchecked** (STARTTLS required), username `emailapikey`, SMTP password/token, and an approved sender email. Port 465 uses implicit TLS. Certificate verification remains enabled.

Templates support `{{name}}`, `{{email}}`, `{{event}}`, `{{ticketType}}`, and `{{company}}`. Text is HTML escaped, line breaks are preserved, and an HMAC-signed QR PNG is embedded as a CID attachment. Arbitrary template HTML is intentionally not accepted.

The SQLite email queue sends one message at a time and retries failures up to five attempts with exponential backoff. Failed jobs can be retried; sent passes can be re-sent from Participants. Pending jobs are deduplicated per participant. Deactivated participants cannot receive a newly processed pass. A send interrupted after SMTP acceptance can be delivered twice; deterministic Message-IDs help mail servers deduplicate but are not an exactly-once guarantee. Test an actual recipient before bulk sending. Domain authentication and provider quotas remain SMTP-provider responsibilities.

## Scanner and offline behavior

- Green: server confirmed the collection. Orange: already collected, with the previous timestamp. Red: rejected, with a reason.
- Every captured scan is written to **IndexedDB before any network request**. Storage failures explicitly say the scan was not saved.
- Offline scans are **amber and pending**, never falsely shown as confirmed. Global collection limits, cross-tablet duplicates, gate order, revoked QR codes and participant deactivations require the server. Wait for confirmation before handing out inventory, or follow your event's agreed provisional procedure.
- Pending scans replay in FIFO order with their original operation UUIDs. The server atomically checks rules, writes the scan audit and creates a collection inside an `IMMEDIATE` transaction. Lost responses and retries do not collect again. Replaying a subsequently undone success returns a reversal notice; stale attempts after a reset require a fresh scan.
- Server receipt persistence and local queue removal share an IndexedDB transaction. The last 200 receipts across the installation are retained; the scanner displays its latest 30. Rejected offline scans need operator review under **Recent results**.
- Queue and device pairing survive reloads and restarts. Keep the app open for syncing; there is no background-sync guarantee. Do not clear browser site data, use private browsing, or uninstall the app while scans are pending. Persistent storage is requested where supported.
- Pairing binds a device to one event and gate. Pending scans must be synchronized before changing pairing. Revoked devices cannot sync; preserve their site data and investigate with an admin. Revocation is intentionally irreversible through the UI.
- Manual override requires an online participant lookup and a reason. It can bypass limits and gate order, but cannot bypass event identity, QR revocation for ordinary scans, or participant deactivation. Device operators can override: only pair tablets held by trusted gate staff. Admin-only **Collections** lets you undo one delivery or reset all deliveries for a participant at one counter, with a reason, impact confirmation and full audit history. See [Correcting collections](docs/collection-resets.md).
- Hardware wedge capture accepts fast keystrokes (100 ms maximum gap) and Enter; scanners that type more slowly should focus the scanner input. Immediate same-payload reads within 1.8 seconds are suppressed locally. Server rules remain authoritative.

Install with Chrome's **Install app / Add to Home screen**. Fullscreen uses the top-right control. Camera permissions, PWA installation, and service workers require HTTPS except on localhost. Real tablet camera and hardware scanner acceptance tests are still necessary before an event.

## Deploy

Run one application instance with persistent **local** disk. SQLite uses foreign keys, WAL, a five-second busy timeout, and versioned migrations at startup. Do not place the database on a network filesystem or run multiple email-worker instances against it.

### Node + reverse proxy

```sh
npm ci
npm run setup
npm run build
```

Update `.env`:

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=3001
PUBLIC_ORIGIN=https://flow.example.com
DATABASE_PATH=../../data/gatecheck.sqlite
```

Run `npm start` under a service manager and terminate HTTPS with Caddy/nginx. The original host and scheme must match `PUBLIC_ORIGIN`; no CORS configuration is needed. Production session cookies are HttpOnly, Secure, SameSite=Strict, and expire after 12 hours. Trusted proxy headers are disabled; the default IP rate limits will apply collectively behind a reverse proxy. Size limits and login throttles still apply. For larger deployments configure a verified proxy hop/IP range before enabling forwarded client IPs. Do not expose the Node port directly to the internet when relying on the proxy.

Bootstrap variables create the first admin **only when there is no admin**. Changing `ADMIN_PASSWORD` later does not reset the database password. Keep `.env`, signing/encryption keys, and database backups together securely. Changing `QR_SECRET` invalidates every existing QR; changing `ENCRYPTION_KEY` requires re-entering SMTP credentials.

### Railway production hosting

See [the step-by-step Railway + Cloudflare deployment guide](docs/production-deployment.md). Start with a separate installation per organiser; this app does not yet provide shared SaaS customer isolation or subscription billing.

### Docker

```sh
docker compose build
docker compose up -d
```

First create `.env` with `npm run setup` or manually copy `.env.example` and supply distinct random secrets and a strong password. Compose overrides the database location to `/app/data/gatecheck.sqlite`, binds the port to localhost, and persists it in a named volume. Set `NODE_ENV=production` and `PUBLIC_ORIGIN` to your HTTPS domain. A reverse proxy on the host forwards to `127.0.0.1:3001`. The image runs as the unprivileged `node` user and automatically migrates on startup. Demo seed data is not loaded by the production container.

### Backups and updates

Back up using SQLite's online backup API (`better-sqlite3` `.backup(...)`) or `sqlite3 data/gatecheck.sqlite '.backup backup.sqlite'`. Alternatively stop the service before copying the database. Copying only the main database while WAL writes are active is unsafe. Store backups encrypted and test restoring them. Deploy updates during a quiet period after syncing tablets; apply a database backup before startup migrations. Migrations are forward-only SQL files recorded in the `migrations` table.

## Project structure

```text
apps/api/
  migrations/001_initial.sql  Versioned schema
  src/app.ts                 Server setup, cookie auth and security hooks
  src/routes/                Event, participant, gate, device and admin APIs
  src/db.ts                  SQLite connection and migration runner
  src/scans.ts               Transactional gate rule engine and idempotency
  src/participants.ts        Imports and participant persistence
  src/email.ts               Durable SMTP job worker and pass rendering
  src/security.ts            Passwords, QR HMAC, token hashes, AES-GCM secrets
  src/config.ts              Environment validation
  src/setup.ts, seed.ts       Local bootstrap and sample workbook
  test/                      API, import, mail retry and HMAC tests
apps/web/
  src/App.tsx                Admin workflows
  src/Scanner.tsx            Gate scanner, keyboard wedge and camera
  src/offline.ts             IndexedDB queue and receipts
  src/styles.css             Responsive UI and scanner feedback states
  public/                    PWA icons
packages/shared/src/         Shared Zod schemas and scan result types
samples/                    CSV and Excel templates
scripts/                    Browser test server and icon generation
```

## Analytics and leadership reports

Open **Analytics** in the sidebar for leadership charts, gate operations and participant journeys. Set the entrance gate under **Definitions & targets** to enable attendance; optionally set per-gate participation targets. Filter by period, current participant status, ticket type, company or gates. Download Excel/PDF reports from the analytics toolbar or an individual journey. See [analytics definitions and reporting guide](docs/analytics.md) for denominators, offline timing and export scope.

## Organiser and volunteer onboarding

- [Organiser onboarding guide (PDF)](output/pdf/NovaRace-Flow-Organiser-Onboarding-Guide.pdf): event creation, participant imports, gates, passes, tablet pairing, USB/Bluetooth scanners, camera scanning, offline operation and troubleshooting.
- [Volunteer quick reference (PDF)](output/pdf/NovaRace-Flow-Volunteer-Quick-Reference.pdf): one page to keep at each counter.
- Editable sources: [organiser guide](docs/onboarding-guide.md) and [volunteer reference](docs/volunteer-quick-reference.md).

Share the live scanner link separately with volunteers. The guides do not contain admin credentials or live pairing codes.

## API guide

See [docs/api.md](docs/api.md) for routes and request examples. All admin endpoints require the `gc_session` cookie; device endpoints require `Authorization: Bearer <device token>`. QR contents and device tokens should be treated like tickets/credentials. Device tokens are hashed at rest on the server; browser storage is used for persistent device identity.

The schema preserves every scan attempt, including rejected and manual attempts. Identical idempotent replays reuse the existing audit entry (with a reversal/reset notice when appropriate); different content reusing an operation ID is rejected with 409. `collections` stores successful deliveries independently of scan attempts. Undo is a soft reversal with admin attribution. Admin changes are recorded in `audit_log`.

## Verification

```sh
npm run typecheck
npm test
npm run build
npm run test:browser
npm audit
```

Browser tests use an isolated in-memory API, require locally installed Google Chrome, and exercise admin setup, CSV import, tablet pairing, real keyboard events, production service-worker offline reload, queue reconciliation, lost-response replay, and admin undo. Configure `playwright.config.ts` to use Playwright Chromium instead if Chrome is unavailable (`npx playwright install chromium`, then remove `channel: 'chrome'`). Screenshots and failure traces are under `test-results/`.

The dashboard polls every five seconds rather than using WebSockets. This keeps deployment simple and avoids persistent connection coordination. There is no public registration, participant self-service, multi-tenant authorization, or distributed offline inventory reservation. This implementation is intended for a trusted event team operating one installation. Live SMTP delivery, Android camera permissions, scanner model behavior, HTTPS hosting, and event-scale capacity must be validated in your deployment.

## NovaRace Flow brand and upgrade compatibility

NovaRace Flow uses the supplied NovaRace logo artwork and the December 2023 brand palette. The complete negative logo is shown on indigo; Flow is a separate product label. See [brand implementation notes](docs/branding.md).

Existing installations keep their admin credentials, database path, `gc_session` cookie, `gc-device` / `gc-device-info` local storage, `gatecheck-offline` queue, and `gc1` QR payloads. Internal `@gatecheck/*` workspace names and Docker volume/service identifiers are retained for compatibility. No QR reissue, device pairing reset, or data migration is needed for branding. New analytics settings from the earlier release remain intact.

For installed tablets, finish syncing, close all app windows and reopen to receive the new shell when the service worker updates. Do not uninstall the app or clear site data to change its name. Previously shared onboarding PDF paths remain aliases of the newly branded guides.
