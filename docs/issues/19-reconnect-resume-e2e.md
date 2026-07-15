# 19 — Reconnect/resume flow, end-to-end wiring

## Summary

Harden and integration-test the full reconnect/resume story across both clients and the server,
closing gaps left by issues 05/06/11/14 that only validated reconnect at the transport/session
layer or in isolated screens — this issue proves it works while a real game is mid-flight, across
every phase, using the real host and player client apps together.

## Context

Individual pieces (server session grace periods, client resume-first-on-load) were built in
issues 05, 06, 11, 14. This issue is the integration pass `docs/DESIGN.md` §1.1 (items 6–7 of the
"done" definition) requires: reconnecting mid-round and resuming as the same player/host with
state intact.

## Scope

- Verify and fix (if broken) the following flows using the real client apps (not just raw
  WebSocket scripts):
  1. A player backgrounds their phone (simulate: close and reopen the browser tab, or toggle
     devtools "offline" mode) during `prompt`, `vote`, or `reveal`, and returns within the grace
     period — they resume as the same player, same score, and if the phase they left is still
     open, they can still submit (a fresh submission, not an auto-resubmit of anything — nothing
     is cached client-side across a real reload since `bluffs`/`votes` live only in server memory
     scoped to that phase, and the client doesn't persist an in-progress draft).
  2. A player who reloads after the grace period has expired sees a clear "your session expired,
     rejoin" message (the app must handle `error:session_expired` and route back to the `Join`
     screen, per issue 14, rather than getting stuck).
  3. The host reloads mid-game and resumes as host, seeing the current phase's host view
     immediately (not a stale `CreateRoom`/`Lobby` screen).
  4. A stale host tab (e.g. the host opened the app in two tabs by accident) — the older tab must
     show a clear "disconnected: this session was taken over elsewhere" message on receiving close
     code 4002 (issue 06), rather than silently hanging or erroring unreadably in the console.
  5. Roster drops below `minPlayers` mid-game (per issue 10's pause) and recovers via a
     `disconnected_grace` player's reconnect — confirm both host and remaining player screens show
     the paused state and its resolution correctly (issue 13's/15's paused-banner wiring, if not
     already exercised end-to-end).
- Add a `WebSocket` close-code handler in both clients' `wsClient.ts` that distinguishes:
  unexpected/remote close (attempt reconnect per the backoff policy), client-initiated close
  (do not reconnect), code 4001/4002 (superseded/invalid — do NOT auto-reconnect, show an explicit
  terminal message instead), code specific to `room_closed`'s server-initiated close (if the server
  closes with a distinct code for this — check issue 04/06's implementation and use whatever code
  they emit; if none was assigned, this issue should assign one, e.g. 4003 for `room_closed`, and
  update `apps/server`'s `end_room`/idle-timeout/host-gone paths to use it consistently — this is
  a small retrofit into issue 04/06's code, acceptable scope for this integration issue).
- Fill any gaps found: if any of the five flows above don't actually work when exercised for real,
  fix the responsible layer (server session code from 05/06, or client resume logic from 11/14) —
  this issue's job is to make `docs/DESIGN.md` §1.1's reconnect promises actually true, not just to
  write a report of what's broken.

## Detailed Requirements

1. Do not weaken any server-side security/validation checks to make reconnect "work" — e.g. do not
   accept an expired `sessionToken` just to pass a manual test; fix the actual gap (client
   messaging, timer bug, etc.) instead.
2. Every close-code path must result in a client UI state that tells the user what happened and
   what to do next (rejoin / it's fine we're reconnecting / room is gone) — no silent
   failures, no bare `WebSocket` errors surfacing only in the browser console.
3. `wsClient.ts` must expose an intentional shutdown path for unmount/navigation (for example,
   `close({ reconnect: false })` or an internal `clientInitiatedClose` flag) and tests/manual
   validation must confirm it does not schedule the reconnect backoff.

## Acceptance Criteria

- All five flows enumerated in Scope work as described when manually exercised with the real
  host/player client apps against the real server.
- Unexpected/remote closes, client-initiated closes, close codes 4001/4002, and the room-closed
  code are each handled distinctly in both clients' reconnect logic (auto-retry vs. no-retry vs.
  terminal message), verified by triggering each condition manually and observing the resulting UI
  state.
- `docs/DESIGN.md` §1.1 items 6 and 7 ("done" criteria) are demonstrably true end-to-end.

## Validation

- Manual test script covering the five flows in Scope, run against the real apps, with results
  (pass/fail per flow, and what was fixed if anything failed) recorded as this issue's completion
  evidence.

## Dependencies

Issue 05, Issue 06 (server session/reconnect logic), Issue 13 (host in-game views, for the paused-
banner flow), Issue 18 (player in-game views, for the mid-round reconnect flow).

## Non-goals

- No new game features — this issue only hardens/wires reconnect behavior that should already
  exist per prior issues' specs.
- No automated CI test suite for these flows (manual validation is the v1 standard per
  `docs/ISSUE_PLAN.md` Validation Strategy).

## Design References

`docs/DESIGN.md` §1.1 (done criteria 6–7), §4.2 (both state tables), §6.4 (reconnection/session
tokens), §7.1 (superseded host, server crash handling), §7.2 (mid-game pause/recovery).
