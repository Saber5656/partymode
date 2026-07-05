# 22 — README + docs finalization

## Summary

Final polish pass on user-facing documentation once the product works end-to-end: bring
`README.md` up to date as the front door for the repository, cross-link the docs set, and confirm
no stale/contradictory information remains across `docs/DESIGN.md`, `docs/ISSUE_PLAN.md`,
`docs/RUNBOOK.md`, and `docs/SMOKE_TEST.md`.

## Context

Last issue in the v1 plan. By this point the product is functionally complete (issue 21 passed);
this issue is about making the repository legible to a future reader (human or agent) who wasn't
part of building it.

## Scope

- Rewrite `README.md` top section (keep the existing one-line Japanese description, per the
  global rule against deleting existing content without explicit request — append/restructure
  around it rather than removing it) to include:
  - What the product is and how it's played (a short paragraph, referencing the bluff-trivia game
    by name).
  - Quickstart: point directly to `docs/RUNBOOK.md` for running a session.
  - Development: point to the "Development" section added in issue 01, plus links to
    `docs/DESIGN.md` and `docs/ISSUE_PLAN.md` for anyone continuing implementation work.
- Add a short "Documentation Map" section to `README.md` listing each `docs/*` file and its
  purpose (DESIGN.md = canonical design, ISSUE_PLAN.md = execution map, issues/ = per-issue specs,
  decisions/ = ADRs, RUNBOOK.md = how to run a session, SMOKE_TEST.md = acceptance checklist).
- Re-read `docs/DESIGN.md` and `docs/ISSUE_PLAN.md` end to end and fix any statement that turned
  out to be inaccurate once real implementation happened (e.g. if issue 03 ended up choosing
  Fastify vs. plain `http`, or issue 01 ended up using pnpm instead of npm — reconcile the design
  docs to reflect what was actually built, since `docs/` is the canonical source of truth per this
  repository's operating rules, and it must not go stale relative to the shipped code).
- If any "Known Unknowns" from `docs/DESIGN.md` §9 / `docs/ISSUE_PLAN.md` were resolved during
  implementation (e.g. a QR library was chosen in issue 11), update those sections to record the
  resolution rather than leaving them phrased as open questions.

## Detailed Requirements

1. Do not remove or contradict `docs/decisions/ADR-001-*.md` without a documented reason — if
   implementation deviated from it, add a new ADR recording the change rather than silently
   editing history.
2. Keep `README.md` concise — it is an entry point, not a duplicate of `docs/DESIGN.md`; link out
   rather than re-explaining architecture in full.

## Acceptance Criteria

- `README.md` contains: product description, quickstart pointing to `docs/RUNBOOK.md`, development
  pointer, and a documentation map linking every file under `docs/`.
- `docs/DESIGN.md` and `docs/ISSUE_PLAN.md` contain no statements contradicted by the actual
  implementation (spot-check: package manager, HTTP framework choice, QR library, any other
  "implementer's choice" points called out across issues 01–21).
- Every "Known Unknown" resolved during implementation is updated in place rather than left as an
  open question.

## Validation

- A fresh read-through of `README.md` → `docs/DESIGN.md` → `docs/ISSUE_PLAN.md` by the person
  closing this issue, confirming internal consistency and that a newcomer could orient themselves
  using only these three files plus `docs/RUNBOOK.md`.

## Dependencies

Issue 21 (smoke test passing — this issue documents the finished product, not a still-changing
one).

## Non-goals

- No new features or design changes — this is a documentation-accuracy pass only.
- No v2 planning work (that begins only after the user explicitly requests it, per this
  repository's scope).

## Design References

All of `docs/DESIGN.md` and `docs/ISSUE_PLAN.md` (accuracy pass over the whole canonical design).
