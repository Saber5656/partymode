# 21 — End-to-end manual/scripted smoke test

## Summary

Produce the repeatable v1 acceptance test: a documented (and where practical, scripted) procedure
that exercises the entire product from room creation through a completed 3-round game, plus the
reconnect scenarios, serving as the final gate before declaring v1 complete.

## Context

This is "Final gate" in `docs/ISSUE_PLAN.md`'s Validation Strategy and directly validates
`docs/DESIGN.md` §1.1's full "done" checklist. Per `docs/ISSUE_PLAN.md`, this is a documented
manual/scripted procedure, not a CI job (automated e2e is deferred to v2).

## Scope

- `docs/SMOKE_TEST.md` (new file): a numbered checklist a human (or the implementer, self-
  verifying before marking v1 done) runs through, covering:
  1. Build and start per `docs/RUNBOOK.md` (issue 20).
  2. Create a room on the host device, confirm room code + QR displayed.
  3. Join with 3 separate devices/browser profiles (phones, or desktop browser device-emulation
     profiles as a fallback if fewer than 3 physical phones are available) using a mix of QR scan
     and manual code entry.
  4. Start the game with exactly 3 players; confirm all 3 rounds play through
     `round_intro→prompt→vote→reveal` correctly, with at least one round including: a player who
     lets the prompt timer expire, a player who changes their vote before submitting, and a
     correct-answer guess by at least one player.
  5. Confirm the final leaderboard matches manually-computed expected scores for the scripted
     inputs above (compute expected scores by hand from the known bluffs/votes used in the test
     run, and compare against what the app shows).
  6. Click "Play Again", confirm a fresh game starts with reset scores and no repeated question
     from the just-finished game... — note: `usedQuestionIds` resets per new `GameEngine`
     instance (issue 10), so a repeat *is* possible across separate games by design; the checklist
     item should instead confirm scores reset to 0 and roster carries over correctly, not that
     questions never repeat across games.
  7. Click "End Room", confirm all devices show the terminal "Room closed" state.
  8. Reconnect scenarios (reuse issue 19's five flows as checklist items directly, referencing
     that issue rather than re-describing them).
  9. Roster-below-minimum pause/resume scenario (reuse issue 10's pause behavior as a checklist
     item).
- Optionally, a scripted Node helper (`scripts/smoke-test-client.mjs` or similar, using the `ws`
  library) that automates the *player-side* WebSocket interactions (join, submit bluffs, vote) for
  steps 3–5 above, so a single human only needs to operate the host browser and can trigger 3+
  scripted "virtual players" instead of needing physical devices every time this checklist is re-
  run during future development. This script is a convenience, not a substitute for at least one
  real multi-device run before declaring v1 done.

## Detailed Requirements

1. The checklist must be concrete enough that "pass/fail" is unambiguous for each step (e.g. "the
   leaderboard shows the same total scores as my hand-computed expected values" rather than "the
   game seems to work").
2. If any step fails during the actual run, this issue's job includes routing the failure back to
   the responsible earlier issue for a fix (do not patch symptoms inside the smoke test itself) —
   record which issue's implementation was fixed as part of this issue's completion evidence.

## Acceptance Criteria

- `docs/SMOKE_TEST.md` exists with all checklist items from Scope, each with an unambiguous
  pass/fail condition.
- A full run of the checklist (real or scripted-player-assisted) is performed at least once, with
  every item passing, and any bugs found along the way are fixed in their owning issue's code
  before this issue is considered complete.
- The optional scripted helper, if built, successfully drives a full 3-player game to completion
  when run against a live server.

## Validation

- The checklist run itself *is* the validation for this issue — capture a brief evidence log
  (what was run, what passed, what was fixed) as this issue's completion record.

## Dependencies

Issue 19 (reconnect/resume hardening), Issue 20 (LAN dev-run capability, needed to actually run the
smoke test in a realistic setting).

## Non-goals

- No CI pipeline / automated e2e suite (deferred to v2 per `docs/DESIGN.md` §10).
- No load/performance testing (out of scope for v1's ≤8-player, single-room-at-a-time use case).

## Design References

`docs/DESIGN.md` §1.1 (full done checklist, all 7 items), `docs/ISSUE_PLAN.md` Validation
Strategy (final gate description).
