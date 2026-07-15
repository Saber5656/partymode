# 07 — Generic game engine & phase orchestrator

## Summary

Implement the pluggable `GameModule` interface (`docs/DESIGN.md` §5.1) in `packages/shared` and a
generic `GameEngine` runtime in `apps/server` that wraps any `GameModule` instance with phase
timers, input validation, and broadcast triggering — wired into `Room` via the `onGameStart` /
`play_again` seams left by issue 04. No concrete game content yet (bluff-trivia lands in issues
08–10) — this issue ships the framework plus a trivial in-repo test-only `GameModule` (e.g. a
2-phase "ping-pong" fixture) used purely to validate the engine's orchestration logic.

## Context

This is the load-bearing abstraction that keeps game-specific logic out of `Room`/`RoomManager`,
per `docs/DESIGN.md` §5's framing ("the engine must not hardcode bluff-trivia into the Room/
RoomManager layer").

## Scope

- `packages/shared/src/gameModule.ts`: the `GameModule<TState, THostView, TPlayerView,
  TPlayerInput>` interface exactly as specified in `docs/DESIGN.md` §5.1, plus a
  state/player-aware input validation convention: each `GameModule` also exposes
  `getInputSchema(state: TState, playerId: PlayerId, phase: string): ZodSchema | undefined` so the
  engine can validate `submit_input.data` against the correct schema for the module's current
  state and submitting player before calling `applyPlayerInput`.
- `apps/server/src/game/gameEngine.ts`: `GameEngine` class, constructed with a `GameModule`
  instance and the room's player list; responsibilities:
  - Hold `state: TState` (opaque to the engine, owned by the module).
  - `handleInput(playerId, phase, data)`: validates `phase` matches the module's declared current
    phase (derived from `state` via a module-supplied `getCurrentPhase(state): string` — add this
    to the `GameModule` interface as it's needed for the engine to know when to reject
    `error:wrong_phase`, per §6.2's `submit_input` validation rule), validates `data` against
    `getInputSchema(state, playerId, phase)`, calls `module.applyPlayerInput`, updates `state`,
    triggers a broadcast.
  - Phase timers: the engine, not the module, owns `setTimeout`-based phase timers. Each
    `GameModule` phase declares a `timeoutMs: number | null` (null = no auto-timeout, e.g. a
    reveal phase advanced only by host action) via a `getPhaseTimeoutMs(phase: string): number |
    null` method added to the interface. When all required players have submitted input for the
    current phase *or* the timer elapses (whichever first), the engine calls
    `module.advancePhase(state)` and re-broadcasts.
  - "All required players submitted" tracking: the engine, not the module, tracks which
    `PlayerId`s have submitted input for the current phase (a `Set<PlayerId>` reset on each
    `advancePhase` call), since this is generic orchestration logic, not game-specific state.
    Expose `updateRequiredPlayers(activePlayerIds: PlayerId[]): void` so room/session code can
    remove `removed` players from the required set, keep `disconnected_grace` players counted
    during their grace window, and re-evaluate whether the phase can advance after roster changes.
  - Broadcast triggering: after every state change, the engine receives roster display data from
    `Room`/the WS layer, calls `module.projectHostView(state, roster)` and, per connected player,
    `module.projectPlayerView(state, playerId, roster)`, then hands these plus timing metadata to a
    `broadcast({ hostView, playerViewsByPlayerId, timing })` callback injected by the caller. The
    engine itself has no knowledge of WebSocket connections, but it does carry the roster metadata
    needed for projections to resolve nicknames without reaching back into `Room` state. `timing`
    is `{ phaseEnteredAt, timeoutMs }`, where `timeoutMs` is the current phase's timeout or `null`.
  - Pause/resume for roster changes: expose `pause(): void` / `resume(): void` on `GameEngine`
    that freeze/unfreeze the current phase timer without losing elapsed time (store
    `remainingMs` on pause, restart a fresh timer for that duration on resume) — this is the seam
    issue 10/19 use for the `docs/DESIGN.md` §7.2 mid-game pause behavior; this issue only needs
    the timer pause/resume mechanics to work correctly, not the roster-count trigger logic itself.
  - `isGameOver` / `computeFinalScores` passthroughs to the module, exposed as
    `GameEngine.isGameOver()` / `GameEngine.computeFinalScores()`.
- Wire `Room.onGameStart` (from issue 04) to construct a `GameEngine` for the room's chosen module
  and start it; wire `Room`'s `play_again` stub to tear down the current `GameEngine` and return
  the room to `lobby`.
- A test-only fixture module (e.g. `apps/server/src/game/__fixtures__/pingPongGameModule.ts`) with
  two phases (`ping`, `pong`), a trivial numeric state, and a 3s timeout on `ping` — used solely by
  this issue's own tests to validate engine mechanics without depending on bluff-trivia content
  that doesn't exist yet.

## Detailed Requirements

1. The `GameModule` interface additions beyond `docs/DESIGN.md` §5.1's listed methods
   (`getCurrentPhase`, `getPhaseTimeoutMs`, `getInputSchema`) are engine-support methods this issue
   discovers are necessary; document them as an addendum in `packages/shared`'s `gameModule.ts`
   doc-comment referencing this issue number. `getInputSchema` must receive current state and
   `playerId`, because bluff-trivia prompt and vote validation are state/player-dependent.
2. `GameEngine` must be fully unit-testable without any WebSocket/HTTP dependency — construct it
   directly with a module and a broadcast-spy callback in tests.
3. Timer-driven `advancePhase` calls must be safe to invoke even if 0 of N players submitted
   (timeout case) — the module's `advancePhase` implementation is responsible for filling in
   defaults (e.g. bluff-trivia's "no answer" placeholder, per `docs/DESIGN.md` §5.2), the engine
   just needs to guarantee it always calls `advancePhase` exactly once per phase transition
   (never zero times, never twice concurrently — guard against a race between "last player
   submitted" and "timer fired" both trying to advance the same phase transition).
4. `computeFinalScores` and `isGameOver` are only meaningful after the module's state machine
   reaches its terminal phase — the engine should not call them speculatively on every state
   change; call `isGameOver` after every `advancePhase` and only proceed with
   `computeFinalScores` when it returns true.

## Acceptance Criteria

- `GameEngine` constructed with the ping-pong fixture module and 2 mock players: submitting input
  from both players before the 3s timeout advances the phase immediately (assert via a spy on the
  broadcast callback, using a shortened timeout in tests rather than waiting real seconds where
  feasible).
- The same setup with only 1 of 2 players submitting, left to the timeout, still advances the
  phase exactly once (assert the broadcast callback fires exactly once for that transition, not
  zero or two times).
- `pause()` followed by `resume()` mid-timer results in the phase advancing after the *remaining*
  time, not a full fresh timeout (assert timing behavior with fake timers, e.g. Node's
  `--experimental-test-coverage`-free `node:test` with manual timer mocking, or a small
  injectable clock abstraction if the implementer prefers — either is acceptable).
- `handleInput` with a `phase` argument not matching the module's current phase is rejected before
  reaching `applyPlayerInput` (assert `applyPlayerInput` spy is not called).
- `handleInput` with `data` failing the module's declared input schema for the current phase is
  rejected the same way.
- Calling `updateRequiredPlayers` after a player becomes `removed` prevents that player from
  blocking all-inputs-complete advancement or receiving later auto-filled input/scoring.
- Broadcast spies receive `timing.phaseEnteredAt` and `timing.timeoutMs` on every initial,
  input-triggered, and timer-triggered broadcast.
- Wiring smoke test: starting a room's game via the room-level `start_game` message (from issue
  04/06) with the ping-pong fixture registered as the room's module results in `phase: 'in_game'`
  and a broadcast reflecting the fixture's initial host/player views.

## Validation

- `npm test -w @partymode/server` covering all Acceptance Criteria above.
- No manual `wscat` validation required for this issue specifically (framework-only); end-to-end
  manual validation of a *real* game happens in issues 08–10.

## Dependencies

Issue 02 (shared types — `GameModule` interface lives in `packages/shared`), Issue 04 (Room's
`onGameStart`/`play_again` seams).

## Non-goals

- No bluff-trivia content or phases (issues 08, 09, 10).
- No client-facing broadcast wiring beyond the injected callback signature — actually sending
  `game_state` messages over WebSocket to real connections is completed as part of wiring this
  engine into the existing WS message handler from issues 03/05/06 (should be a small addition
  there, not a new issue, since the seam already exists) — if it requires non-trivial new work,
  note it as a follow-up in this issue's PR rather than expanding scope silently.

## Design References

`docs/DESIGN.md` §5.1 (`GameModule` interface), §5.2 (phase table — informs what a "phase" and
"timeout" mean structurally, even though bluff-trivia specifics aren't implemented here), §7.2
(pause/resume — mechanics only, trigger logic in issue 10).
