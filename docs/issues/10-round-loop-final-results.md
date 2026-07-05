# 10 — Round loop orchestration + FINAL_RESULTS

## Summary

Complete the bluff-trivia `GameModule` by looping `reveal → round_intro` for rounds 2 and 3, then
transitioning to `final_results` after round 3's reveal, implementing `isGameOver`/
`computeFinalScores`, wiring `play_again` back to the room's `lobby` phase, and implementing the
mid-game pause/resume behavior from `docs/DESIGN.md` §7.2 (roster drops below `minPlayers` during
`IN_GAME`).

## Context

This is the last piece needed for the bluff-trivia game to be fully playable end-to-end over raw
WebSocket (the Wave 2 gate in `docs/ISSUE_PLAN.md`).

## Scope

- `advancePhase(state)` for phase `reveal`:
  - If `state.roundIndex + 1 < state.totalRounds` (i.e. more rounds remain): increment
    `roundIndex`, pick a new question not in `usedQuestionIds`, reset `bluffs`/`votes`/
    `lastRoundDeltas` to empty, set `phase: 'round_intro'`.
  - Else (`roundIndex` was the last round): set `phase: 'final_results'`.
- `isGameOver(state)`: `true` iff `state.phase === 'final_results'`.
- `computeFinalScores(state)`: returns `Array<{ playerId, score }>` from `state.scores`, sorted
  desc, tie-broken by original join order (requires the module to have access to join order —
  thread it through as an extra field on `BluffTriviaState`, e.g. `joinOrder: PlayerId[]`, set once
  in `createInitialState`).
- `getPhaseTimeoutMs('final_results')`: `null` (advanced only by host `play_again`/`end_room`, no
  auto-timer).
- `projectHostView`/`projectPlayerView` for `final_results`: `{ phase, finalLeaderboard:
  {nickname, score, rank}[] }` (player view additionally includes `yourRank`).
- Wire `Room`'s `play_again` (stub since issue 04) for real: only accepted when the room's active
  `GameEngine.isGameOver()` is true; on success, tear down the `GameEngine` instance and transition
  `Room.phase` back to `'lobby'`, broadcasting `roster_update` with everyone's `score` reset to 0
  in the *room-level* roster (per-game scores are internal to the finished `GameEngine` and should
  not leak into the next game's fresh state) — clarify in code comment that `Player.score` in the
  shared `roster` type is a lobby-facing convenience mirror of the last completed game's final
  score until a new game starts, at which point it resets to 0.
- Mid-game pause/resume trigger (`docs/DESIGN.md` §7.2): in the WS layer (extending issues 05/06's
  disconnect handling), when a player transitions to `removed` during `IN_GAME` and the resulting
  connected-player count drops below the active `GameModule`'s `minPlayers`, call
  `GameEngine.pause()` (mechanics already built in issue 07) and broadcast a `game_state` update
  whose host/player views include an additional `paused: boolean` field (extend
  `packages/shared`'s `game_state` payload schema, additive change per issue 06's precedent for
  `hostConnected`). When a `roster_update` brings the connected count back to ≥`minPlayers` while
  paused, call `GameEngine.resume()` and clear the `paused` flag.
- `end_room` while paused must still work (already generically supported since issue 04/06 — this
  issue just needs a regression test confirming pause doesn't block it).

## Detailed Requirements

1. `paused: boolean` must be a generic field on the engine-level broadcast wrapper (added in issue
   07's broadcast callback shape or the WS-layer message construction, whichever the implementer
   finds cleaner) rather than a bluff-trivia-specific field, since pause is a cross-cutting engine
   concern per `docs/DESIGN.md` §7.2, not game-specific.
2. Question selection across all 3 rounds must never repeat (`usedQuestionIds` accumulates across
   `round_intro` transitions) — if the bank has fewer than 3 unused questions left (shouldn't
   happen with a 15+ question bank and only 3 rounds, but guard anyway), throw a clear internal
   error rather than silently repeating a question.
3. `play_again` must produce a genuinely fresh game: new `GameEngine` instance, new
   `createInitialState` call (new random starting question, `usedQuestionIds` reset), not a mutated
   reuse of the finished one.

## Acceptance Criteria

- Simulating 3 full rounds (`round_intro→prompt→vote→reveal` × 3) via issue 07's `GameEngine` with
  3–4 mock players results in `phase: 'final_results'` after the third `reveal`'s `advancePhase`
  call, with no question id repeated across the 3 rounds.
- `computeFinalScores` returns scores matching the sum of all three rounds' deltas per player,
  sorted descending, with deterministic tie-break by join order (unit test with a contrived tie).
- `play_again` issued by the host while `phase !== 'final_results'` (mid-round) is rejected
  (matches `docs/DESIGN.md` §6.2's validation: "Only allowed from FINAL_RESULTS").
- `play_again` issued correctly from `final_results` tears down the old engine, room returns to
  `lobby`, and a subsequent `start_game` begins a fresh 3-round game with reset scores.
- Simulated roster drop below `minPlayers` (3) during `IN_GAME` (e.g. 3 players, one gets
  `removed`) results in the engine pausing (its phase timer does not fire early/late — assert via
  the fake-clock approach from issue 07) and the next broadcast including `paused: true`.
- Simulated roster recovery (a 4th player joins mid-pause — note: per `docs/DESIGN.md` non-goals,
  new players cannot join mid-game; recovery in v1 only happens via an existing player's
  `resume_session`, not a brand-new join — adjust the test to reconnect a previously-removed... no,
  `removed` is terminal per §4.2; recovery must be via a *different* already-`disconnected_grace`
  player's reconnect bringing the connected count back up, or simply the test asserting pause
  persists correctly when no recovery is possible within v1's rules) confirms `resume()` is called
  and the timer continues from where it was frozen.
- `end_room` succeeds while the game is paused.

## Validation

- `npm test -w @partymode/server` extending issues 08/09's suite, covering all Acceptance Criteria
  above.
- Manual: this issue is the natural point to run the Wave 2 gate from `docs/ISSUE_PLAN.md` —
  script a full 3-player game via raw WebSocket messages (a Node script using the `ws` client
  library, or a documented sequence of `wscat` commands) from room creation through
  `final_results`, and capture the transcript as evidence.

## Dependencies

Issue 09 (vote/reveal phases and scoring).

## Non-goals

- No client UI (issues 11–18 consume these projections).
- No automated CI e2e — the Wave 2 gate script here is manual/scripted, not a CI job, per
  `docs/ISSUE_PLAN.md` Validation Strategy.

## Design References

`docs/DESIGN.md` §5.2 (full phase table including the round-repeat and `FINAL_RESULTS` rows),
§5.3 (scoring, tie-break), §7.2 (mid-game pause/resume), §4.1 (room `IN_GAME → LOBBY` transition
triggered by `game_over`).
