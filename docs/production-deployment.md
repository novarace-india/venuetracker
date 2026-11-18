# NovaRace Flow: first production deployment

Recommended: **Railway (Node/Docker + persistent SQLite volume) + Cloudflare DNS + SMTP**. This uses the existing code without a database rewrite. One Node process serves the dashboard, scanner PWA and API on the same HTTPS hostname.

This is a deployment guide, not a claim that a shared self-service SaaS is implemented. The current product is one trusted event team's installation: every admin can access all events in that installation. For initial paid customers, sell a managed, dedicated installation per organiser. Each needs a separate service, volume, secrets, admin credentials, SMTP settings and hostname. Do not put independent customers in a common database.

## 1. Create the Railway service

1. Sign in to Railway and choose **New Project → Deploy from GitHub repo**.
2. Authorize access to `novarace-india/venuetracker` and choose branch `main`.
3. Keep the repository root as the service root. Railway should detect the root `Dockerfile`. Do not point it at `apps/web` or override the Docker start command with `npm start`.
4. If the first deployment starts before configuration is finished, it will fail because secrets are missing. Finish the next steps and redeploy.
5. Choose a region close to your event teams. Use a paid always-on configuration; disable Serverless/App Sleep for gate operations and the email worker.

## 2. Attach persistent storage before real use

1. Attach a Railway Volume to the application service.
2. Set its mount path to `/app/data`.
3. Keep **one replica** and one Node process. Do not add multiple independent SQLite replicas or a separate email-worker service.
4. The database path must be `/app/data/gatecheck.sqlite`. Without the mounted volume, data can disappear on redeployment.
5. Set `RAILWAY_RUN_UID=0`. The image normally uses the `node` user; Railway's documented override permits access to its root-owned volume. This is a Railway-specific deployment setting, not a change to the default Docker image user.

## 3. Set environment variables

In the service's **Variables** tab, set:

```dotenv
NODE_ENV=production
HOST=0.0.0.0
PORT=3001
DATABASE_PATH=/app/data/gatecheck.sqlite
PUBLIC_ORIGIN=https://flow.novarace.in
QR_SECRET=GENERATE_A_NEW_RANDOM_VALUE
ENCRYPTION_KEY=GENERATE_ANOTHER_RANDOM_VALUE
ADMIN_EMAIL=YOUR_REAL_ADMIN_EMAIL
ADMIN_PASSWORD=YOUR_UNIQUE_LONG_PASSWORD
RAILWAY_RUN_UID=0
```

Replace every uppercase placeholder. `flow.novarace.in` is an example hostname; use the hostname you will actually configure. `PUBLIC_ORIGIN` must exactly match the HTTPS origin used in browsers, without a trailing slash. Only that origin should be used for normal admin/scanner access.

Run this command **twice** locally, using a different result for each secret:

```sh
openssl rand -hex 32
```

Use a password manager to create a long, unique admin password (at least 12 characters). Do not reuse the local development `.env`. Store the two secrets and credentials securely outside GitHub.

Changing `ADMIN_PASSWORD` later does not change an existing database account: it only creates the first admin in an empty database. Password reset/account management is not implemented in the UI. Do not rely on changing an environment variable as a password-rotation procedure.

Never rotate `QR_SECRET` casually: it invalidates issued passes. Changing `ENCRYPTION_KEY` makes saved SMTP credentials unreadable until reconfigured. Preserve both across restarts and backups.

## 4. Configure health and deploy

1. Set the Railway healthcheck path to `/api/health`.
2. Keep the Dockerfile's default start command (`node dist/index.js` from `/app/apps/api`). Do not run setup or seed in production.
3. Deploy. Startup creates the initial admin and applies SQL migrations automatically against the mounted volume.
4. Check logs for a successful listen on `0.0.0.0:3001` and for migration/permission errors.
5. Generate a Railway public domain, targeting port **3001**. Its `/api/health` endpoint should return `{"ok":true}`.

If you want to test login on the temporary Railway hostname before configuring your own domain, temporarily set `PUBLIC_ORIGIN` to that Railway HTTPS origin and redeploy. Change it back when switching to the final hostname. Device pairing/offline storage is tied to the hostname: do final tablet pairing after the domain is settled.

## 5. Connect Cloudflare DNS

1. In Railway service networking, add your custom domain, for example `flow.novarace.in`, targeting port `3001`.
2. Railway supplies a CNAME destination and may supply domain verification records.
3. In Cloudflare DNS, add exactly those records. For the `flow` CNAME, start with **DNS only** (grey cloud). Keep verification CNAMEs DNS only.
4. Wait for Railway to verify the domain and issue its HTTPS certificate.
5. Open `https://flow.novarace.in/api/health`, then the dashboard and `/scanner`.
6. Confirm `PUBLIC_ORIGIN=https://flow.novarace.in` and redeploy if necessary.

Cloudflare is providing DNS here; Railway hosts the application and terminates HTTPS. A Cloudflare Pages-only deployment cannot run this Fastify/better-sqlite3 backend. Workers/D1 would require a separate implementation. An optional Cloudflare proxy/WAF can be introduced after testing: use Full (strict) TLS and bypass caching for `/api/*`, authenticated pages and the service worker; never cache API results or challenge scanner sync requests.

## 6. Configure email and rehearse

1. Sign in using the production `ADMIN_EMAIL` and `ADMIN_PASSWORD` you configured.
2. Under **Settings**, configure your SMTP provider (ZeptoMail or another SMTP service). Use the region-specific host and approved sender from that provider.
3. With port `587`, leave implicit TLS off (the app requires STARTTLS); port `465` uses implicit TLS.
4. Configure sender-domain verification, SPF and DKIM using the SMTP provider's exact DNS records.
5. Create a rehearsal event, import sample participants and set the event timezone.
6. Create reception and medal/kit gates with their collection limits and dependencies. Set the analytics entrance gate.
7. Send a real test pass and verify delivery and QR rendering.
8. Pair a real Android tablet at the final HTTPS `/scanner` address. Test USB/Bluetooth keyboard mode and camera permission.
9. Test: first scan, duplicate, wrong sequence, deactivation, manual override, admin undo, sync and rescan of the same QR.
10. Go offline, queue scans, reconnect and inspect receipts. Offline captures are provisional; wait for server approval before handing out items.
11. Download participant/journey Excel, PDF and scan CSV reports.
12. Redeploy once and confirm the rehearsal event still exists. This validates volume persistence.

## 7. Backups, updates and event-day operations

- Enable Railway's scheduled volume backups and take a manual backup before migrations/events. Verify a restore in an isolated environment, not against a live gate service.
- Also keep an encrypted off-platform copy made with SQLite's online backup API. Do not copy only the main database while WAL writes are active. Save the signing/encryption secrets separately and securely.
- Set monitoring for HTTPS `/api/health`, application errors, disk usage, CPU, memory and mail failures. The health endpoint is a liveness check, not proof that scans, SMTP and backups work.
- Test the expected number of tablets and scans per minute on the actual hosted service. All proxy traffic currently shares IP-based limits (600 requests/minute globally and 10 login attempts/minute per observed proxy IP), because forwarded IP headers are deliberately not trusted. Dashboard polling and heartbeats consume part of that allowance. Larger deployments need verified proxy trust configuration and load testing before sale.
- Keep an event-day support contact and a tested connectivity fallback. Update during quiet periods after tablet queues are synced. Single-service SQLite deploys can have brief downtime; do not promise high availability.
- GitHub-linked deployments may deploy new pushes automatically. Require controlled/manual production releases during events; keep staging separate with its own volume, secrets and data.
- Code rollback does not roll back schema or data. Backups and restore drills are required before migrations.

## 8. Selling the first installations

The current architecture supports a managed service per organiser. For example:

- `organiser-a.novarace.in` → Railway service A → volume A → unique secrets/admin/SMTP.
- `organiser-b.novarace.in` → Railway service B → volume B → different secrets/admin/SMTP.

Start with a paid pilot after a successful rehearsal, backup/restore test and capacity test. Sell event setup, hosting, onboarding and support as a managed package. Do not promise subscriptions, automated signup, customer isolation within one app, fine-grained staff roles or automated billing: those features do not exist yet.

For a shared self-service SaaS, a separate product phase must add organisation-level authorization to every API/report/device flow, account invitations/reset/MFA as appropriate, billing, support tooling, data retention/deletion controls and production operations. Moving to Postgres can support multiple app instances, but does not itself provide customer isolation. Supabase supplies Postgres; this SQLite-specific code cannot use it by changing `DATABASE_PATH` or adding `DATABASE_URL`.

## Troubleshooting

| Symptom                            | Check                                                                                    |
| ---------------------------------- | ---------------------------------------------------------------------------------------- |
| SQLite permission denied           | Volume attached at `/app/data`; `RAILWAY_RUN_UID=0` set; path matches                    |
| Data lost after redeploy           | Database was outside the persistent mount, or a different volume was attached            |
| Login returns “Origin not allowed” | `PUBLIC_ORIGIN` exactly matches the browser's HTTPS origin                               |
| Login works on one hostname only   | Expected: use the configured origin; cookies and PWA data belong to that hostname        |
| Changed env password does not work | Existing admin is unchanged; bootstrap is not a password-reset mechanism                 |
| HTTP 429 at busy gates             | Shared reverse-proxy limits; assess actual request load and verified proxy trust         |
| Email fails                        | Sender verification, regional SMTP host, port/TLS, provider limits and queue errors      |
| Camera unavailable                 | Final HTTPS domain, Android Chrome camera permission, camera not used by another app     |
| Queued scan rejected after undo    | Expected safety: sync, then capture a fresh physical scan; do not edit old queue entries |

## Official references

Provider interfaces and pricing change; checked against these official references when preparing this guide:

- [Railway Dockerfiles](https://docs.railway.com/builds/dockerfiles)
- [Railway persistent volumes and permissions](https://docs.railway.com/volumes)
- [Railway volume backups](https://docs.railway.com/volumes/backups)
- [Railway custom domains](https://docs.railway.com/networking/domains/working-with-domains)
- [Railway healthchecks](https://docs.railway.com/deployments/healthchecks)
- [Cloudflare DNS proxy status](https://developers.cloudflare.com/dns/proxy-status/)
- [Supabase database overview](https://supabase.com/docs/guides/database/overview)
