# 01 — Monorepo scaffold (workspaces, TypeScript, lint/format)

## Summary

Create the base repository skeleton: npm workspaces layout, shared TypeScript configuration,
lint/format tooling, and empty-but-buildable packages for `packages/shared`, `apps/server`,
`apps/host`, `apps/player`. No product logic yet — this issue only needs to produce a repo that
installs, builds, lints, and type-checks cleanly with placeholder entry points.

## Context

The repository currently contains only `README.md`. `docs/DESIGN.md` §3 specifies the target
layout:

```text
partymode/
  package.json
  packages/shared/
  apps/server/
  apps/host/
  apps/player/
```

No package manager lockfile exists yet, so this issue makes that decision (default: npm
workspaces, per `docs/DESIGN.md` §9 Known Unknowns) and documents it.

## Scope

- Root `package.json` with `"workspaces": ["packages/*", "apps/*"]`.
- `packages/shared`: TypeScript package, builds to `dist/`, exports nothing yet but a placeholder
  `export const PROTOCOL_VERSION = 1;`.
- `apps/server`: Node.js + TypeScript app, `package.json` depends on `@partymode/shared` via
  workspace protocol (`"@partymode/shared": "*"` or npm workspace equivalent), placeholder
  `src/index.ts` that logs `"partymode server placeholder"` and exits 0.
- `apps/host`: Vite + React + TypeScript app, placeholder page rendering "partymode host
  (placeholder)".
- `apps/player`: Vite + React + TypeScript app, placeholder page rendering "partymode player
  (placeholder)".
- Root-level TypeScript base config (`tsconfig.base.json`) extended by each package/app.
- Root-level ESLint + Prettier configuration (flat config, TypeScript + React rules for the two
  Vite apps).
- Root `package.json` scripts: `build` (runs build in all workspaces), `lint`, `typecheck`,
  `dev:server`, `dev:host`, `dev:player` (each just runs the respective workspace's own script).
- `.gitignore` covering `node_modules/`, `dist/`, `.env*`, editor files.
- `.nvmrc` or `engines` field in root `package.json` pinning a Node.js major version (use the
  latest LTS available at implementation time; do not guess a specific patch version).

## Detailed Requirements

1. Package naming: scope all workspace packages under `@partymode/*` — `@partymode/shared`,
   `@partymode/server`, `@partymode/host`, `@partymode/player`.
2. TypeScript: `strict: true` in `tsconfig.base.json`. Each package's own `tsconfig.json` extends
   the base and sets its own `outDir`/`rootDir`/`include`.
3. `apps/host` and `apps/player` use Vite's `react-ts` template as the starting point, stripped of
   Vite's default boilerplate content (logo, counter demo) down to the placeholder text above.
4. `apps/server` does not use Vite; it is a plain Node.js TypeScript project. Use `tsc` for build
   and `tsx` (or an equivalent TS-runner) for `dev` scripts — do not require a manual compile step
   during development.
5. Do not add any WebSocket, HTTP framework, React Router, or state-management dependency in this
   issue — those belong to later issues that actually use them (issues 03, 07, 11, 14).
6. Document the package-manager decision (npm workspaces) and Node version pin in a short
   "Development" section added to the repository root `README.md` (append, do not replace the
   existing one-line description).
7. Root `package.json` must NOT be marked `"private": false` — this is not a package to be
   published; set `"private": true`.

## Acceptance Criteria

- `npm install` at repo root succeeds with no errors and produces a single root
  `package-lock.json`.
- `npm run build --workspaces` (or an equivalent root `build` script) succeeds for all four
  workspace packages.
- `npm run lint --workspaces` (or root `lint` script) passes with zero errors on the placeholder
  code.
- `npm run typecheck` (root script invoking `tsc --noEmit` in each package, or a single project
  references build) passes with zero errors.
- `apps/server`'s placeholder runs via `npm run dev:server` and logs the placeholder string, then
  exits 0 (it does not need to stay running).
- `apps/host` and `apps/player` each start via their respective `dev:*` script and serve a page
  showing their placeholder text at `localhost` on Vite's default port (verify by curling the dev
  server's HTML output, not by opening a browser).
- `README.md` has a new "Development" section documenting: package manager (npm workspaces),
  pinned Node version, and the four top-level scripts (`build`, `lint`, `typecheck`, `dev:*`).

## Validation

- Run: `npm install && npm run build --workspaces && npm run lint --workspaces` from repo root;
  all must exit 0.
- Run `npm run dev:server`, confirm the placeholder log line appears, confirm process exits 0
  without needing Ctrl-C (i.e. it's a script that runs once, not a long-lived server — that comes
  in issue 03).
- Run `npm run dev:host -- --port 4300 &`, then `curl -s http://localhost:4300 | grep -i
  "partymode host"`, confirm match, then stop the dev server. Repeat for `dev:player` on a
  different port.

## Dependencies

None (first issue).

## Non-goals

- No HTTP/WebSocket server implementation (issue 03).
- No shared protocol types/schemas beyond the placeholder constant (issue 02).
- No actual UI beyond a placeholder string (issues 11, 14 onward).
- No CI workflow file — not requested for v1, do not add one speculatively.

## Design References

`docs/DESIGN.md` §3 (High-Level Architecture), §9 (package manager known-unknown).
`docs/decisions/ADR-001-single-process-in-memory-state.md` (context only, not directly relevant to
scaffolding).
