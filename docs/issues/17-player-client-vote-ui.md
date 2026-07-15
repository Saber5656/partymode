# 17 — Player client VOTE UI

## Summary

Build the player-side `vote` phase view: a tappable multiple-choice list of shuffled answers
(excluding the player's own bluff), sending `submit_input` with the chosen stable answer id.

## Context

Second in-game player view; consumes issue 09's `vote`-phase `projectPlayerView` output (which
already excludes the player's own bluff entry server-side).

## Scope

- `VoteView` (player): the question text again (repeated for context, matching the host's re-
  display per `docs/DESIGN.md` §5.2), a list of tappable answer options rendered from
  `playerView.answers` (already excludes the player's own bluff — no client-side filtering
  needed, just render what's given), a countdown timer (same resync approach as issue 16).
- Tapping an option immediately sends `submit_input` with `{ phase: 'vote', data: { answerId } }`
  and shows a "voted, waiting for others…" state with the chosen option visually highlighted;
  allow changing the vote before the phase ends (tap a different option → resubmit, last-write-
  wins per server behavior from issue 09), same re-enable-via-explicit-action pattern as issue 16
  if the implementer wants to avoid accidental mis-taps changing a committed vote — a simpler
  alternative (allowed here since voting is a single tap, lower risk of accidental double-action
  than free text) is to just let any tap on a different option resubmit directly; pick whichever
  the implementer judges better for phone UX and note the choice.
- Rejected self-vote / invalid answer attempts (shouldn't be reachable through the UI since the
  player's own entry isn't in the list, but defensively handle a server rejection) show a generic
  inline error and allow retry.

## Detailed Requirements

1. Answer options must render in the exact order the server sent (no client-side re-sorting), and
   each tap must submit the stable `answerId` supplied by the server for that option.
2. Tap targets must be large enough for comfortable phone use (a UI/UX judgment call, not a
   testable acceptance criterion — just avoid tiny inline text links as the only tap target; use
   full-width button-style rows).

## Acceptance Criteria

- Entering the `vote` phase shows the question and the shuffled answer list, with the player's own
  bluff correctly absent (verify by checking against what was submitted in issue 16's flow).
- Tapping an option sends the vote and shows the "voted" confirmation state; the host's voted-count
  (issue 13) increments accordingly.
- Changing the selected option before the timer elapses updates the server's recorded vote (verify
  via the eventual `reveal` phase's scoring reflecting the final choice, or via server-side
  inspection/logs).
- Letting the timer elapse with no vote made transitions the player screen into the `reveal` phase
  (issue 18) with the player correctly scored 0 for that round.

## Validation

- Manual browser test: two or more player browser tabs progressing through `prompt`→`vote`,
  confirming each sees a correctly-filtered answer list and that votes register correctly
  (cross-check against `reveal` phase output once issue 18 exists, or against server logs).

## Dependencies

Issue 16 (prompt phase view, InGame screen shell), Issue 09 (bluff-trivia vote phase and scoring).

## Non-goals

- No `reveal`/`final_results` views (issue 18).

## Design References

`docs/DESIGN.md` §5.2 (VOTE row), §8.2 (VoteView description), §7.1 (self-vote rejection,
last-write-wins).
