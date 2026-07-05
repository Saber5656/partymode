# partymode — v1 Issue Plan

Canonical design: `docs/DESIGN.md`. This file is the complete v1 execution map. GitHub Issues are
derived from this file and `docs/issues/*.md`; if they disagree, this file and the issue drafts
win.

## v1 Completion Statement

v1 is complete when every issue below (01–22) is implemented and its Acceptance Criteria are met,
producing the product described in `docs/DESIGN.md` §1.1: a host can start a room on a TV/laptop
browser, 3–8 players can join from phones via QR code or room code with no install, play 3 rounds
of bluff-trivia to a final leaderboard, and reconnect mid-session after a dropped connection —
except for newly discovered implementation unknowns surfaced while building (see §Known Unknowns
below and `docs/DESIGN.md` §9).

## Issue List (recommended execution order)

| # | File | Title | Wave |
|---|---|---|---|
| 01 | [01-monorepo-scaffold.md](issues/01-monorepo-scaffold.md) | Monorepo scaffold (workspaces, TS, lint) | 0 |
| 02 | [02-shared-protocol-types.md](issues/02-shared-protocol-types.md) | Shared protocol & domain types package | 0 |
| 03 | [03-server-bootstrap.md](issues/03-server-bootstrap.md) | Server HTTP + WebSocket bootstrap | 1 |
| 04 | [04-room-manager.md](issues/04-room-manager.md) | Room manager & room-level state machine | 1 |
| 05 | [05-player-session-handling.md](issues/05-player-session-handling.md) | Player join, session tokens, disconnect/reconnect | 1 |
| 06 | [06-host-session-handling.md](issues/06-host-session-handling.md) | Host session, authority checks, disconnect/reconnect | 1 |
| 07 | [07-game-engine-framework.md](issues/07-game-engine-framework.md) | Generic game engine & phase orchestrator | 2 |
| 08 | [08-bluff-trivia-prompt-phase.md](issues/08-bluff-trivia-prompt-phase.md) | Bluff-trivia: question bank + PROMPT phase | 2 |
| 09 | [09-bluff-trivia-vote-reveal.md](issues/09-bluff-trivia-vote-reveal.md) | Bluff-trivia: VOTE + REVEAL phases + scoring | 2 |
| 10 | [10-round-loop-final-results.md](issues/10-round-loop-final-results.md) | Round loop orchestration + FINAL_RESULTS | 2 |
| 11 | [11-host-client-scaffold-join.md](issues/11-host-client-scaffold-join.md) | Host client scaffold + create-room/QR screen | 3 |
| 12 | [12-host-client-lobby.md](issues/12-host-client-lobby.md) | Host client lobby screen | 3 |
| 13 | [13-host-client-ingame.md](issues/13-host-client-ingame.md) | Host client in-game phase views | 3 |
| 14 | [14-player-client-scaffold-join.md](issues/14-player-client-scaffold-join.md) | Player client scaffold + join screen | 3 |
| 15 | [15-player-client-lobby.md](issues/15-player-client-lobby.md) | Player client lobby waiting screen | 3 |
| 16 | [16-player-client-prompt-input.md](issues/16-player-client-prompt-input.md) | Player client PROMPT input UI | 3 |
| 17 | [17-player-client-vote-ui.md](issues/17-player-client-vote-ui.md) | Player client VOTE UI | 3 |
| 18 | [18-player-client-reveal-results.md](issues/18-player-client-reveal-results.md) | Player client REVEAL + FINAL_RESULTS UI | 3 |
| 19 | [19-reconnect-resume-e2e.md](issues/19-reconnect-resume-e2e.md) | Reconnect/resume flow, end-to-end wiring | 4 |
| 20 | [20-dev-run-lan-docs.md](issues/20-dev-run-lan-docs.md) | Local/LAN dev-run instructions + QR LAN-IP handling | 4 |
| 21 | [21-e2e-smoke-test.md](issues/21-e2e-smoke-test.md) | End-to-end manual/scripted smoke test | 4 |
| 22 | [22-readme-docs-finalization.md](issues/22-readme-docs-finalization.md) | README + docs finalization | 4 |

## Dependency Table

| Issue | Depends on |
|---|---|
| 01 | — |
| 02 | 01 |
| 03 | 01, 02 |
| 04 | 03 |
| 05 | 04 |
| 06 | 04 |
| 07 | 02, 04 |
| 08 | 07 |
| 09 | 08 |
| 10 | 09 |
| 11 | 01, 02, 03 (room-create HTTP endpoint) |
| 12 | 11, 05, 06 (roster broadcast) |
| 13 | 12, 10 (game_state host projections) |
| 14 | 01, 02 |
| 15 | 14, 05 |
| 16 | 15, 08 |
| 17 | 16, 09 |
| 18 | 17, 10 |
| 19 | 05, 06, 13, 18 |
| 20 | 11, 14 |
| 21 | 19, 20 |
| 22 | 21 |

## Implementation Waves

- **Wave 0 — Foundations:** 01, 02. Repo skeleton and shared types/protocol schemas that every
  other package imports.
- **Wave 1 — Server core:** 03, 04, 05, 06. HTTP+WS server, room manager, player/host session and
  reconnect handling, with no game logic yet (rooms can be created/joined/started but "start_game"
  has no game to run).
- **Wave 2 — Game engine & bluff-trivia:** 07, 08, 09, 10. The pluggable game engine plus the one
  v1 game, fully playable via raw WebSocket messages (no UI yet — validated via issue 21-style
  scripted client or `wscat` in each issue's own Validation section).
- **Wave 3 — Clients:** 11–18. Host and player React/Vite UIs, one screen per issue, wired to the
  server built in waves 1–2.
- **Wave 4 — Integration & polish:** 19, 20, 21, 22. Cross-cutting reconnect hardening, dev/run
  docs, full smoke test, README.

Waves 0–2 have no UI dependency and can be fully validated over raw WebSocket connections before
any client code exists. Wave 3 issues are independent of each other *within* the host or player
track but each depends on the corresponding server capability from waves 1–2 (see Dependency Table
— e.g. issue 16 needs issue 08's PROMPT phase, not issue 09's VOTE phase).

## Coverage Table (DESIGN.md section → issue)

| DESIGN.md section | Covered by issue(s) |
|---|---|
| §1 Product Goal / §1.1 Done criteria | 21 (validates), all issues (implement) |
| §3 Architecture (monorepo layout, runtime topology) | 01, 03 |
| §4.1 Room-level state machine | 04 |
| §4.2 Player-level states | 05 |
| §4.2 Host-level states (referenced) | 06 |
| §5.1 GameModule interface | 07 |
| §5.2 Bluff-trivia phase state machine | 08, 09, 10 |
| §5.3 Scoring rules | 09 |
| §6 Network protocol (all message tables) | 02 (schemas), 03–06 (transport/handling), 08–10 (game-specific payloads) |
| §6.4 Reconnection/session tokens | 05, 06, 19 |
| §7.1 Enumerated failure handling | 04, 05, 06, 19 |
| §7.2 Mid-game roster changes / pause | 10, 19 |
| §8.1 Host client | 11, 12, 13 |
| §8.2 Player client | 14, 15, 16, 17, 18 |
| §9 Known Unknowns | tracked below, not separately issued unless they block an issue |
| ADR-001 (single-process, in-memory) | 03, 04 (implementation must not introduce a DB/broker) |

## Validation Strategy (whole product)

1. **Per-issue validation:** every issue file's own Validation section must be executable in
   isolation (unit test, `curl`/`wscat` script, or component render check) before merge.
2. **Wave 2 gate:** after issue 10, the full bluff-trivia game loop must be playable via raw
   WebSocket messages (e.g. a scripted Node client or `wscat` session per player) with no UI. This
   de-risks client work in wave 3 by proving the protocol and game logic independently of React.
3. **Wave 3 gate:** after issue 18, manual browser testing (one laptop as host, phone(s) or
   browser devtools device emulation as players) must complete one full 3-round game.
4. **Final gate (issue 21):** a written, repeatable smoke-test script exercising: room creation →
   3–8 player join → start → 3 rounds → final leaderboard → play again → room close; plus the
   reconnect scenarios from `docs/DESIGN.md` §4.2 (player drop/reconnect, host drop/reconnect,
   roster-below-minimum pause/resume). This is the v1 acceptance test referenced in §1.1.
5. **No automated CI e2e suite in v1** — deferred to v2 (`docs/DESIGN.md` §10). Issue 21 produces
   a documented manual/scripted procedure, not a CI job.

## Deferred v2 Items

See `docs/DESIGN.md` §10 for the full list: additional game types, persistent accounts/history,
horizontal scaling (Redis pub/sub), spectator mode, custom/uploaded question packs, configurable
round count, internet-facing production hosting automation, state-diffing broadcasts, automated
CI e2e suite.

## Known Unknowns (may create additional issues during implementation)

- Public-internet hosting target (Fly.io/Render/VPS/etc.) — deferred, not blocking v1 (see
  `docs/DESIGN.md` §9). If the user picks a target before v1 ships, add a new issue rather than
  editing issue 20.
- Package manager choice (npm vs pnpm vs yarn) — issue 01 decides and documents; not ambiguous
  enough to block starting, default is npm workspaces.
- QR code library choice — issue 11 decides at implementation time per the criteria in
  `docs/DESIGN.md` §8.1.
- Bundled question bank content beyond the minimum count (15 questions) specified in issue 08 —
  more questions can be added later without a new issue (content-only change).
