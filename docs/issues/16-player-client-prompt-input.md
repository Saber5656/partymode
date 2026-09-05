# 16 — Player client PROMPT input UI

## Summary

Build the player-side `InGame` screen shell plus the `round_intro` and `prompt` phase views: a
"get ready" screen and a text-input form for submitting a bluff answer.

## Context

First player-client in-game view; consumes issue 08's `prompt`-phase `projectPlayerView` output.

## Scope

- `src/screens/InGame.tsx`: reads `phase` from the latest `game_state` message (player variant)
  and renders the matching sub-component, mirroring issue 13's host-side structure but with
  player-appropriate content.
- `RoundIntroView` (player): round number / total, category, brief "get ready" text.
- `PromptView` (player): the question text, a text input (client-side max-length 80 matching the
  server's bound from issue 08, with a visible remaining-character count), a submit button that
  sends `submit_input` with `{ phase: 'prompt', data: { bluff: <trimmed text> } }`, and a
  "submitted, waiting for others…" state once the player has submitted (button disabled, input
  read-only) — but still allow re-submission before the phase ends if the player wants to change
  their answer (per `docs/DESIGN.md` §7.1 last-write-wins) by re-enabling the input on an explicit
  "edit" action rather than defaulting to editable, to avoid accidental double-submits.
- A local countdown timer matching the host client's approach from issue 13 (resync from
  `phaseEnteredAt`/`timeoutMs` on each broadcast).
- Client-side rejection guard: if the player types a bluff exactly matching the question's correct
  answer... — wait, the player client never receives `correctAnswer` (issue 08 explicitly hides
  it), so this guard cannot be implemented client-side; rely entirely on the server-side rejection
  from issue 08 and surface `error:invalid_message` (or whatever generic rejection the engine
  sends per issue 07) as an inline "that's not a valid bluff, try a different answer" message on
  submit failure.

## Detailed Requirements

1. The submit button must be disabled while a submission request is in flight (avoid double-
   submit races), independent of the "already submitted, waiting" state.
2. Input must support Japanese IME composition correctly (do not submit-on-Enter in a way that
   conflicts with IME composition confirmation — use the standard `onCompositionStart/End` guard
   pattern if binding Enter-to-submit; simplest safe choice is to only submit via an explicit
   button click, not an Enter keypress, to sidestep IME edge cases entirely).

## Acceptance Criteria

- Entering the `prompt` phase after a `round_intro` shows the question and an empty, focused text
  input with the timer counting down.
- Submitting a valid bluff shows the "submitted, waiting" state and the host's submitted-count
  (issue 13) increments accordingly.
- Submitting a bluff matching the correct answer (verify by cross-referencing the question bank
  content directly, since the client can't know this) is rejected with a visible inline message,
  and the player can retry with a different answer before the phase timer elapses.
- Letting the timer elapse without submitting transitions the player screen directly into the
  `vote` phase's placeholder/next-screen state (issue 17) without requiring any action — the
  auto-fill happens server-side (issue 08), the client just needs to handle the phase transition
  gracefully even with no submission made.

## Validation

- Manual browser test: join as a player, progress through `round_intro`→`prompt`, submit a bluff,
  confirm host-side count updates (issue 13 must be present or stubbed to observe this, or verify
  via server logs/`wscat` inspection of the broadcast instead).

## Dependencies

Issue 15 (player lobby → InGame navigation seam), Issue 08 (bluff-trivia `prompt` phase and its
input validation).

## Non-goals

- No `vote`/`reveal`/`final_results` views (issues 17, 18).

## Design References

`docs/DESIGN.md` §5.2 (PROMPT row), §8.2 (PromptView description), §7.1 (last-write-wins
resubmission).
