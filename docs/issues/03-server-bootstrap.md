# 03 — Server HTTP + WebSocket bootstrap

## Summary

Turn `apps/server` from issue 01's placeholder into a real long-running process: an HTTP server
(serving a health check and the future static client builds) plus a WebSocket server sharing the
same port, with message parsing wired to `@partymode/shared`'s protocol schemas. No room/game
logic yet — this issue only establishes transport plumbing.

## Context

`docs/DESIGN.md` §3.1 specifies one Node.js process serving both HTTP and WebSocket traffic on a
single port, per ADR-001 (no external services). This issue builds that process shell.

## Scope

- Add `ws` (WebSocket server library) and a minimal HTTP framework to `apps/server`. Use Node's
  built-in `http` module directly, or a lightweight framework (Fastify) — implementer's choice;
  document the choice in a one-line comment in `src/index.ts`. Do not add Express unless Fastify
  proves awkward to integrate with `ws`'s `noServer`/upgrade pattern — prefer whichever integrates
  with a shared HTTP server + WS upgrade handshake most simply.
- `GET /healthz` → `200 { status: "ok" }`.
- `POST /api/rooms` → stub for now: returns `501 Not Implemented` with a body noting "room manager
  not yet implemented" (real implementation lands in issue 04; this issue must not block on it,
  but the route must exist and be replaced, not invented fresh, in issue 04).
- WebSocket upgrade handling on the same HTTP server/port: accept all upgrade requests at this
  stage (no room/auth validation yet — that's issues 04–06), parse every incoming message using
  `@partymode/shared`'s `parseClientMessage`, and:
  - On parse success: log the parsed message type (structured console log is sufficient, no
    logging framework required for v1).
  - On parse failure: send back an `error` message with code `invalid_message` (per §6.3) and do
    NOT close the connection.
- Respond to `heartbeat` messages with `heartbeat_ack` (the only message type this issue actually
  "handles" end-to-end, since it requires no room context).
- Server listens on a configurable port via `PORT` env var, defaulting to `8787`.
- Graceful shutdown: on `SIGINT`/`SIGTERM`, close the HTTP server and all open WebSocket
  connections cleanly, then exit 0.

## Detailed Requirements

1. Single port for both HTTP and WS — do not run two separate `listen()` calls on different ports.
2. Use `@partymode/shared`'s `PROTOCOL_VERSION` constant: reject any client message whose `v`
   field doesn't equal it, replying with `error:protocol_version_mismatch` (per §6.1) without
   closing the connection.
3. Structure the code so room/session logic can be added in issues 04–06 without restructuring the
   HTTP/WS bootstrap — e.g. a `createServer()` function returning `{ httpServer, wss }`, with a
   clearly separated `handleMessage(ws, message)` function that issue 04 will extend/replace with
   real routing (do not over-engineer a plugin system for this — a single function is fine, and
   later issues are expected to edit it directly).
4. No CORS handling required for v1 (host/player clients are served from the same origin as the
   API in production; for local dev with separate Vite dev-server ports, add permissive CORS only
   on `/api/*` routes scoped to local development — do not add a wildcard CORS header on WS
   upgrade, which doesn't need it).

## Acceptance Criteria

- `npm run dev:server` starts a long-lived process listening on port 8787 (or `PORT` env override)
  and does not exit.
- `curl -s http://localhost:8787/healthz` returns `{"status":"ok"}` with HTTP 200.
- `curl -s -X POST http://localhost:8787/api/rooms` returns HTTP 501 with a JSON body containing
  a `message` field.
- A WebSocket client (e.g. `wscat -c ws://localhost:8787`) can connect, send a valid `heartbeat`
  envelope (`{"type":"heartbeat","v":1,"payload":{}}`), and receive a `heartbeat_ack` envelope
  back.
- Sending malformed JSON or a JSON object missing required protocol fields over the same
  connection yields an `error` message with `code: "invalid_message"` and the connection stays
  open (verify with a second `heartbeat` on the same connection succeeding afterward).
- Sending a message with `v: 2` (or any value other than 1) yields
  `error:protocol_version_mismatch` without closing the connection.
- `SIGINT` (Ctrl-C) to the running process results in clean exit (no hanging process, no
  stack trace).

## Validation

- Manual `curl` + `wscat` session per the Acceptance Criteria above; capture the commands and
  expected output as an evidence log (per user's global CLAUDE.md rule — this is a "major
  judgment/verification result", so keep the transcript for the eventual Vault record if this
  repo's task is tracked there).
- No automated test suite required for this issue specifically, but if `packages/shared` already
  has a test harness from issue 02, a minimal integration test spinning up the server and hitting
  `/healthz` is encouraged (optional, not blocking).

## Dependencies

Issue 01 (scaffold), Issue 02 (shared protocol schemas).

## Non-goals

- No room creation logic (issue 04) — `/api/rooms` is a stub.
- No player/host join handling, no session tokens (issues 05, 06).
- No authentication/authorization beyond protocol-version checking.
- No TLS/HTTPS — plain HTTP/WS for v1, matching the LAN/localhost-only execution model in
  `docs/DESIGN.md` §9.

## Design References

`docs/DESIGN.md` §3.1 (runtime topology), §6.1 (envelope + version field), §6.2/§6.3 (`heartbeat`/
`heartbeat_ack`), ADR-001 (single process, no external services).
