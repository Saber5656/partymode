# 06 — Host session, authority checks, disconnect/reconnect

## Summary

Implement the host-facing WebSocket flow: `host_hello`, host `resume_session`, the host
connection state machine (mirrors player's but with a 60s grace period per `docs/DESIGN.md` §4.2),
host-only authority checks (`start_game`, `end_room`, `play_again` may only be issued by the
attached host connection), and superseded-host handling (`docs/DESIGN.md` §7.1 stale-host-tab
case).

## Context

Completes the transport/session layer alongside issue 05, so that by the end of wave 1 a room can
be fully driven (created, joined, started, ended) via raw WebSocket messages with no game engine
yet required.

## Scope

- `host_hello` handler (first message on a new host WS connection): validate `roomCode` exists and
  `hostToken` matches the value returned by `POST /api/rooms` (issue 04); on success attach the
  connection as the room's host, reply `host_ready` with `{ roomCode, roster }`; on failure
  `error:room_not_found` (if code doesn't exist) — a token mismatch is treated as
  `room_not_found` as well (do not leak whether the code exists vs. the token being wrong; this is
  a light security nicety, not a hard requirement, but cheap to do consistently).
- Host `resume_session` handler: same shape as issue 05's player version but validates against the
  room's single host session token/grace state instead of a per-player one.
- Superseded-host handling: if a new `host_hello`/`resume_session` succeeds while a previous host
  connection is still live (not in grace), close the *old* connection with code 4002 and reason
  `superseded`, per `docs/DESIGN.md` §7.1.
- Host disconnect: WS close/error on the attached host connection → start a 60s grace timer,
  broadcast nothing special to players beyond what's needed (per `docs/DESIGN.md` there's no
  explicit "host disconnected" player-facing message required in v1 beyond the room simply not
  advancing — but do add one for UX clarity: reuse a generic status field on the next
  `game_state`/`roster_update` broadcast indicating `hostConnected: boolean`, since players'
  screens should be able to show "waiting for host to reconnect" — add this boolean field to the
  `roster_update` and `game_state` payload shapes as a documented extension of issue 02's schemas,
  updating `packages/shared` in this issue).
- Host grace timeout (60s, no reconnect) → `RoomManager.closeRoom(roomCode, 'host_gone')`,
  broadcasting `room_closed` to any remaining player connections.
- Authority guard: a shared helper `requireHost(room, connection)` used by every host-only message
  handler (`start_game`, `end_room`, `play_again`, and any future host-only message) that rejects
  with `error:invalid_message` (no more specific code needed — this should not be reachable by a
  legitimate client) if the message didn't arrive on the room's currently-attached host
  connection.

## Detailed Requirements

1. Host grace period is 60s (longer than player's 45s) per `docs/DESIGN.md` §4.2 rationale (losing
   the host is more disruptive). Make both durations named constants in one place (e.g.
   `apps/server/src/room/constants.ts`) rather than magic numbers duplicated across issues 05/06.
2. `hostToken` (from room creation) and the host's `sessionToken` (issued at `host_hello` time,
   used for `resume_session`) are two distinct values — do not conflate them. `hostToken` proves
   "I created this room" (used once, at first `host_hello`); `sessionToken` proves "I am the
   already-attached host reconnecting" (used for `resume_session` after a drop). Document this
   distinction in a code comment since it's a subtle but important separation of concerns.
3. Extending `packages/shared`'s schemas for `hostConnected` must be a backward-compatible
   additive field (existing tests from issue 02 must still pass; add new test cases rather than
   rewriting old ones).
4. The superseded-close (code 4002) must happen *before* the new connection starts receiving
   broadcasts, to avoid a brief window where two sockets both think they're "the host".

## Acceptance Criteria

- A WS client sending `host_hello` with the correct `roomCode`+`hostToken` pair (from a prior
  `POST /api/rooms` call) receives `host_ready` with the current roster.
- An incorrect `hostToken` (or nonexistent `roomCode`) yields `error:room_not_found`.
- `start_game`, `end_room`, `play_again` sent from a connection that never completed `host_hello`/
  `resume_session` for that room are rejected with `error:invalid_message` and produce no state
  change.
- Closing the host connection and reconnecting via `resume_session` with the correct
  `sessionToken` within 60s succeeds and the room's `hostConnected` status (as seen by a
  simultaneously-connected player's next broadcast) flips false→true.
- Opening a *second* `host_hello` with valid credentials while the first host connection is still
  live results in the first connection being closed with code 4002, and only the second connection
  can subsequently issue host-only commands successfully.
- Letting the host grace timer expire (60s, or the test-shortened equivalent) results in the room
  closing and any connected player receiving `room_closed`.

## Validation

- Unit/integration tests mirroring issue 05's structure, covering every Acceptance Criterion
  above, using an injectable/shortened grace period for fast tests.
- Manual two-terminal `wscat` session: `POST /api/rooms`, `host_hello` in terminal A, `join_room`
  in terminal B, close terminal A, observe terminal B's next broadcast shows `hostConnected:
  false`, reconnect terminal A via `resume_session`, observe `hostConnected: true`.

## Dependencies

Issue 04 (room manager), Issue 05 (establishes the pattern for grace-timer session handling this
issue mirrors for the host role — implement after or alongside 05, but 05's player grace-timer
code should exist first as the reference pattern).

## Non-goals

- No game-engine-aware `start_game` behavior (issue 07 supplies the real engine hook; this issue
  only performs the room-level phase transition and authority check, per issue 04's stubbed
  `onGameStart`).
- No UI (issues 11–13).

## Design References

`docs/DESIGN.md` §4.2 (host-level states, prose paragraph after the player transition table),
§6.2 (`host_hello`, `resume_session`, `start_game`, `end_room`, `play_again`), §6.3 (`host_ready`),
§7.1 (superseded host, code 4002).
