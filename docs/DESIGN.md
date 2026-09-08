# partymode — v1 Design

Status: Draft v1 (accepted for implementation planning)
Owner: Fable (design/planning agent)
Scope: this document is the canonical design for the v1 product. GitHub Issues are derived from
`docs/ISSUE_PLAN.md` and `docs/issues/*.md`; if they ever disagree with this file, this file wins.

## 1. Product Goal

partymode is a Jackbox-style party game: one big screen (a TV or laptop connected to a TV, the
"host display") shows shared game state, and each player uses their own phone as a controller by
joining a short room code over the local network or internet, with no app install required
(mobile web only).

v1 goal: prove the entire framework end-to-end — room creation, phone-as-controller join flow,
real-time host/player sync, and a full round loop — using exactly **one** playable game. The game
chosen for v1 is a **bluff-trivia game** ("Fibbage"-style): the host displays a trivia question
with a true answer hidden, each player secretly submits a fake (bluff) answer, then everyone votes
on which of the submitted answers (including the real one) they think is true. Players score points
for guessing the truth and for fooling other players with their bluff.

This game was chosen over a drawing/pictionary-style game because it requires only text input and
multiple-choice selection on the player side (no canvas capture/streaming), which keeps the
real-time protocol and client surface small while still exercising every structural piece of the
framework: a private-input phase, a shared-reveal phase, a voting phase, and cross-round scoring.

### 1.1 What "done" means for v1

All issues in `docs/ISSUE_PLAN.md` are complete, and a human can:

1. Start the server on a laptop connected to a TV (or on a LAN-reachable host).
2. Open the host display in a TV/laptop browser, see a room code and QR code.
3. Join from 3+ phones over the same Wi-Fi by scanning the QR code or typing the room code and a
   nickname, with no install step.
4. Host starts the game from the lobby once 3–8 players have joined.
5. Play at least 3 rounds of bluff-trivia to completion, see a final leaderboard on the host
   display, and return to a fresh lobby.
6. A player who backgrounds their phone or briefly loses Wi-Fi can reconnect mid-round and resume
   as the same player (same score, same seat) using a locally stored session token.
7. A player who force-quits/reloads and a host who reloads can each recover via the same
   reconnect mechanism, within a bounded grace period.

## 2. Non-Goals (v1)

- User accounts, authentication beyond ephemeral session tokens, or persistent player identity
  across rooms/sessions.
- Persistent storage (database, room history, stats). All state is in-memory and ephemeral.
- More than one game type. The framework must be pluggable (see §5), but only bluff-trivia ships.
- Native mobile apps. Player and host clients are both mobile-web / browser-based (PWA-friendly,
  but installability is not a requirement).
- Voice/video chat, spectator mode, audience-only viewers.
- Horizontal scaling, multi-process deployment, or session affinity/load balancing. v1 runs as a
  single Node.js process holding all room state in memory.
- Localization infrastructure. UI copy may be hardcoded Japanese and/or English strings; no i18n
  framework.
- Custom/user-uploaded question packs. The v1 question bank is a static bundled JSON file.
- Anti-cheat, profanity filtering, or content moderation beyond basic input length/charset limits.
- Mid-game late join. Players may only join during the LOBBY phase; once a game starts, the
  player roster is fixed (reconnection of an existing player is in scope; adding a new player is
  not).
- Public production hosting/deployment automation (CI/CD, TLS, domain). v1 targets `localhost` /
  LAN-IP execution via a documented dev/run command; internet-facing deployment is a v2 concern
  once a hosting target is chosen (see §9 Known Unknowns).

## 3. High-Level Architecture

Monorepo, TypeScript throughout, npm workspaces (pnpm not assumed unless already present in repo
— confirm at implementation time; default to npm workspaces since no lockfile exists yet).

```text
partymode/
  package.json                 # workspace root
  packages/
    shared/                    # protocol types, zod schemas, game-engine interfaces, question bank
  apps/
    server/                    # Node.js HTTP + WebSocket server, room manager, game engine runtime
    host/                      # React+Vite web client for the TV/big-screen display
    player/                    # React+Vite web client for the phone controller
```

### 3.1 Runtime topology

```text
                 LAN or Internet
   ┌──────────────┐   HTTP (static assets, /api/rooms)
   │  Host display │───────────────┐
   │  (browser)    │               │
   └──────┬────────┘               │
          │ WebSocket (role=host)  │
          ▼                        ▼
   ┌───────────────────────────────────────┐
   │        apps/server (Node.js)          │
   │  - HTTP server (serves host+player    │
   │    static builds, health check)       │
   │  - WebSocket server                   │
   │  - RoomManager (in-memory Map<roomId, │
   │    Room>)                             │
   │  - GameEngine per room (phase state   │
   │    machine + bluff-trivia module)      │
   └───────────────────────────────────────┘
          ▲                        ▲
          │ WebSocket (role=player)│
   ┌──────┴────────┐      ┌────────┴──────┐
   │ Phone client 1 │ ...  │ Phone client N│
   └────────────────┘      └───────────────┘
```

One Node.js process serves both static client bundles (host, player) over HTTP and terminates all
WebSocket connections. No external services, no database, no message broker. This is a deliberate
v1 simplification — see ADR-001.

### 3.2 Process model

- A single `Room` object holds all authoritative state for one game session: room code, host
  connection, list of `Player`s, current `GameEngine` instance, phase timers.
- `RoomManager` is a singleton in the server process holding `Map<RoomCode, Room>`. All room
  lookups go through it. No sharding, no persistence.
- Each `Room` owns exactly one `GameEngine` instance for the lifetime of a game (created when the
  host starts the game from LOBBY, destroyed on return to LOBBY or room close).

## 4. Room Lifecycle & State Machine

### 4.1 Room-level states

| State | Description | Entry condition | Exit condition |
|---|---|---|---|
| `LOBBY` | Room created, players may join, host may start | Room created, or game ended and host chose "play again" | Host issues `start_game` with ≥3 players |
| `IN_GAME` | Delegates to the active `GameEngine`'s phase state (see §5.2) | `start_game` accepted | Game engine reaches `FINAL_RESULTS` and host acknowledges, or host force-ends |
| `CLOSED` | Room torn down, all connections closed | Host disconnects and grace period (60s) expires with no reconnect, or explicit host "end room" action, or room idle (no host connection and fewer than 1 connected player) for 10 minutes | Terminal |

Room-level transition table:

| From | Event | To | Notes |
|---|---|---|---|
| (none) | `POST /api/rooms` (host requests room) | `LOBBY` | Generates room code, creates `Room`, opens host WS handshake window (60s) |
| `LOBBY` | host `start_game`, active players ∈ [3,8] | `IN_GAME` | Active players are `CONNECTED` + `DISCONNECTED_GRACE`; reject with `error:not_enough_players` if <3, `error:too_many_players` if >8 |
| `IN_GAME` | game engine emits `game_over` | `LOBBY` | Final leaderboard broadcast retained in room state until next `start_game` or close |
| `LOBBY` / `IN_GAME` | host disconnect grace period expires | `CLOSED` | Broadcast `room_closed` to all players first |
| `LOBBY` / `IN_GAME` | room idle timeout (10 min, no host connected) | `CLOSED` | Safety net cleanup |
| `LOBBY` / `IN_GAME` | host explicit `end_room` | `CLOSED` | Broadcast `room_closed` |

### 4.2 Player-level states (within a Room)

| State | Description |
|---|---|
| `CONNECTED` | Active WebSocket, participating |
| `DISCONNECTED_GRACE` | WS dropped, within 45s grace period; score/seat preserved; game engine treats as "no input yet" for any phase requiring their input |
| `REMOVED` | Grace period expired; player removed from roster, no longer counted toward min/max player checks or scoring going forward |

Transition table:

| From | Event | To | Notes |
|---|---|---|---|
| (none) | join accepted in `LOBBY` | `CONNECTED` | See §6.3 join flow |
| `CONNECTED` | WS close/error | `DISCONNECTED_GRACE` | Start 45s timer; broadcast `roster_update` to everyone in the room |
| `DISCONNECTED_GRACE` | reconnect with valid session token before timer expires | `CONNECTED` | Broadcast `roster_update`; resumes current phase, resubmits nothing automatically — player must re-submit input for the current phase if the phase is still open |
| `DISCONNECTED_GRACE` | timer expires | `REMOVED` | Broadcast `roster_update`; if this drops roster below 3 during `IN_GAME`, game auto-pauses (see §7.2) |

Host-level: identical `CONNECTED` / `DISCONNECTED_GRACE` (60s, longer than player grace since
losing the host is more disruptive) / room `CLOSED` on expiry.

## 5. Game Engine Framework (pluggable)

Even though only one game ships in v1, the engine must not hardcode bluff-trivia into the Room/
RoutingManager layer, so v2 can add games without touching room/session code.

### 5.1 `GameModule` interface (packages/shared)

```ts
interface GameModule<TState, THostView, TPlayerView, TPlayerInput> {
  id: string; // e.g. "bluff-trivia"
  minPlayers: number;
  maxPlayers: number;
  createInitialState(players: Array<{ id: PlayerId; nickname: string }>): TState;
  // Pure reducer: given current state and a validated player input, returns next state.
  applyPlayerInput(state: TState, playerId: PlayerId, input: TPlayerInput): TState;
  // Called by the phase timer/orchestrator when a phase's time budget elapses or all inputs are in.
  advancePhase(state: TState): TState;
  // Derive what the host display should render (no secret data, e.g. no hidden bluffs pre-reveal).
  projectHostView(state: TState, roster: Array<{ id: PlayerId; nickname: string }>): THostView;
  // Derive what a specific player's phone should render (may include that player's own private data).
  projectPlayerView(
    state: TState,
    playerId: PlayerId,
    roster: Array<{ id: PlayerId; nickname: string }>
  ): TPlayerView;
  isGameOver(state: TState): boolean;
  computeFinalScores(state: TState): Array<{ playerId: PlayerId; score: number }>;
}
```

The `GameEngine` runtime (apps/server) wraps a `GameModule` instance with: a phase timer, input
validation against the current state's per-phase input schema, roster-aware projection, and
broadcast triggering (whenever state changes, recompute and broadcast `projectHostView`/
`projectPlayerView` diffs — v1 may broadcast full views rather than diffs; diffing is a v2
optimization). Roster display metadata is passed into projections by the engine/WS layer; game
modules must not reach back into `Room` state directly just to resolve nicknames.

### 5.2 Bluff-trivia phase state machine

| Phase | Host display shows | Player phone shows | Advances when |
|---|---|---|---|
| `ROUND_INTRO` | Round number, category | "Get ready" | 3s fixed timer |
| `PROMPT` | The question, a countdown timer | A text input box for the player's bluff answer (real answer never sent to player clients) | All connected players submit a bluff, or 60s timer elapses (unsubmitted players get an auto-generated "no answer" placeholder bluff) |
| `VOTE` | The question again, plus the shuffled list of answers (real answer + all bluffs, anonymized) | The same shuffled list as tappable choices; a player cannot vote for their own submitted bluff (client hides it, server also rejects it) | All connected players vote, or 45s timer elapses (unvoted players score 0 for the round) |
| `REVEAL` | Which answer was real; per-answer author reveal; round score deltas; running leaderboard | Same reveal, plus "you earned +N points" | 8s fixed timer, or host manual "next" |
| `FINAL_RESULTS` | Final leaderboard, winner highlight | "Thanks for playing" + own final rank | Host clicks "play again" (→ Room `LOBBY`) or "end room" |

Round count: v1 fixed at 3 rounds (`ROUND_INTRO`→`PROMPT`→`VOTE`→`REVEAL` repeated 3×) using
non-repeating questions drawn randomly from the bundled question bank per room. Rationale:
bounded, predictable playtime (~6–8 minutes) suitable for "instant" party sessions; configurable
round count is a v2 idea.

### 5.3 Scoring rules (bluff-trivia)

- +1000 points: player voted for the real answer.
- +500 points per other player who voted for *your* bluff.
- 0 points: player didn't submit a bluff in time, didn't vote in time, or voted for their own
  bluff (rejected — see above, so this case cannot occur).
- Scores accumulate across all 3 rounds; final leaderboard sorts descending, ties broken by
  earliest player join order (stable, deterministic, no coin flips).

## 6. Network Protocol

WebSocket, JSON messages, one connection per client, `role` (`host` | `player`) fixed for the
connection's lifetime. All message types and payload shapes are defined as zod schemas in
`packages/shared/src/protocol.ts` and validated on receipt (invalid message ⇒ send
`error` message with code `invalid_message`, do not crash the connection).

### 6.1 Message envelope

```ts
type Envelope<T extends string, P> = { type: T; v: 1; payload: P };
```

`v` is a protocol version field fixed at `1` for v1; future breaking protocol changes bump this
and the server rejects mismatched versions with `error:protocol_version_mismatch` rather than
guessing compatibility.

### 6.2 Client → Server messages

| Type | Sent by | Payload | Server validation |
|---|---|---|---|
| `create_room` | Host, over HTTP `POST /api/rooms` (not WS) | `{}` | Generates unique 4-char room code (A–Z minus ambiguous chars, 0–9 minus 0/O/1/I), returns `{ roomCode, hostToken }` |
| `host_hello` | Host, first WS message | `{ roomCode, hostToken }` | Token must match room's issued hostToken; else close(4001) |
| `join_room` | Player, first WS message | `{ roomCode, nickname }` | Room must exist and be `LOBBY`; nickname 1–16 chars, alnum+space, trimmed, case-insensitive-unique within room; else `error:room_not_found` / `error:room_in_progress` / `error:nickname_taken` / `error:nickname_invalid`; room must have <8 current players else `error:room_full` |
| `resume_session` | Player or host, first WS message (alternative to join_room/host_hello) | `{ roomCode, sessionToken }` | Token must match a `DISCONNECTED_GRACE` player/host in that room and grace timer not expired; else `error:session_expired` |
| `start_game` | Host | `{}` | Room must be `LOBBY`, active players ∈ [3,8] |
| `submit_input` | Player | `{ phase: string, data: unknown }` | Validated against current `GameModule`'s state/player-aware per-phase input schema; rejected with `error:wrong_phase` if phase doesn't match current state |
| `end_room` | Host | `{}` | Always allowed while host connected |
| `play_again` | Host | `{}` | Only allowed from `FINAL_RESULTS` |
| `heartbeat` | Both | `{}` | Server replies `heartbeat_ack`; used for reconnect-grace liveness, not for latency measurement in v1 |

### 6.3 Server → Client messages

| Type | Sent to | Payload |
|---|---|---|
| `joined` | Joining player | `{ playerId, sessionToken, roster: Player[] }` |
| `host_ready` | Host | `{ roomCode, sessionToken, roster: Player[] }` |
| `roster_update` | All in room | `{ roster: Player[], hostConnected: boolean }` (sent on any join/disconnect/reconnect/remove or host connection-status change) |
| `game_state` (host variant) | Host | `{ roomState, gamePhase, hostConnected, timing: { phaseEnteredAt, timeoutMs }, hostView }` — full projection, sent on every state change |
| `game_state` (player variant) | Each player | `{ roomState, gamePhase, hostConnected, timing: { phaseEnteredAt, timeoutMs }, playerView }` — per-player projection (own private data included, others' hidden per phase rules) |
| `error` | Originating client | `{ code: string, message: string }` |
| `room_closed` | All in room | `{ reason: string }` then server closes all sockets in that room |
| `heartbeat_ack` | Both | `{}` |

### 6.4 Reconnection / session tokens

- On successful `join_room` or `host_hello`, the server issues a `sessionToken` (random 128-bit,
  not a JWT — no need for statelessness since state is in-memory anyway) that the client stores in
  `localStorage` keyed by `roomCode`.
- On page reload/reconnect, the client attempts `resume_session` before falling back to
  `join_room`/`host_hello`.
- Session tokens are room-scoped and invalidated when the room reaches `CLOSED`.

## 7. Failure Modes & Edge Cases

### 7.1 Enumerated failure handling

| Scenario | Behavior |
|---|---|
| Room code collision on generation | Regenerate (retry up to 10 times, extremely unlikely given 30^4 ≈ 810k codespace vs. expected concurrent room count ≪ 100) |
| Player submits input twice in same phase | Second submission overwrites the first (last-write-wins) as long as phase hasn't advanced |
| Player joins with a nickname identical to a `REMOVED` player's | Allowed — `REMOVED` frees the nickname |
| WebSocket message arrives for a room that no longer exists (server restarted) | `error:room_not_found`; client clears localStorage entry for that roomCode and shows "room no longer exists, create/join a new one" |
| Host tries `start_game` with 1–2 players | `error:not_enough_players`, host UI shows inline message, no state change |
| All players disconnect simultaneously during `IN_GAME`, host still connected | Game auto-pauses (see 7.2); host sees "waiting for players to reconnect" |
| Server process crash/restart | All rooms lost (in-memory only, documented non-goal for persistence). Clients detect via WS close + failed `resume_session` and prompt to start over. |
| Two hosts try to control the same room (stale tab reconnects after a new host_hello) | Only the most recent successful `host_hello`/`resume_session` holds the live connection; server closes the older host socket with code 4002 (`superseded`) |

### 7.2 Mid-game roster changes

- If connected player count drops below `minPlayers` (3) during `IN_GAME` (via disconnect grace
  expiry), the `GameEngine` pauses (freezes all phase timers) and the host view shows "paused —
  waiting for players." It resumes automatically once roster count returns to ≥3 (a reconnect) —
  timers resume from where they were frozen, not reset.
- If it never recovers, the host may `end_room`; there is no auto-timeout for a paused game in v1
  (host manual control is intentionally the escape hatch).

## 8. Client Applications

### 8.1 Host client (apps/host)

Screens: `CreateRoom` (calls `POST /api/rooms`, shows room code + QR code linking to
`http://<host>/join?code=XXXX` for the LAN/localhost v1 target, opens WS as host) → `Lobby` (roster list, "start game" button,
disabled until ≥3 players) → `InGame` (renders current phase's host view per §5.2 table) →
`FinalResults` (leaderboard, "play again"/"end room" buttons).

QR code generation: client-side, using the `qrcode` npm package to render a data URL in the host
client. Do not add a server-side QR image endpoint for v1.

### 8.2 Player client (apps/player)

Screens: `Join` (room code + nickname form, or pre-filled room code if arrived via QR deep link
query param) → `Lobby` (waiting screen, roster count) → `InGame` (renders current phase's player
view per §5.2 table: text input for `PROMPT`, choice list for `VOTE`, reveal summary for
`REVEAL`) → `FinalResults` (own rank, "waiting for host" if host hasn't clicked play again).

Both clients reconnect automatically (see §6.4) on WS close with exponential backoff (1s, 2s, 4s,
max 8s, indefinite retries while the tab is open) and surface a "reconnecting…" banner without
losing the currently rendered game state.

## 9. Known Unknowns (may spawn additional v2 issues during implementation)

- Whether v1 needs to run over the public internet (cloud-hosted) or is LAN-only for the target
  use case. Design above supports either (no LAN-specific assumptions in the protocol), but the
  dev/run documentation (see issue 20) only covers LAN/localhost. Internet hosting choice (Fly.io,
  Render, a VPS, etc.) is deferred until the user picks a target.
  - **v1 execution model decision (locked for v1):** the server is *reachable* over LAN or the
    public internet identically (no code branches on this), but only the LAN/localhost path is
    validated and documented for v1. Internet-facing hosting is out of scope for v1 issues and is
    a v2 unknown, not a blocking ambiguity for design or issue-writing.
- QR code library: resolved for v1 as the `qrcode` npm package in `apps/host`.
- Package manager: resolved for v1 as npm workspaces with a root `package-lock.json`.
- Node.js version: v24 LTS is pinned in `.nvmrc` as the compatibility target.
- Bundled question bank: v1 ships 15 static bluff-trivia questions in `apps/server/src/game/questions.ts`.

## 10. v2 Deferred Ideas (explicitly out of scope for v1 issues)

- Additional game types beyond bluff-trivia (drawing/pictionary, movie-title mashups, etc.).
- Persistent accounts, cross-session stats, room history.
- Horizontal scaling (Redis pub/sub for multi-process room state, sticky sessions).
- Spectator/audience-only view (join without a controller role).
- Custom/uploaded question packs, moderation/profanity filtering.
- Configurable round count / question categories per room.
- Internet-facing production hosting automation (CI/CD, TLS, custom domain).
- State diffing for `game_state` broadcasts (bandwidth optimization).
- Automated e2e test suite beyond the manual/scripted smoke test in v1 (see issue 21) — e.g. full
  Playwright multi-client CI suite.

## 11. Design → Issue Coverage

See `docs/ISSUE_PLAN.md` §Coverage Table for the mapping from each section above to the issue(s)
that implement it.
