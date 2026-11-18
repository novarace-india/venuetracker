# GateCheck approved design

Single-origin React/Vite PWA served by Fastify with SQLite WAL storage. npm workspaces separate API, web and shared validation. No hosted services are required except SMTP.

Phase 1: versioned SQLite migrations; cookie sessions with scrypt passwords; event/participant CRUD; CSV/XLSX import with row errors and duplicate detection; gate dependencies and limits; HMAC QR payloads; encrypted SMTP credentials; durable email jobs and retries; atomic idempotent scan processing.

Phase 2: expiring pairing codes bound to event and gate; hashed device tokens; fullscreen scanner, keyboard wedge and camera; IndexedDB scan queue with stable operation UUIDs; reconnect synchronization; dashboard polling. Offline results are provisional until the server checks current rules. Devices cannot override revoked participants while disconnected.

Phase 3: explicit reason for manual overrides; admin-only collection undo; participant journeys, CSV exports and device revocation. Every scan attempt and undo is audited. UTC storage and event-timezone presentation.

Security: same-origin write checks, HttpOnly sessions, rate limits, input schemas, random participant identities and constant-time HMAC verification, transactional rule checks, redacted secrets. Deployment uses one process and persistent local disk; HTTPS required for camera/PWA outside localhost.

Validation: API integration tests for auth, imports, HMAC tampering, wrong event, limits, dependencies, idempotency, deactivation, undo and devices; TypeScript/build checks; browser walkthrough if available. SMTP delivery depends on real credentials and will be documented separately from local verification.
