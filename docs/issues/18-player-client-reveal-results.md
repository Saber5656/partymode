# 18 — Player client REVEAL + FINAL_RESULTS UI

## Summary

Build the player-side `reveal` phase view (truth/author reveal, own round score) and the
`final_results` screen (own final rank, waiting-for-host state), completing the player client's
coverage of the full bluff-trivia game loop.

## Context

Final player-client view issue; consumes issue 09's `reveal` and issue 10's `final_results`
projections.

## Scope

- `RevealView` (player): shows which answer was the truth, each answer's author, and the
  player's own round score delta (`yourDelta`) prominently (e.g. "+1000!" or "+0"), plus the
  running leaderboard (same data/order as the host's, rendered compactly for a phone screen — a
  simple ranked list is sufficient, no requirement to match the host's exact layout).
- `FinalResults` (player): the player's own final rank/score highlighted, the full final
  leaderboard, and a "waiting for host to start a new game / end the room" message (players have
  no `play_again`/`end_room` authority per `docs/DESIGN.md` §6.2 — this screen is read-only).
- On the room returning to `lobby` (host clicked "Play Again"), navigate the player back to
  `Lobby` (issue 15) with their own displayed score reset to 0.
- On `room_closed`, navigate to the terminal "Room closed" screen (same as issue 15's handling),
  clearing `localStorage`.

## Detailed Requirements

1. `RevealView` and `FinalResults` must render leaderboard entries in the exact order/scores the
   server sends — no client-side re-sorting or re-computation of scores.
2. Distinguish visually between "you fooled someone" information (implicit in a high positive
   delta) and "you guessed the truth" — the simplest correct approach is just showing the raw
   delta number; the module's scoring (issue 09) already combines both sources into one number
   per `docs/DESIGN.md` §5.3, so the UI does not need to separately break down the +1000 vs. +500
   components unless the implementer wants to for extra clarity (optional, not required).

## Acceptance Criteria

- After voting (issue 17), the player screen transitions to `RevealView` showing the correct
  truth/author information and their own round delta, consistent with what the host screen
  (issue 13) shows for the same round.
- After round 3's reveal, the player screen shows `FinalResults` with an accurate final rank
  matching the host's final leaderboard.
- When the host clicks "Play Again" (issue 13), the player screen returns to `Lobby` with score
  reset to 0.
- When the host clicks "End Room", the player screen shows the terminal "Room closed" state.

## Validation

- Manual browser test: complete a full 3-round game with host + 3 player browser tabs (mixing
  real UI from issues 11–18 where available), confirming every player's final screen matches the
  host's leaderboard and that "Play Again"/"End Room" propagate correctly to all player tabs.

## Dependencies

Issue 17 (vote phase view, InGame screen shell), Issue 10 (round loop, final results, scoring).

## Non-goals

- None beyond what's listed — this issue completes the v1 player client's phase coverage.

## Design References

`docs/DESIGN.md` §5.2 (REVEAL, FINAL_RESULTS rows), §5.3 (scoring), §8.2 (RevealView/
FinalResults description).
