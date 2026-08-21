# Mobile Web Engineering Guidelines

## Repository Boundary

- This directory is an independent Git repository and a user-facing Runtime client, not Admin Web.
- Do not import sibling repository source code or depend on parent-workspace paths.
- Coordinate Runtime changes through versioned OpenAPI, event schemas, fixtures, and compatibility records.
- Browser code must never connect directly to Redis, PostgreSQL, Mac Agent WSS, or Admin APIs.

## Product Direction

- Treat mobile as the primary viewport and preserve the interaction vocabulary of the iPhone App without copying Apple-only implementation details.
- Keep the desktop layout operational and information-dense; it is the primary surface for communication debugging.
- Use semantic HTML, visible controls for actions, keyboard navigation, safe-area insets, and reduced-motion support.
- Keep active composer text local and submit only a trimmed immutable prompt.

## Runtime Integration

- Keep transport behind `RuntimeClient`; UI components must not contain endpoint-specific logic.
- Keep HTTP/SSE adapters isolated and cover parsing and state transitions with deterministic fixtures.
- Treat Runtime v1 HTTP and SSE shapes as versioned contracts coordinated with Relay compatibility records.
- Resume streams from a durable snapshot/cursor boundary; do not treat an open SSE connection as the source of truth.
- Never persist access tokens in browser storage or logs.

## Verification

- Run `npm test` and `npm run build` after non-trivial changes.
- Exercise create, stream, cancel, reconnect/error, drawer, inspector, mobile, and desktop flows in a real browser.
- A successful build or static screenshot is not sufficient proof of interaction behavior.
