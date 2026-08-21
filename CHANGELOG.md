# Changelog

## Unreleased

### Added

- Independent React, TypeScript, and Vite mobile-first client repository.
- iPhone-aligned project drawer, conversation workspace, composer, and responsive desktop layout.
- Runtime v1 HTTP client for Project/Session/Run, cancellation, Bootstrap and health checks.
- Session and Run SSE with separate cursors, snapshot recovery and automatic reconnect.
- Multi-tab discovery of Runs created in the same Session and PostgreSQL-backed history restoration.
- Real Mac Agent browser acceptance on desktop and 390x844 mobile viewports.
- Isolated HTTP/SSE Runtime adapter, connection inspector, event trace, and SSE parser tests.
- Integrated root `start.sh` with parameter-selected fixed ports, dependency preflight, isolated port cleanup, readiness checks, colored status output, and LAN URLs.
- Global `devrun` registrations for named and port-based Mobile Web startup.

### Changed

- Removed the Mock Runtime and legacy endpoint adapter; the client now uses only Runtime v1 HTTPS/SSE.
- New Session actions now show in-progress and visible failure states, remain actionable while the project catalog is loading, and reject duplicate submissions.
- Runtime history now syncs incrementally in the background on initial load, uses a renewable idempotency key, and automatically expands the selected project's restored sessions.
- The default Run Server URL now follows the browser's current host instead of embedding the Mac's startup-time LAN address, so DHCP changes no longer leave the Agent falsely offline.
- Client idempotency IDs now fall back to `crypto.getRandomValues` when `randomUUID` is unavailable on an HTTP LAN origin, keeping history sync, Session creation and Run submission functional from phones.

### Pending

- Production authentication, rate limits, cursor-expiry handling and multi-instance hardening.
- iPhone migration and iPhone/mobile-web cross-client validation.
