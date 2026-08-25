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
- Added a selectable JSON polling Runtime transport with new-entry `dev:poll` startup, bounded request timeout, cursor-based event batches, and the existing SSE transport preserved.
- Added a `devrun crweb` full-stack path that builds and runs the source-worktree Relay, Mac Agent, and Gateway under the isolated `com.codexremote.runtime.dev` Supervisor LaunchAgent, while retaining direct Vite modes for fast frontend work.
- Integrated root `start.sh` with parameter-selected fixed ports, dependency preflight, isolated port cleanup, readiness checks, colored status output, and LAN URLs.
- Global `devrun` registrations for named and port-based Mobile Web startup.
- The project drawer now provides an explicit Mac history refresh action with accessible processed/total progress and a visible completion summary.
- Project-owned `service.sh` for launchd-backed restart, stop, and low-cost health checks covering the listener, Mobile Web HTTP, Relay, and Agent connection.
- Added `deploy.sh` for guarded one-command builds and ordered launchd restarts of the Mobile Web, Relay and Mac Agent local stack, with optional full pre-deployment tests.
- Added same-host source reference routing and a responsive code viewer with stable line numbers, target-line focus, current-worktree metadata, retry/copy actions, and explicit offline/auth/error states.
- Each assistant turn now shows a Codex-style `已处理 4分钟 56秒` timer with live processing motion, a settled completed state, server-reported duration, and restored-history fallback.
- Added the Go Mobile Web Gateway on fixed port `18774`, with production static/SPA delivery, optional Vite upstream, exact Runtime/Auth route allowlists, SSE streaming, forwarding-header sanitization, and local health checks.
- Added one-time pairing UI, in-memory Access Tokens, HttpOnly Refresh Cookie recovery, refresh rotation, cross-tab refresh locking, automatic 401 retry, logout, and revoked/expired pairing states.
- Added `gateway` modes to `start.sh` and `service.sh`, Gateway deployment orchestration, and the global `devrun 18774` registration.
- Added loopback-only automatic pairing for the `4173` Codex debug mode while preserving normal authentication for LAN, test and Gateway origins.
- Completed the 2026-08-23 iPhone 14 Pro LAN acceptance milestone covering QR pairing, refresh-cookie recovery, real Session/Run interaction, SSE completion, draft preservation, explicit logout and loopback control-plane revocation.

### Changed

- Local `devrun crweb` deployments now use the isolated debug port set `18874/18875/18876` for Gateway, Run Server, and Auth Control; the release-compatible `18774/18775/18776` ports remain unchanged.
- Interactive `devrun crweb` deployments now collapse verbose Vite, Go and launchd output into one progress line and one three-row result panel, preserve per-stage diagnostic logs, and finish with a white half-block QR sized for reliable phone scanning without printing its credential-bearing link; non-interactive deployments skip grant creation.
- The Gateway exposure policy is now isolated as the versioned `run-server-v1` contract, reported by its health endpoint and documented as a cross-repository compatibility boundary.
- The canonical stack deploy uses an explicit writable Go build cache, so sandboxed Codex Desktop restarts do not fail after services have already stopped.
- Session rows now derive running and interrupted state from the latest Run independently of selection, leave completed or empty status slots unmarked, and show a browser-local blue unread dot only for newer background completions; opening the Session clears it.
- The source viewer now uses a read-only CodeMirror 6 surface with dynamically loaded language highlighting, fixed gutters, stable scroll boundaries, an 8px default code size, zoom controls, a return-to-focus-line action and an explicit close action; closing restores conversation hit testing immediately so another source link can be opened without waiting for browser history events.
- Removed the Mock Runtime and legacy endpoint adapter; the client now uses only Runtime v1 HTTPS/SSE.
- New Session actions now show in-progress and visible failure states, remain actionable while the project catalog is loading, and reject duplicate submissions.
- Runtime history now syncs incrementally in the background on initial load, uses a renewable idempotency key, and automatically expands the selected project's restored sessions.
- Session selection now survives reloads through the same-host URL and browser-local storage; completed Mac snapshots remove archived Sessions from the drawer without silently moving an active workspace to the first visible Session.
- Missing or archived selected Sessions now show an explicit unavailable state with submission disabled, and non-component helpers moved out of `App.tsx` so Vite Fast Refresh no longer forces full-page reloads for App edits.
- Session detail loading now uses an explicit state machine and conversation-shaped delayed skeleton; a zero-Run prompt appears only after a successful snapshot, while failures expose focused retry actions without replacing cached content.
- Session details now use a Runtime-namespaced stale-while-revalidate cache with request deduplication, terminal Run reuse, bounded 24-hour IndexedDB snapshots, catalog-sequence invalidation, and graceful memory-only fallback.
- Opening a loaded Session now anchors at the final user question: short answers settle quickly, medium answers use an accelerate-cruise-decelerate reading profile, and answers longer than 2.5 viewports remain anchored with an explicit jump-to-latest control; direct scroll intent cancels motion immediately, with a no-motion fallback for reduced-motion users.
- Completed unresumed Mac snapshots now hide removed Projects as well as Sessions; reconnect-resumed imports trigger one fresh reconciliation retry and never report an incomplete catalog as current.
- The default Run Server URL now follows the browser's current host instead of embedding the Mac's startup-time LAN address, so DHCP changes no longer leave the Agent falsely offline.
- Client idempotency IDs now fall back to `crypto.getRandomValues` when `randomUUID` is unavailable on an HTTP LAN origin, keeping history sync, Session creation and Run submission functional from phones.
- Routine restarts now use layered service checks; full browser smoke testing is reserved for frontend interaction changes.
- Local launchers now discover Node.js and npm in standard Homebrew directories when a non-interactive process does not inherit the user's shell PATH.
- Local filesystem Markdown links are no longer opened as broken browser paths; recognized references use a hash URL and the Runtime `source:read` API, while normal web links retain external navigation.
- The default Runtime URL is now the page Origin. Normal browsers no longer discover or connect directly to Run Server port `18775`, and the inspector no longer accepts manually entered Access Tokens.

### Fixed

- Poll transport now owns its continuous long-poll loop: empty timeouts no longer trigger visible Session refreshes, real Session-event refreshes stay in the background, and active streamed messages are protected from a lagging snapshot to prevent periodic layout and scroll jitter.
- The Supervisor-based `crweb` deployment now rebuilds Relay and Mac Agent before restart, preventing a stale Relay binary from returning 404 for newly added Runtime routes such as `events:poll`.
- Supervisor restarts now cancel long-poll requests, wait for Gateway/Relay/Auth ports to exit, and force-close any request that exceeds the graceful shutdown deadline instead of failing the replacement stack.
- The development Supervisor now defaults the Mac Agent workspace root to the current user's home directory instead of the `codexremote` source directory, restoring discovery of sibling workspaces while retaining the `CODEXREMOTE_WORKSPACE_ROOT` override.
- Gateway launchd startup now runs prebuilt frontend and Gateway artifacts without requiring Go or Node.js in the daemon PATH, and its service health is independent from Relay/Agent availability.
- Safari can now process a fresh one-time pairing link when it reuses an existing `/pair` tab: fragment changes are observed, pairing exchanges are serialized, and duplicate delivery of the same code is ignored within the page session.

### Pending

- Public TLS/domain deployment, rate limits, cursor-expiry handling and multi-instance hardening.
- iPhone migration and iPhone/mobile-web cross-client validation.
- Reliable cross-tab refresh coordination for the insecure LAN HTTP origin; the current `navigator.locks` fallback permits concurrent refresh rotation and can trigger server-side replay revocation.
