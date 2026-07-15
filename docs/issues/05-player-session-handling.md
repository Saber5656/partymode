# 05 — Player join, session tokens, disconnect/reconnect

## Summary

Implement the player-facing WebSocket flow: `join_room`, session token issuance, the player-level
state machine (`CONNECTED` / `DISCONNECTED_GRACE` / `REMOVED`) from `docs/DESIGN.md` §4.2, and
`resume_session` for players.

## Context

Builds directly on the `Room`/`RoomManager` from issue 04. This issue makes rooms actually
joinable by phone clients (though no UI exists yet — validated via raw WebSocket in this issue's
own tests).

## Scope

- `src/room/playerSession.ts`: `PlayerSession` type/class extending the shared `Player` domain
  type with `connection: WebSocket | null`, `sessionToken: string`, `disconnectGraceTimer:
  NodeJS.Timeout | null`.
- `join_room` handler (first message on a new player WS connection):
  - Validate room exists and `phase === 'lobby'`; else `error:room_not_found` /
    `error:room_in_progress`, then close the socket (code 4000) since no valid session was
    established.
  - Validate nickname: 1–16 chars after trim, matches `/^[\p{L}\p{N} ]{1,16}$/u` (unicode
    letters/numbers/space, supports Japanese nicknames) — reject with `error:nickname_invalid`.
  - Validate nickname uniqueness case-insensitively among currently `connected` or
    `disconnected_grace` players in the room (a `removed` player's nickname is free per §7.1) —
    reject with `error:nickname_taken`.
  - Validate room has <8 current (`connected` + `disconnected_grace`) players — reject with
    `error:room_full`.
  - On success: create `PlayerSession`, add to `Room.players`, issue `sessionToken`, reply
    `joined` with `{ playerId, sessionToken, roster }`, then broadcast `roster_update` to
    everyone else in the room (host + other players).
- `resume_session` handler (player variant): validate `roomCode` exists, `sessionToken` matches a
  player currently in `disconnected_grace` state and the grace timer hasn't fired yet; on success
  cancel the grace timer, set state to `connected`, attach the new WS connection, broadcast
  `player_reconnected` (roster_update covers this — reuse `roster_update` as the single
  roster-change broadcast type per §6.3, do not invent a separate `player_reconnected` wire
  message unless `docs/DESIGN.md` explicitly lists one — it does not, so use `roster_update`);
  else `error:session_expired`, close socket (code 4000).
- WS `close`/`error` event handling for an attached player connection: set state to
  `disconnected_grace`, start a 45s timer, broadcast `roster_update`; before doing so, verify the
  eventing socket is still that player's current active connection. If a later `resume_session`
  already attached a replacement socket, ignore the old socket's late `close`/`error` entirely. On
  timer fire with no reconnect, set state to `removed`, broadcast `roster_update` again, and if
  this drops the connected-player count below `minPlayers` during `IN_GAME`, invoke the pause hook
  (stub in this issue — issue 10 wires the real pause behavior into the game engine; this issue
  only needs to call an injectable callback so that seam exists).
- Reject `submit_input` and any in-game message types from a player whose connection isn't in
  `connected` state (defensive — shouldn't normally be reachable since the connection is what
  carries the message, but guards against a race between grace-timer expiry and an in-flight
  message).

## Detailed Requirements

1. `sessionToken` is a random 128-bit value, distinct from `hostToken`/room codes, stored only in
   server memory (never persisted) and returned to the client once at join/resume time.
2. Case-insensitive nickname uniqueness must compare trimmed, lowercased nicknames — "Alex" and
   "alex " must conflict.
3. The 45s grace timer must be cancelable (cleared) the moment a valid `resume_session` arrives;
   do not let a stale timer fire and incorrectly remove a player who already reconnected (guard
   with a timer-generation counter or by nulling the stored timer handle and checking it before
   acting, whichever is simpler to get right).
4. Late `close`/`error` events from a superseded player socket must be ignored after a successful
   `resume_session`; only the currently attached socket can move the player into
   `disconnected_grace` or start a grace timer.
5. Reconnection must work from a *different* WebSocket connection object (simulating a phone
   reload) — do not key reconnect logic off anything tied to the old socket instance beyond the
   `sessionToken` itself.
6. On `removed`, free the player's `PlayerId` slot for player-count purposes but do not reuse the
   same `PlayerId` value for a new joiner (new joins always get a fresh random `PlayerId`).

## Acceptance Criteria

- A WS client sending `join_room` with a fresh nickname to an existing `lobby`-phase room receives
  `joined` with a valid `sessionToken` and a `roster` containing itself.
- A second WS client sending `join_room` with the same nickname (any case/whitespace variant)
  receives `error:nickname_taken` and is not added to the roster.
- A 9th join attempt on an 8-player room receives `error:room_full`.
- A join attempt on a nonexistent room code receives `error:room_not_found`.
- Closing a joined player's WS connection results in a `roster_update` broadcast showing that
  player as `disconnected_grace`, and a `resume_session` with the correct token within 45s
  reattaches them as `connected` (verify via a real timer in a fast test — e.g. shorten the grace
  period via an injectable config value in test setup rather than actually waiting 45s in CI/dev
  runs).
- Waiting past the grace period without reconnecting results in `removed` state and a further
  `resume_session` attempt with the same (now-expired) token receives `error:session_expired`.
- After `removed`, a brand-new `join_room` using the same nickname the removed player used
  succeeds (nickname freed).

## Validation

- Unit/integration tests in `apps/server` spinning up the server (or the room/session module in
  isolation with mock WS objects) covering every Acceptance Criterion above.
- Manual `wscat` session: open two connections to the same room, join both, close one, observe
  `roster_update` on the other, reconnect via `resume_session`, observe `roster_update` again.

## Dependencies

Issue 04 (room manager and room-level state machine).

## Non-goals

- No host-side session handling (issue 06, separate token type and grace period).
- No game-phase-aware input validation (`submit_input` phase-matching is issue 07+; this issue
  only blocks input from non-`connected` players, it does not validate `data` shape).
- No UI (issues 14–18).

## Design References

`docs/DESIGN.md` §4.2 (player-level state table + transition table), §6.2 (`join_room`,
`resume_session`, `submit_input`), §6.3 (`joined`, `roster_update`, `error`), §6.4 (session
tokens), §7.1 (nickname reuse after removal, room full).
