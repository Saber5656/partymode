# ADR-001: Single-process, in-memory room state for v1

## Status

Accepted (v1)

## Context

partymode rooms are short-lived (minutes), small (≤8 players), and created ad-hoc for a single
party session. The v1 goal is to prove the room-join/host-display/game-loop pattern end-to-end
with minimal operational surface, per `docs/DESIGN.md` §1.1.

Options considered:

1. Single Node.js process holding all room state in memory (`Map<RoomCode, Room>`), no database,
   no external broker.
2. Single process + a persistence layer (SQLite/Postgres) for room/game state, allowing recovery
   across process restarts.
3. Multi-process with a shared store (Redis) for room state and pub/sub for broadcast, enabling
   horizontal scaling.

## Decision

Use option 1 for v1: a single Node.js process, in-memory room state, no persistence, no external
services.

## Rationale

- The product's core use case (one TV, a handful of phones, one party session) never requires
  more concurrent rooms than a single process can trivially hold in memory.
- A server crash/restart losing in-progress games is an acceptable v1 trade-off: sessions are
  short and the "start over" cost is low (documented as a non-goal / failure mode in
  `docs/DESIGN.md` §7.1).
- Removing a database and a message broker removes an entire category of setup/deployment/schema
  work from v1, in line with the "prove the framework end-to-end" goal.
- Nothing in the WebSocket protocol (`docs/DESIGN.md` §6) assumes single-process affinity in a way
  that would need a rewrite to add Redis-backed pub/sub later — sessionToken-based reconnect and
  room-scoped broadcast are the same shape either way.

## Consequences

- No room survives a server restart. Acceptable per above; must be documented in user-facing
  "run the server" instructions (issue 20).
- No horizontal scaling in v1: if concurrent room count ever needs to exceed what one process/host
  machine can hold, that is v2 work (`docs/DESIGN.md` §10) requiring a follow-up ADR before
  implementation.
- Session tokens are opaque random values validated against in-memory state, not signed/stateless
  tokens (e.g. not JWTs) — there is no benefit to statelessness when the authoritative state is
  already only in one process's memory.
