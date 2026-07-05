# 04 — Room manager & room-level state machine

## Summary

Implement `RoomManager` (in-memory `Map<RoomCode, Room>`), room creation via `POST /api/rooms`,
and the room-level state machine (`LOBBY` / `IN_GAME` / `CLOSED`) from `docs/DESIGN.md` §4.1,
including room-code generation, collision retry, idle-timeout cleanup, and the `start_game` /
`end_room` transitions (without any real game engine yet — `start_game` transitions the room to
`IN_GAME` and records that a game "would" start; issue 07 supplies the actual engine it invokes).

## Context

This is the core authoritative state container described in `docs/DESIGN.md` §3.2 and §4.1. It
must exist before player/host session handling (issues 05/06) can attach connections to rooms.

## Scope

- `src/room/roomManager.ts`: `RoomManager` class/module with `createRoom(): { roomCode, hostToken
  }`, `getRoom(roomCode): Room | undefined`, `closeRoom(roomCode, reason: string): void`.
- `src/room/room.ts`: `Room` class holding: `code`, `phase: 'lobby' | 'in_game' | 'closed'`,
  `hostToken`, `hostConnectionRef` (nullable — attached in issue 06), `players: Map<PlayerId,
  PlayerSession>` (session fields beyond the shared `Player` domain type — e.g. connection ref,
  session token — attached in issue 05), `createdAt`.
- Room code generation: 4 chars from `ROOM_CODE_ALPHABET` (from `@partymode/shared`), reject
  collisions by retrying up to 10 times per `docs/DESIGN.md` §7.1, then throw (this should be
  effectively unreachable given the codespace size — log an error if it ever happens).
- Wire `POST /api/rooms` (replacing issue 03's `501` stub) to `RoomManager.createRoom()`, returning
  `201 { roomCode, hostToken }`.
- Room-level transition table implementation (`docs/DESIGN.md` §4.1):
  - `start_game` handler: validates room is `LOBBY` and `players.size` is in `[3, 8]`; on success
    sets `phase = 'in_game'` and calls a `onGameStart` hook (a no-op placeholder function pointer
    in this issue, replaced by real wiring in issue 07 — do not hardcode a TODO comment, define an
    actual optional constructor parameter/callback so issue 07 has a clean seam); on failure sends
    `error:not_enough_players` or `error:too_many_players` to the requesting host connection only.
  - `end_room` handler: any host action, any phase except `closed` → broadcasts `room_closed` to
    all connections in the room (players + host), then calls `RoomManager.closeRoom`.
  - Idle timeout: a room with no host connection AND fewer than 1 connected player for 10 minutes
    is closed automatically. Implement via a periodic sweep (e.g. `setInterval` every 60s checking
    `Room.lastActivityAt`) rather than one timer per room, to keep cleanup centralized in
    `RoomManager`.
  - `play_again` handler: only valid from a `FINAL_RESULTS` sub-state (issue 10 introduces this
    concept inside `IN_GAME`) — for this issue, since no game engine exists yet, implement the
    room-level plumbing (`phase: 'in_game' → 'lobby'` transition function) but leave the actual
    trigger wired as a stub the same way as `onGameStart`; issue 10 connects it for real.
- `RoomManager` must be a singleton instantiated once in `apps/server`'s `src/index.ts` and passed
  into the WebSocket message handler from issue 03 (replacing the placeholder `handleMessage`
  function body added there).

## Detailed Requirements

1. Room codes are generated using a CSPRNG-backed random source (Node's `crypto.randomInt` or
   equivalent) — not `Math.random()` — even though collision risk is not a security concern here,
   this avoids a known-bad pattern.
2. `RoomManager.createRoom()` must NOT open any WebSocket connection itself — it is invoked from
   the HTTP `POST /api/rooms` handler, purely allocating state and returning the code + token. The
   host's WebSocket `host_hello` (issue 06) attaches the actual connection afterward.
3. `hostToken` is a random 128-bit value (e.g. `crypto.randomBytes(16).toString('hex')`), single
   validity per room (not rotated on reconnect — reconnect uses a separate `sessionToken`, see
   issue 06).
4. `Room.lastActivityAt` must be updated on: room creation, any player join, any host
   connect/reconnect, any `submit_input`, any phase transition. This is the field the idle-timeout
   sweep reads.
5. Log every room-level transition (`lobby→in_game`, `in_game→lobby`, `*→closed`) with the room
   code and reason, to aid manual debugging during later issues' validation.

## Acceptance Criteria

- `POST /api/rooms` returns a unique `roomCode` matching `isValidRoomCode` and a `hostToken`, with
  HTTP 201.
- Calling `POST /api/rooms` twice produces two different room codes (verify via a small loop, e.g.
  20 calls, asserting no duplicates — acceptable given the codespace, not a strict guarantee but a
  reasonable smoke check).
- A room can be looked up by `RoomManager.getRoom(roomCode)` immediately after creation and is in
  `phase: 'lobby'`.
- Simulating a `start_game` event (via a unit test calling the handler directly, since no host WS
  wiring exists until issue 06) with 0, 2, 3, 8, and 9 mock players produces: reject, reject,
  accept→`in_game`, accept→`in_game`, reject, respectively, matching the `[3,8]` bound.
- Simulating `end_room` transitions any non-`closed` room to `closed` and the room becomes
  unreachable via `getRoom` afterward (or returns a room with `phase: 'closed'` if the
  implementer chooses to keep closed rooms briefly for late message diagnostics — either is
  acceptable as long as no further mutating action succeeds on a closed room).
- A unit test simulating `Room.lastActivityAt` older than 10 minutes with no host and no players
  results in the room being removed after the sweep runs (test may invoke the sweep function
  directly rather than waiting a real 60s interval).

## Validation

- Unit tests in `apps/server` (or a `src/room/*.test.ts` colocated suite) covering every bullet in
  Acceptance Criteria above, runnable via `npm test -w @partymode/server`.
- Manual: start the server, `curl -X POST http://localhost:8787/api/rooms` twice, confirm distinct
  `roomCode` values in the JSON responses.

## Dependencies

Issue 03 (server bootstrap — this issue replaces its `/api/rooms` stub and its placeholder message
handler).

## Non-goals

- No player join / nickname validation (issue 05).
- No host WebSocket attach (`host_hello`) handling (issue 06) — this issue only builds the room
  container and HTTP creation endpoint.
- No game engine invocation — `onGameStart`/`play_again` hooks are stubs wired for real in issues
  07 and 10.

## Design References

`docs/DESIGN.md` §4.1 (room-level state machine, both tables), §7.1 (room code collision, room not
found), ADR-001 (in-memory only, no persistence).
