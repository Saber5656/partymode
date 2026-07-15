# 11 — Host client scaffold + create-room/QR screen

## Summary

Build the real `apps/host` app shell: WebSocket client wrapper, HTTP client for `POST
/api/rooms`, routing between screens, and the first screen (`CreateRoom`) showing the room code
and a QR code linking to the player join URL.

## Context

First host-client issue in Wave 3. Depends on the server capabilities from waves 1–2 already
being in place (issues 03, 04, 06).

## Scope

- Add a lightweight client-side router (React Router, or a minimal hand-rolled screen-state
  switch if the implementer judges React Router unnecessary for ~4 screens — either is
  acceptable; document the choice).
- `src/lib/wsClient.ts`: a small wrapper around the browser `WebSocket` API that: connects to the
  server's WS endpoint (derive URL from `window.location` in production, or a `VITE_SERVER_URL`
  env var for local dev where host/server run on different ports), sends envelopes matching
  `@partymode/shared`'s protocol types, exposes a typed `on(type, handler)` subscription API, and
  implements the reconnect/backoff behavior from `docs/DESIGN.md` §8.2 (1s/2s/4s/8s, indefinite
  retries while the tab is open) — this reconnect logic is shared conceptually with the player
  client (issue 14) but each app may have its own copy; do not attempt to share code via a new
  package for v1 unless trivial (duplication across two small client apps is acceptable here).
- `src/lib/apiClient.ts`: thin `fetch` wrapper for `POST /api/rooms`.
- `src/screens/CreateRoom.tsx`: on mount, calls `POST /api/rooms`, keeps `hostToken` only long
  enough to complete `host_hello`, then stores `{ roomCode, sessionToken }` from `host_ready` in
  `localStorage` (key namespaced by roomCode, per `docs/DESIGN.md` §6.4), opens the WS connection,
  sends `host_hello`, and on receiving `host_ready` navigates to the `Lobby` screen
  (issue 12 — this issue may render a placeholder "Lobby coming soon" screen if issue 12 isn't
  merged yet, but must not block on it structurally; wire the navigation seam regardless).
- QR code rendering: add a QR code generation dependency (implementer's choice per
  `docs/DESIGN.md` §8.1 criteria: SVG/canvas output, no native deps, Vite-compatible) rendering a
  QR pointing at `<current-origin>/join?code=<roomCode>` (the player app's join-with-prefilled-code
  route, consumed by issue 14).
- Display the room code as large, readable text alongside the QR code (some players will type it
  manually rather than scan).
- On app load, before showing `CreateRoom`, check `localStorage` for an existing
  `{roomCode, sessionToken}` per §6.4 — if present, attempt `resume_session` first; only fall
  through to a fresh `CreateRoom`/`host_hello` flow if resume fails or no stored session exists.
  (Full reconnect robustness is issue 19's job; this issue only needs the basic
  attempt-resume-first seam so it isn't bolted on awkwardly later.)

## Detailed Requirements

1. `wsClient` must queue/buffer sends attempted while the socket is reconnecting (or simply
   reject/no-op with a caller-visible error) rather than throwing on `ws.send()` against a closed
   socket — pick a strategy and apply it consistently.
2. QR code target URL must use `window.location.origin` (or the configured player-app origin in
   dev, if host/player run on different Vite ports locally — expose this as a
   `VITE_PLAYER_APP_URL` env var, defaulting to same-origin for production single-port serving).
3. Do not hardcode `localhost` in the QR URL — it must work when the host machine's LAN IP is used
   instead (this is fully exercised in issue 20, but this issue's implementation must not special-
   case `localhost` in a way that breaks LAN IP usage).

## Acceptance Criteria

- Running `apps/host`'s dev server against a running `apps/server` (issue 06 complete), loading
  the app shows a room code and a scannable QR code within a few seconds of page load.
- The QR code's encoded URL, decoded manually (e.g. via any QR decoder), matches
  `<origin>/join?code=<the displayed room code>`.
- Network tab / WS inspection confirms: `POST /api/rooms` called once, then a WS connection opens
  and `host_hello` is sent with the returned `hostToken`, `host_ready` is received with a
  `sessionToken`, and localStorage stores the `sessionToken` rather than the bootstrap
  `hostToken`.
- Reloading the page re-attempts session resume before falling back to creating a brand-new room
  (verify via network inspection: a `resume_session` message is sent first if a prior session
  exists in `localStorage`).

## Validation

- Manual browser test: start `apps/server` and `apps/host` dev servers, open the host app in a
  browser, confirm the above Acceptance Criteria via devtools network/WS inspector.
- No automated UI test framework is required for v1 (not in scope per `docs/DESIGN.md` §10 —
  automated e2e is deferred); manual verification is sufficient and expected for all client
  issues (11–18).

## Dependencies

Issue 01 (host app scaffold), Issue 02 (shared protocol types for the WS client), Issue 03/06
(server must support `POST /api/rooms`... note: `POST /api/rooms` itself is issue 04, and
`host_hello` is issue 06 — list both as effective dependencies for a working manual test, though
this issue's *code* only needs issues 01–03 to exist to be written; full manual validation needs
04 and 06 deployed too).

## Non-goals

- No lobby roster display (issue 12).
- No in-game views (issue 13).
- No LAN-IP-specific dev tooling (issue 20).

## Design References

`docs/DESIGN.md` §8.1 (host client screens, QR code requirements), §6.4 (session token storage),
§6.2 (`create_room` HTTP contract, `host_hello`).
