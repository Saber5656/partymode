# 14 — Player client scaffold + join screen

## Summary

Build the real `apps/player` app shell (mirroring issue 11's structure for the host app): WS
client wrapper, routing, and the `Join` screen (room code + nickname form, pre-filled from a QR
deep-link query param).

## Context

First player-client issue in Wave 3. Mirrors issue 11's scaffolding but for the player role.

## Scope

- Same routing/WS-client-wrapper approach as issue 11 (`src/lib/wsClient.ts`), adapted for the
  player role (sends `join_room`/`resume_session` instead of `host_hello`).
- `src/screens/Join.tsx`: a form with a room-code field (auto-uppercased, 4-char input mask) and a
  nickname field (client-side mirrors the server's validation bounds from `docs/DESIGN.md` §6.2 —
  1–16 chars — for fast feedback, but the server remains authoritative; do not skip server-side
  error handling just because client-side validation passed).
- Read `?code=XXXX` from the URL query string (the QR deep link target from issue 11) and
  pre-fill the room-code field if present; still require the user to enter/confirm a nickname.
- On submit: open WS connection, send `join_room`, handle the response:
  - `joined`: store `{ roomCode, playerId, sessionToken }` in `localStorage`, navigate to `Lobby`
    (issue 15 — placeholder-tolerant the same way as issue 11/12 if sequenced first).
  - `error:room_not_found` / `room_in_progress` / `nickname_taken` / `nickname_invalid` /
    `room_full`: show the corresponding inline, user-readable message on the form (map each error
    code to a specific human-readable string — do not show raw error codes to the user).
- On app load, check `localStorage` for an existing session whose `roomCode` matches the room code
  in the URL (if present); on `error:session_expired`, clear that stored entry and show the `Join`
  form. Attempt `resume_session` before showing the `Join` form (same seam as issue 11's host-side
  resume-first behavior). If no `?code=` is present, do not resume an arbitrary stored session into
  a different room without an explicit user action.

## Detailed Requirements

1. Room-code input must normalize to uppercase and strip characters outside
   `@partymode/shared`'s `ROOM_CODE_ALPHABET` as the user types, to reduce typos before submit.
2. Nickname field must trim on submit (matching server-side trimming) so the value the user sees
   confirmed matches what's stored.
3. Every server error code surfaced by `join_room` (per `docs/DESIGN.md` §6.2's join_room
   validation row) must have a corresponding UI message — do not leave any error code silently
   unhandled (falling through to a generic "something went wrong" message is acceptable only for
   error codes not explicitly enumerated for `join_room`, as a defensive catch-all).

## Acceptance Criteria

- Navigating to `/join?code=ABCD` pre-fills the room-code field with `ABCD` (uppercased/validated)
  and leaves the nickname field empty for the user to fill in.
- Submitting a valid room code + nickname against a running server (issue 05 complete) with the
  room in `lobby` phase successfully joins and navigates onward, with `localStorage` populated.
- Submitting against a nonexistent room code shows a "room not found" style message without a
  page crash or unhandled promise rejection (verify via browser console showing no uncaught
  errors).
- Submitting a nickname already taken in that room shows a "nickname already in use" message.
- Reloading the page after a successful join attempts `resume_session` first (verify via network/
  WS inspection) rather than immediately re-showing a blank `Join` form.

## Validation

- Manual browser test against a running `apps/server` with issues 04/05 complete: join success,
  join failure (each error code), reload-resume behavior.

## Dependencies

Issue 01 (player app scaffold), Issue 02 (shared protocol types).

## Non-goals

- No lobby waiting screen (issue 15).
- No in-game input UIs (issues 16–18).

## Design References

`docs/DESIGN.md` §8.2 (player client screens, Join description), §6.2 (`join_room` validation and
error codes), §6.4 (session token storage).
