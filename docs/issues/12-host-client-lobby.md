# 12 — Host client lobby screen

## Summary

Build the `Lobby` screen: live roster list (updates on `roster_update`), player count, and a
"start game" button gated on 3–8 players, per `docs/DESIGN.md` §8.1.

## Context

Second host-client screen; the app navigates here after `host_ready` (issue 11).

## Scope

- `src/screens/Lobby.tsx`: subscribes to `roster_update` and the initial `host_ready` roster,
  renders each player's nickname and connection state (visually distinguish `connected` vs.
  `disconnected_grace` — e.g. greyed out with a "reconnecting…" label; `removed` players simply
  disappear from the list).
- Room code and QR code remain visible on this screen too (small persistent header), so
  latecomers can still join while others wait — reuse the component built in issue 11 rather than
  duplicating QR rendering logic.
- "Start Game" button: disabled with an inline message when `roster.length < 3` ("need at least 3
  players") or `> 8` (shouldn't be reachable given server-side rejection at join time, but handle
  defensively with the same disabled+message treatment); enabled otherwise, sends `start_game` on
  click.
- On `start_game` rejection (`error:not_enough_players` / `error:too_many_players`), show an
  inline error banner rather than a silent failure.
- On successful game start (server transitions room to `in_game`, reflected by the next
  `game_state` broadcast), navigate to the `InGame` screen (issue 13 — same placeholder-tolerance
  note as issue 11 if sequenced before 13 lands).
- Display `hostConnected` status is not relevant on this screen (the host client showing its own
  lobby obviously has itself connected) — no action needed here; this field matters for the player
  client instead (covered in issue 15).

## Detailed Requirements

1. Roster rendering must be keyed by `PlayerId`, not array index, so React reconciles
   join/leave/reconnect correctly without visual flicker/misassignment.
2. The player-count gating logic (3–8) must be a pure function shared conceptually with the
   server's own check (issue 04) — duplicating the literal bounds as constants in the host client
   is acceptable (no shared runtime code needed across client/server for this simple comparison),
   but keep the numbers `3`/`8` as named constants, not magic numbers, referencing
   `docs/DESIGN.md` §4.1 in a comment.

## Acceptance Criteria

- With 0–2 players joined (simulate via manual player-side `wscat` joins or issue 14's client once
  available), the "Start Game" button is visibly disabled and shows the "need at least 3 players"
  message.
- With 3–8 players joined, the button is enabled; clicking it sends `start_game` and, once the
  server accepts, the app navigates away from `Lobby`.
- A player disconnecting (close their WS) updates the roster list live to show
  `disconnected_grace` styling within the broadcast's normal latency (no manual refresh needed).
- A 9th join attempt from the player side is rejected server-side (already covered by issue 05);
  this issue's UI just needs to confirm the roster never exceeds 8 entries, so the button's
  overflow-disabled path is effectively unreachable in practice — still implement the defensive
  check.

## Validation

- Manual browser test joining 1, then 3, then 8 mock players via raw WebSocket (`wscat` scripted
  joins are fine — issue 14's real player client isn't a hard prerequisite for validating this
  screen, though using it once available is a good additional check) and observing the button
  state and roster list update live in the host browser.

## Dependencies

Issue 11 (host client scaffold, WS client, navigation seam).

## Non-goals

- No in-game rendering (issue 13).
- No player client (issue 14) — this issue can be validated with scripted WS joins standing in for
  real players.

## Design References

`docs/DESIGN.md` §8.1 (Lobby screen description), §4.1 (3–8 player bound), §4.2 (roster connection
states).
