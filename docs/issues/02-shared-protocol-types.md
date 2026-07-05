# 02 — Shared protocol & domain types package

## Summary

Populate `packages/shared` with the domain types (`Room`, `Player`, phase enums) and the
WebSocket message protocol schemas (zod) defined in `docs/DESIGN.md` §6, plus the `GameModule`
interface shape referenced by §5.1 (the interface itself is fleshed out in issue 07; this issue
only needs the type-level scaffolding it depends on, e.g. `PlayerId`, generic phase types).

## Context

Every other package (`apps/server`, `apps/host`, `apps/player`) imports message types and zod
schemas from `@partymode/shared` to avoid protocol drift between client and server. This issue is
the single source of truth for wire types.

## Scope

- Add `zod` as a dependency of `packages/shared`.
- `src/domain.ts`: `PlayerId` (branded string type), `RoomCode` (branded string), `Player` type
  (`{ id: PlayerId; nickname: string; score: number; connectionState: 'connected' |
  'disconnected_grace' | 'removed' }`), `RoomPhase` union type matching `docs/DESIGN.md` §4.1
  (`'lobby' | 'in_game' | 'closed'`).
- `src/protocol.ts`: the `Envelope<T, P>` generic, and zod schemas + inferred TypeScript types for
  every message in `docs/DESIGN.md` §6.2 and §6.3, named exactly as in those tables (e.g.
  `CreateRoomRequestSchema`, `JoinRoomMessageSchema`, `JoinedMessageSchema`,
  `RosterUpdateMessageSchema`, `ErrorMessageSchema`, etc. — use a consistent
  `<MessageType>MessageSchema` naming convention for WS messages and `<Name>RequestSchema` /
  `<Name>ResponseSchema` for the one HTTP endpoint, `create_room`).
- `src/protocol.ts` also exports a discriminated union `ClientToServerMessage` and
  `ServerToClientMessage` covering all message types, and a `parseClientMessage(raw: unknown):
  ClientToServerMessage` helper that validates via zod and throws a typed `ProtocolError` on
  failure (server-side code in issue 03 catches this and replies with an `error` message).
- `src/errorCodes.ts`: a const object/union of every error `code` string used across
  `docs/DESIGN.md` (`room_not_found`, `room_in_progress`, `nickname_taken`, `nickname_invalid`,
  `room_full`, `not_enough_players`, `too_many_players`, `session_expired`, `wrong_phase`,
  `invalid_message`, `protocol_version_mismatch`) so server and clients reference the same
  literals instead of hand-typed strings.
- `src/index.ts`: re-exports everything from `domain.ts`, `protocol.ts`, `errorCodes.ts`, and the
  existing placeholder `PROTOCOL_VERSION` constant from issue 01 (keep it, set to `1`).
- Unit tests (using the test runner already implied by issue 01's tooling choice — if none was
  pinned, use `node:test` with `tsx` to avoid adding a new heavy dependency) covering: valid
  message parses to the expected shape, invalid message (missing field, wrong type) throws
  `ProtocolError`, nickname validation regex accepts/rejects the boundary cases from §6.2 (1–16
  chars, alnum+space, trimmed).

## Detailed Requirements

1. Field-for-field, every payload shape must match the tables in `docs/DESIGN.md` §6.2/§6.3
   exactly — do not add or drop fields. If an ambiguity is found (a field mentioned in prose but
   not in the payload table, e.g. `hostToken` for `create_room`'s HTTP response), use the prose
   description in that section to fill the gap and note the resolved shape in this package's
   doc-comment, not in a new design doc.
2. `RoomCode` format: 4 characters from the alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (uppercase
   letters and digits, excluding `0/O/1/I` per §6.2). Provide a `ROOM_CODE_ALPHABET` constant and
   a `isValidRoomCode(s: string): boolean` guard using it.
3. `applyPlayerInput`'s per-phase `data: unknown` payload (the `submit_input` message) is
   intentionally loosely typed at the protocol layer — phase-specific input schemas (bluff
   submission, vote submission) are defined by the game module in issues 08/09, not here. This
   package only defines the envelope (`{ phase: string, data: unknown }`) and re-exports a generic
   `SubmitInputMessageSchema` with `data: z.unknown()`; game-specific narrowing happens downstream.
4. Provide a `Result<T, E>`-style helper type (or use a small discriminated union
   `{ ok: true, value: T } | { ok: false, error: E }`) for `parseClientMessage` if throwing is
   deemed undesirable by the implementer — either throwing `ProtocolError` or returning a
   `Result` is acceptable, but pick one and use it consistently across the package; document the
   choice in a one-line comment at the top of `protocol.ts`.
5. All exported schemas must have their inferred static type also exported (e.g. `export type
   JoinRoomMessage = z.infer<typeof JoinRoomMessageSchema>`), since downstream packages should
   import types, not re-derive them.

## Acceptance Criteria

- `packages/shared` builds (`tsc`) and lints cleanly.
- Every message type listed in `docs/DESIGN.md` §6.2 and §6.3 has a corresponding zod schema and
  inferred type exported from `@partymode/shared`.
- `isValidRoomCode` correctly accepts a well-formed 4-char code and rejects codes containing `0`,
  `O`, `1`, or `I`, and rejects wrong-length strings.
- `parseClientMessage` (or the chosen `Result`-returning equivalent) correctly discriminates all
  client→server message types by their `type` field and rejects malformed payloads.
- Unit tests for the above pass via `npm test -w @partymode/shared` (or the workspace-equivalent
  command established in issue 01's scripts — add a root `test` script if issue 01 didn't already
  add one).

## Validation

- `npm run build -w @partymode/shared && npm test -w @partymode/shared` exits 0.
- Manually construct one valid and one invalid `join_room` payload in a throwaway test file (or as
  part of the unit tests) and confirm the valid one parses to a `JoinRoomMessage` with the correct
  field types, and the invalid one (e.g. `nickname: ""`) is rejected.

## Dependencies

Issue 01 (monorepo scaffold must exist first).

## Non-goals

- No server-side usage of these schemas (issue 03).
- No `GameModule` interface implementation (issue 07) — only the primitive types it needs
  (`PlayerId`) live here.
- No bluff-trivia-specific payload types (issues 08/09) — those extend `SubmitInputMessage`'s
  `data` field downstream in `apps/server` or a future `packages/game-bluff-trivia` sub-package if
  the implementer chooses to split it out (optional refactor, not required for v1).

## Design References

`docs/DESIGN.md` §2 (non-goals: no auth beyond session tokens), §4.1, §4.2, §6 (all
subsections), §9 (package manager decision already made in issue 01).
