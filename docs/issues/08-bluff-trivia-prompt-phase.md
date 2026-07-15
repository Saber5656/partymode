# 08 — Bluff-trivia: question bank + PROMPT phase

## Summary

Implement the bluff-trivia `GameModule` (id: `bluff-trivia`) for the `ROUND_INTRO` and `PROMPT`
phases only (per `docs/DESIGN.md` §5.2), including the bundled question bank. `VOTE`/`REVEAL` land
in issue 09; the multi-round loop and `FINAL_RESULTS` land in issue 10. This issue's module is not
yet fully playable end-to-end — it stops after producing the shuffled-answer-list state that issue
09 consumes — but must be independently testable.

## Context

This is the first concrete `GameModule` implementation, built against the interface from issue 07.

## Scope

- `apps/server/src/game/bluffTrivia/questionBank.ts`: a static array of at least 15 question
  objects, each `{ id: string, category: string, question: string, correctAnswer: string }`.
  Content is in Japanese (matching the README's Japanese product description) or English — either
  is acceptable per `docs/DESIGN.md` §9's known-unknown on this point; pick one language
  consistently across all 15+ entries and note the choice in a code comment.
- `apps/server/src/game/bluffTrivia/state.ts`: the `BluffTriviaState` type —
  ```ts
  type BluffTriviaState = {
    roundIndex: number; // 0-based
    totalRounds: 3;
    usedQuestionIds: string[];
    currentQuestion: { id: string; category: string; question: string; correctAnswer: string };
    phase: 'round_intro' | 'prompt' | 'vote' | 'reveal' | 'final_results';
    bluffs: Record<PlayerId, string>; // submitted this round, cleared each round
    votes: Record<PlayerId, string>; // filled in issue 09
    scores: Record<PlayerId, number>; // cumulative across rounds
    phaseEnteredAt: number; // ms timestamp, injected via a clock param, not Date.now() directly (see Detailed Requirements)
  };
  ```
- `apps/server/src/game/bluffTrivia/module.ts`: implements `GameModule<BluffTriviaState,
  BluffTriviaHostView, BluffTriviaPlayerView, BluffTriviaInput>` for the phases this issue owns:
  - `id: 'bluff-trivia'`, `minPlayers: 3`, `maxPlayers: 8`.
  - `createInitialState(players)`: picks a random question not in `usedQuestionIds`, sets
    `phase: 'round_intro'`, `roundIndex: 0`, seeds `usedQuestionIds` with the chosen question id,
    `scores` initialized to 0 for every player.
  - `getCurrentPhase(state)`: returns `state.phase`.
  - `getPhaseTimeoutMs(phase)`: `round_intro` → 3000, `prompt` → 60000; `vote`/`reveal`/
    `final_results` → implemented in issues 09/10 (this issue may return `null` or throw
    `not_implemented` for those phases as a placeholder, clearly marked).
  - `getInputSchema(state, playerId, phase)`: for `prompt`, a zod schema `{ bluff: string }` where
    `bluff` is 1–80 chars after trim, must not exactly equal (case-insensitive, trimmed) the
    current question's `correctAnswer`, and must not equal the reserved no-answer sentinel
    (case-insensitive, trimmed). Reject a player trying to submit the literal truth as their bluff
    or the sentinel — the server-side schema/refinement should catch this so a cheating client
    can't force an easy detection or an indistinguishable timeout answer; on rejection the engine's
    `handleInput` should treat it as a validation failure per issue 07, i.e. silently ignored /
    client gets `error:invalid_message`, not a special error code.
  - `applyPlayerInput(state, playerId, input)` for phase `prompt`: sets
    `state.bluffs[playerId] = input.bluff.trim()`, returns new state (immutable update, do not
    mutate in place — return a new object per the interface's implied pure-reducer contract in
    `docs/DESIGN.md` §5.1).
  - `advancePhase(state)` for phase `round_intro` → `prompt` (no special logic, just phase flip)
    and for phase `prompt` → `vote`: for any connected player with no entry in `state.bluffs`,
    auto-fill a reserved placeholder bluff (e.g. `"__NO_ANSWER__"` stored internally and displayed
    as `"No answer"` in projections) that cannot collide with a real player-submitted bluff string,
    then hand off to issue 09's vote-phase setup (this issue may
    stub the `vote`-entry setup with a `// see issue 09` marker as long as the `prompt→vote` phase
    flip itself is correct and tested).
  - `projectHostView(state, roster)` for `round_intro`/`prompt`: `{ phase, roundIndex,
    totalRounds, category, question, submittedCount, totalPlayers }` — must NOT include any
    player's bluff text or the correct answer text/identity before `reveal`. The host display is
    the shared TV screen, so pre-vote host projections are public to all players.
  - `projectPlayerView(state, playerId, roster)` for `round_intro`: `{ phase, roundIndex,
    totalRounds }`; for `prompt`: `{ phase, category, question, hasSubmitted: boolean }` (never
    includes `correctAnswer`).
  - `isGameOver`/`computeFinalScores`: stub returning `false` / `[]` in this issue (real
    implementation in issue 10) — clearly marked, not silently wrong-but-untested (add a `// see
    issue 10` comment and a unit test asserting the stub's documented placeholder behavior so a
    future change is caught if accidentally load-bearing).
- Clock injection: since `docs/DESIGN.md`'s no-`Date.now()` constraint applies to *workflow
  scripts*, not to this application code, ordinary `Date.now()` usage in `apps/server` product
  code is fine — but for *testability* of time-dependent state (`phaseEnteredAt`), accept an
  optional injectable clock function in the module's constructor/factory so tests can control time
  without real sleeps. This is a testability choice, not a hard requirement from
  `docs/DESIGN.md`.

## Detailed Requirements

1. Question selection must not repeat within a single room's game (`usedQuestionIds` tracked in
   state); across separate games/rooms, repeats are fine (no persistence, per ADR-001).
2. `correctAnswer` must never appear in any `projectPlayerView`/`projectHostView` output during
   `round_intro` or `prompt` phases — write a unit test that serializes the projected views and
   asserts the correct-answer string is absent, to guard against an accidental leak.
3. Bluff text sanitization: trim, collapse internal whitespace to single spaces, reject empty
   after trim (covered by the 1–80 char schema bound).
4. The question bank file must be trivially extensible (a flat array) so adding more questions
   later is a content-only change, not a code change — this satisfies the `docs/DESIGN.md` §9
   known-unknown about bank size being extensible post-v1.

## Acceptance Criteria

- `createInitialState` with 3+ mock players produces a valid `BluffTriviaState` in phase
  `round_intro` with a `currentQuestion` drawn from the bank, `usedQuestionIds` containing that
  question id, and `scores` at 0 for every player.
- `advancePhase` from `round_intro` flips to `prompt` with no other state change besides `phase`
  and `phaseEnteredAt`.
- Submitting a valid bluff via `applyPlayerInput` records it under the correct `playerId`; a
  second submission from the same player overwrites the first (last-write-wins, per
  `docs/DESIGN.md` §7.1).
- Submitting a bluff equal to the correct answer (any case/whitespace) is rejected by the input
  schema.
- Submitting a bluff equal to the reserved no-answer sentinel (any case/whitespace/display variant
  defined by the implementation) is rejected by the input schema.
- `advancePhase` from `prompt` to `vote` (issue 09 boundary) auto-fills placeholder bluffs for any
  player who never submitted, and does not overwrite real submissions.
- Unit test confirms `correctAnswer` never appears in serialized host/player views for
  `round_intro`/`prompt` phases.
- Question bank has ≥15 entries, each with non-empty `id`, `category`, `question`,
  `correctAnswer`, and all `id`s are unique.

## Validation

- `npm test -w @partymode/server` covering all Acceptance Criteria above via the module's pure
  functions directly (no WebSocket/engine wiring needed for this issue's own tests, though an
  integration smoke test combining this module with issue 07's `GameEngine` is encouraged if
  cheap to add).

## Dependencies

Issue 07 (`GameModule` interface and `GameEngine` runtime).

## Non-goals

- No `vote`/`reveal` phase logic (issue 09).
- No multi-round loop or `final_results` (issue 10).
- No UI (issue 16 consumes this phase's player view).

## Design References

`docs/DESIGN.md` §5.2 (phase table, `ROUND_INTRO`/`PROMPT` rows), §5.3 (scoring — not yet
applicable, initialization only), §9 (question bank size known-unknown).
