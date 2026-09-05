# 15 — Player client lobby waiting screen

## Summary

Build the player-side `Lobby` screen: waiting state showing roster/player count and host
connection status, navigating onward automatically when the host starts the game.

## Context

Second player-client screen, entered after `joined` (issue 14).

## Scope

- `src/screens/Lobby.tsx`: shows "waiting for host to start" copy, a live count of joined players
  (from `roster_update`), and the current player's own nickname confirmed on-screen (so a player
  can double check they joined as intended).
- Show a "reconnecting to host…" or similar banner when the room's `hostConnected` field (from
  issue 06) is `false`.
- On the room transitioning to `in_game` (first `game_state` broadcast received), navigate to
  `InGame` (issues 16–18 — placeholder-tolerant if sequenced first, same convention as prior
  issues).
- Handle `room_closed` (e.g. host ended the room while players waited) by navigating to a
  terminal "Room closed" screen, clearing `localStorage` for that room.

## Detailed Requirements

1. This screen must not expose any host-only actions (no start/end buttons) — purely a waiting/
   status view, matching the player's non-authority role per `docs/DESIGN.md` §6.2.
2. Player count display should be based on `connected` + `disconnected_grace` players (i.e. still
   "in the room" even if briefly dropped), not just `connected`, so the count doesn't flicker down
   and up during a brief reconnect blip.

## Acceptance Criteria

- Joining a room and remaining in `Lobby` shows an accurate, live-updating player count as other
  mock players join/leave.
- Disconnecting and reconnecting the host (simulate via issue 06's mechanics) toggles the
  "reconnecting to host" banner correctly.
- When the host issues `start_game` (from the host client or a scripted WS message), the player
  screen navigates away from `Lobby` automatically with no user action required.
- When the host issues `end_room`, the player screen navigates to the terminal "Room closed"
  screen.

## Validation

- Manual browser test with one browser tab as host (issue 12) and one or more as players,
  confirming the transitions above.

## Dependencies

Issue 14 (player client scaffold, join flow), Issue 05 (roster_update/hostConnected data — issue
06 for hostConnected specifically).

## Non-goals

- No in-game UI (issues 16–18).

## Design References

`docs/DESIGN.md` §8.2 (Lobby waiting screen description), §4.2 (host connection status
relevance to players).
