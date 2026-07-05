# 13 — Host client in-game phase views

## Summary

Build the `InGame` screen: one sub-view per bluff-trivia phase (`round_intro`, `prompt`, `vote`,
`reveal`), driven entirely by the `hostView` payload in each `game_state` broadcast, plus the
`FinalResults` screen.

## Context

Consumes the full bluff-trivia `GameModule` projections completed in issues 08–10. This is the
host-side payoff of the whole server-side game engine.

## Scope

- `src/screens/InGame.tsx`: reads `phase` from the latest `game_state` message and renders the
  matching sub-component:
  - `RoundIntroView`: round number / total rounds, category, a brief "get ready" animation/state
    (a static countdown-style text is sufficient, no requirement for animation polish in v1).
  - `PromptView`: the question text, a live `submittedCount / totalPlayers` counter, a visible
    countdown timer derived from the phase's `timeoutMs` and `phaseEnteredAt` (client computes
    remaining time locally, resyncing on each broadcast to avoid drift — do not trust a purely
    client-side timer with no server resync).
  - `VoteView`: the question text again, the shuffled anonymized answer list (no authors),
    `votedCount / totalPlayers` counter, countdown timer.
  - `RevealView`: which answer was the truth, each answer's author (nickname) revealed, per-player
    round score deltas, running leaderboard (sorted desc, per issue 09's tie-break rule — the
    client must render in the order the server sends, not re-sort client-side, to avoid a
    divergent tie-break implementation).
- `src/screens/FinalResults.tsx`: final leaderboard with the winner visually highlighted (e.g.
  larger/first row, a simple "winner" badge — no requirement for confetti/animation in v1),
  "Play Again" and "End Room" buttons sending `play_again`/`end_room` respectively.
- On `play_again` success (room returns to `lobby`, next `game_state`/`roster_update` reflects
  this), navigate back to the `Lobby` screen (issue 12) with scores visibly reset.
- On `room_closed` (from `end_room` or any other closure path), navigate to a simple "Room closed"
  terminal screen with no further actions (matches `docs/DESIGN.md` §7.1's room-not-found/closed
  handling — clear `localStorage` for that roomCode here too, since the room is gone).
- Render a `paused` banner (from issue 10's `paused` field) overlaying whichever phase view is
  active, when true.

## Detailed Requirements

1. All phase views must be pure renderers of the `hostView` payload — no client-side game logic
   (scoring, phase-advancement decisions) duplicated in the UI layer; the server is the sole
   source of truth per the whole architecture.
2. Countdown timers: compute `remainingMs = timeoutMs - (Date.now() - phaseEnteredAtServerTime)`
   once per broadcast receipt and drive a local `setInterval`/`requestAnimationFrame` tick from
   there — resync fully on every new broadcast rather than letting client and server drift
   silently across a long-lived connection.
3. Nickname display must escape/sanitize as plain text (React does this by default via JSX text
   nodes) — do not use `dangerouslySetInnerHTML` anywhere in this app for nickname or bluff-text
   rendering, since these are user-supplied strings (basic XSS hygiene, per the global security
   guidance to avoid introducing OWASP top-10 issues).

## Acceptance Criteria

- Starting a game (from issue 12's Lobby) transitions the host screen through `round_intro` →
  `prompt` → `vote` → `reveal` visuals matching each phase's payload, across all 3 rounds, ending
  at `FinalResults`.
- The `PromptView`'s submitted-count updates live as mock players submit bluffs (via scripted WS
  or issue 16's real client).
- The `RevealView` correctly attributes each bluff to its author's nickname and shows a leaderboard
  matching the server's computed cumulative scores.
- Clicking "Play Again" on `FinalResults` returns the host screen to `Lobby` with all displayed
  scores reset to 0.
- Clicking "End Room" navigates to the terminal "Room closed" screen and clears the room's
  `localStorage` entry.
- Simulating a roster drop below 3 mid-game (per issue 10's pause trigger) shows the paused
  banner; simulating recovery clears it.

## Validation

- Manual browser test playing one full 3-round game end-to-end using scripted WS clients or (once
  available) the real player client from issues 14–18, observing every phase transition visually
  in the host browser.

## Dependencies

Issue 12 (Lobby → InGame navigation seam), Issue 10 (full round loop + final results server-side).

## Non-goals

- No player client (issues 14–18) — validated with scripted WS players standing in if built
  before those land.
- No animation/visual polish beyond basic legibility — v1 prioritizes correctness of the
  displayed data over production-grade visual design.

## Design References

`docs/DESIGN.md` §5.2 (phase table — what each phase's host view must show), §8.1 (InGame/
FinalResults description), §7.2 (paused banner).
