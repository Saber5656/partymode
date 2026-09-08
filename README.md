# partymode
テレビ+スマホの即席パーティゲーム(Jackbox型)

partymode is a local/LAN browser party game. A host opens the big-screen display, players join from
phones through a QR code or room code, and everyone plays a three-round bluff-trivia game with
private text prompts, voting, reveal, scoring, and a final leaderboard.

## Quickstart

Use [docs/RUNBOOK.md](docs/RUNBOOK.md) to run a local or LAN session.

```sh
npm install
npm run build
npm run lan
npm run start
```

## Development

- Package manager: npm workspaces.
- Node.js: v24 LTS is pinned in [.nvmrc](.nvmrc); newer local Node versions may work, but v24 is
  the compatibility target.
- Scripts:
  - `npm run build`: build all workspaces.
  - `npm run lint`: lint the repository.
  - `npm run typecheck`: type-check all workspaces.
  - `npm run test`: run workspace tests.
  - `npm run dev:server`: start the API/WebSocket server.
  - `npm run dev:host`: start the host Vite app.
  - `npm run dev:player`: start the player Vite app.

For architecture and implementation context, see [docs/DESIGN.md](docs/DESIGN.md) and
[docs/ISSUE_PLAN.md](docs/ISSUE_PLAN.md).

## Documentation Map

- [docs/DESIGN.md](docs/DESIGN.md): canonical v1 product and architecture design.
- [docs/ISSUE_PLAN.md](docs/ISSUE_PLAN.md): v1 issue sequence, dependencies, and validation plan.
- [docs/RUNBOOK.md](docs/RUNBOOK.md): local/LAN operating instructions.
- [docs/SMOKE_TEST.md](docs/SMOKE_TEST.md): repeatable MVP acceptance checklist and scripted smoke
  baseline.
- [docs/decisions/ADR-001-single-process-in-memory-state.md](docs/decisions/ADR-001-single-process-in-memory-state.md):
  ADR for single-process in-memory state.
- [docs/issues/01-monorepo-scaffold.md](docs/issues/01-monorepo-scaffold.md): monorepo scaffold.
- [docs/issues/02-shared-protocol-types.md](docs/issues/02-shared-protocol-types.md): shared
  protocol and domain types.
- [docs/issues/03-server-bootstrap.md](docs/issues/03-server-bootstrap.md): HTTP and WebSocket
  bootstrap.
- [docs/issues/04-room-manager.md](docs/issues/04-room-manager.md): room manager and room state.
- [docs/issues/05-player-session-handling.md](docs/issues/05-player-session-handling.md): player
  sessions and reconnect.
- [docs/issues/06-host-session-handling.md](docs/issues/06-host-session-handling.md): host sessions
  and authority.
- [docs/issues/07-game-engine-framework.md](docs/issues/07-game-engine-framework.md): generic game
  engine framework.
- [docs/issues/08-bluff-trivia-prompt-phase.md](docs/issues/08-bluff-trivia-prompt-phase.md):
  bluff-trivia question bank and prompt phase.
- [docs/issues/09-bluff-trivia-vote-reveal.md](docs/issues/09-bluff-trivia-vote-reveal.md):
  bluff-trivia vote, reveal, and scoring.
- [docs/issues/10-round-loop-final-results.md](docs/issues/10-round-loop-final-results.md):
  three-round loop and final results.
- [docs/issues/11-host-client-scaffold-join.md](docs/issues/11-host-client-scaffold-join.md): host
  create-room and QR screen.
- [docs/issues/12-host-client-lobby.md](docs/issues/12-host-client-lobby.md): host lobby screen.
- [docs/issues/13-host-client-ingame.md](docs/issues/13-host-client-ingame.md): host in-game views.
- [docs/issues/14-player-client-scaffold-join.md](docs/issues/14-player-client-scaffold-join.md):
  player join screen.
- [docs/issues/15-player-client-lobby.md](docs/issues/15-player-client-lobby.md): player lobby
  waiting screen.
- [docs/issues/16-player-client-prompt-input.md](docs/issues/16-player-client-prompt-input.md):
  player prompt input.
- [docs/issues/17-player-client-vote-ui.md](docs/issues/17-player-client-vote-ui.md): player vote
  UI.
- [docs/issues/18-player-client-reveal-results.md](docs/issues/18-player-client-reveal-results.md):
  player reveal and final-results UI.
- [docs/issues/19-reconnect-resume-e2e.md](docs/issues/19-reconnect-resume-e2e.md): reconnect and
  resume integration.
- [docs/issues/20-dev-run-lan-docs.md](docs/issues/20-dev-run-lan-docs.md): LAN run instructions
  and QR handling.
- [docs/issues/21-e2e-smoke-test.md](docs/issues/21-e2e-smoke-test.md): MVP smoke test.
- [docs/issues/22-readme-docs-finalization.md](docs/issues/22-readme-docs-finalization.md):
  README and docs finalization.
