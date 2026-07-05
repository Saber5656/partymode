# 09 — Bluff-trivia: VOTE + REVEAL phases + scoring

## Summary

Extend the bluff-trivia `GameModule` from issue 08 with the `VOTE` and `REVEAL` phases and the
scoring rules from `docs/DESIGN.md` §5.3. After this issue, one full round (`round_intro → prompt
→ vote → reveal`) is playable end-to-end at the state-machine level (the loop back to another
round, and final results, land in issue 10).

## Context

Depends on issue 08's `BluffTriviaState` shape (`bluffs`, `votes`, `scores` fields already
declared there) and `GameModule` skeleton.

## Scope

- `advancePhase(state)` for phase `prompt` → `vote`: build the shuffled answer list — one entry
  per connected player's bluff (including auto-filled placeholders from issue 08) plus one entry
  for `state.currentQuestion.correctAnswer`, shuffled with a CSPRNG-backed Fisher-Yates (reuse
  `crypto.randomInt`, matching issue 04's room-code RNG choice for consistency), each entry tagged
  internally with its author (`playerId` or a sentinel `'__truth__'` for the real answer) — this
  author tagging must be present in `state` (server-authoritative) but never sent to clients until
  `reveal`.
- `getInputSchema('vote')`: `{ answerIndex: number }` where `answerIndex` is a valid index into
  the current shuffled answer list AND does not point at the voting player's own submitted bluff
  (server rejects self-votes per `docs/DESIGN.md` §5.2's VOTE row — the client is expected to hide
  this option too, per issue 17, but the server must not trust the client).
- `applyPlayerInput(state, playerId, input)` for phase `vote`: records
  `state.votes[playerId] = <the answer-list entry id chosen>`; last-write-wins on resubmission
  within the phase, same as `prompt`.
- `advancePhase(state)` for phase `vote` → `reveal`: for any connected player with no vote
  recorded, leave them with no vote (scores 0 for the round per §5.3 — do not auto-assign a random
  vote); then compute this round's score deltas per `docs/DESIGN.md` §5.3:
  - +1000 to each player who voted for the `'__truth__'` entry.
  - +500 to a bluff's author for each *other* player who voted for that bluff.
  - Add deltas to `state.scores` (cumulative).
  - Store the computed per-round deltas in a `state.lastRoundDeltas: Record<PlayerId, number>`
    field (add this to `BluffTriviaState`) so `projectHostView`/`projectPlayerView` for `reveal`
    can show "you earned +N points" without recomputing.
- `getPhaseTimeoutMs`: `vote` → 45000, `reveal` → 8000 (matching `docs/DESIGN.md` §5.2's fixed
  timer, but reveal may also be advanced early by an explicit host "next" action — that host
  action is `submit_input`-independent; implement it as allowed only when `state.phase ===
  'reveal'` via a host-only message path added to the WS layer, or, if simpler, model it as the
  engine's existing phase-timeout path but with `getPhaseTimeoutMs('reveal')` returning a short
  fixed value and skip building a separate "host skip" message type for v1 — **decision**: v1 uses
  the fixed 8s timer only; a host-initiated skip is deferred as a v2 nicety unless trivial to add,
  since `docs/DESIGN.md` describes it as "8s fixed timer, or host manual next" — treat "or host
  manual next" as optional/best-effort, not blocking this issue's acceptance criteria).
- `projectHostView(state)` for `vote`: `{ phase, question, answers: {index, text}[] (shuffled,
  no author), votedCount, totalPlayers }`; for `reveal`: `{ phase, truthIndex, answers:
  {index, text, authorNickname | null}[] (author revealed, null for the truth entry),
  roundDeltas: Record<nickname, number>, leaderboard: {nickname, totalScore}[] sorted desc }`.
- `projectPlayerView(state, playerId)` for `vote`: `{ phase, question, answers: {index, text}[]
  excluding the player's own bluff entry, hasVoted }`; for `reveal`: same reveal payload as host
  view but also includes `yourDelta: number`.

## Detailed Requirements

1. Self-vote exclusion must be enforced server-side in the input schema/validation (reject with
   the generic engine-level rejection path from issue 07, not a new error code) — a player must
   not be able to vote for their own bluff even if the client is compromised/buggy.
2. Author identity (`playerId` per answer-list entry) must not appear anywhere in `vote`-phase
   projections — write a unit test asserting this the same way issue 08 tested `correctAnswer`
   leakage.
3. Scoring must use nickname-independent `PlayerId` internally for all arithmetic; nickname is
   only resolved at the projection layer (`projectHostView`/`projectPlayerView`), since nicknames
   are display-only and could theoretically collide in edge cases (they can't, per issue 05's
   uniqueness check, but keep the scoring engine decoupled from that guarantee regardless).
3. Tie-breaking for the `reveal`-phase `leaderboard` field: sort by `totalScore` descending; for
   equal scores, preserve original join order (stable sort) — matches the final tie-break rule in
   `docs/DESIGN.md` §5.3 (final tie-break is formally issue 10's concern for `FINAL_RESULTS`, but
   using the same stable rule here keeps per-round leaderboards consistent with the eventual final
   one).

## Acceptance Criteria

- `advancePhase` from `prompt` to `vote` produces an answer list of length equal to
  connected-player-count + 1 (all bluffs, including auto-filled placeholders, plus the truth),
  with no duplicate `index` values.
- A player's own bluff is excluded from their `projectPlayerView` answer list but present in
  `projectHostView`'s and other players' views.
- Submitting `answerIndex` pointing at the voter's own bluff is rejected.
- Submitting `answerIndex` pointing at the truth records a vote that yields +1000 for that player
  after `advancePhase` to `reveal`.
- A bluff that fools 2 other players yields +1000 total (+500 × 2) added to the bluff author's
  cumulative score after reveal.
- A player who never votes gets `lastRoundDeltas[playerId] === 0` (or absent, treated as 0) and no
  change to their cumulative score.
- `reveal`-phase projections never expose a non-truth answer's author to a player who isn't that
  author, until reveal — wait, they are explicitly revealed at `reveal` per design (that's the
  point of the phase) — the test instead confirms authors are correctly attributed and match who
  actually submitted each bluff (i.e. no shuffling bug mixing up author-index alignment after the
  Fisher-Yates shuffle).
- Unit test confirms `vote`-phase projections never include any answer's author field at all
  (neither correct nor incorrect attribution — the field must be absent/undefined, not just
  obfuscated).

## Validation

- `npm test -w @partymode/server` extending issue 08's suite, covering all Acceptance Criteria
  above via the module's pure functions plus at least one integration test running a full
  `prompt→vote→reveal` cycle with 3 mock players through issue 07's `GameEngine`.

## Dependencies

Issue 08 (bluff-trivia module skeleton, question bank, `prompt` phase, `BluffTriviaState` shape).

## Non-goals

- No round-to-round looping (round 2/3 setup) or `final_results` (issue 10).
- No UI (issue 17 consumes `vote`, issue 18 consumes `reveal`).
- No host-initiated "skip reveal early" message type (deferred per Detailed Requirements above
  unless trivial — do not block this issue's completion on it).

## Design References

`docs/DESIGN.md` §5.2 (VOTE/REVEAL rows), §5.3 (scoring rules, full text), §7.1 (self-vote
rejection, last-write-wins).
