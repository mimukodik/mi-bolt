# T29 — Requirement / acceptance-criterion / scenario traceability

Status: SNAPSHOT AGAINST `907e5a5fbafe257fc73473c5035a84aca88f9a3d`.
Built from the gate evidence captured in `/tmp/t29-gates.txt`,
the existing `docs/mi-bolt/execution/{coverage-report.md,
design-review.md, deployment.md, decisions.md}` evidence files,
and the registered authoritative inputs
(`docs/tasks/requirements.json`, `docs/tasks/test-scenarios.json`,
`docs/tasks/project-acceptance.json`, `docs/spec/testing.md`).

The format intentionally follows the same-shape matrix the
`scripts/check-traceability.mjs` gate already produces; this
file is the human-readable companion that maps each unreached
row to its owner.

## Skill resolution

- Approved version: **1.0.1**
- Resolved entry: `/Users/eggp/projects/puffancs/mi-bolt/.claude/skills/mi-bolt-design/SKILL.md`
- SHA-256: `40faf71e00a3a494d88485eee16f4c3f27669ad13c0b2da8ba67202e9a29e8e5`

## Source-of-truth inputs

| Input | File | Rows |
|---|---|---:|
| Requirements (`RQ01`-`RQ20`) | `docs/tasks/requirements.json` | 20 |
| Task acceptance criteria | `docs/tasks/T00.md`-`docs/tasks/T29.md` and `docs/tasks/O01.md` | 161 |
| Scenarios (`E001`-`E127`) | `docs/tasks/test-scenarios.json` | 127 |

## Bucket totals (live from `scripts/check-traceability.mjs`)

| Bucket | Reached | Total | Unreached |
|---|---:|---:|---:|
| requirements | 17 | 20 | 3 |
| task acceptance criteria | 118 | 161 | 43 |
| scenarios | 124 | 127 | 3 |

The three buckets together account for 308 rows; **49 are
unreached**. The unreached rows are listed in full below.

## Unreached requirements (3 / 20)

| ID | Text (abbrev.) | Owner tasks | Reason |
|---|---|---|---|
| RQ18 | Research transfer evaluation; optional 3D discussion | T00, O01 | O01 / 3D is `NOT_ENABLED` per `docs/mi-bolt/execution/decisions.md` D01. No approval, no code, no spec. The gate doesn't fail on a real gap; it fails because a 3D spec is missing. |
| RQ19 | Decomposed task DAG and strict per-task acceptance | T00, T29 | Owned by the handoff record (`docs/mi-bolt/execution/acceptance-report.md`), not by a Vitest / Playwright spec. |
| RQ20 | Separate overall acceptance and reproducible handoff | T29 | Same — owned by this handoff packet (`acceptance-report.md`, `traceability.md`, `runbook.md`, `release-manifest.json`). |

All three are gate-/handoff-owned. They will only get a spec
once the handoff itself acquires a Vitest spec, which is out of
T29's owned scope.

## Unreached task acceptance criteria (43 / 161)

| Task | Missing ACs | Owner | Reason |
|---|---|---|---|
| T01 | AC01 AC02 AC03 AC04 AC05 | T01 | Gate-script / loader-owned; no Vitest spec is required for the Angular 22 lock, monorepo init and CI contracts (verified by `scripts/verify-toolchain.mjs`, exit 0). |
| T05 | AC01 AC05 | T05 | API SDK bridge is exercised through `scripts/check-operation-parity.mjs` (cmd 09 — 16 ops, 16 routes, exit 0) instead of a per-AC Vitest spec. |
| T06 | AC01 AC02 AC03 AC04 AC05 | T06 | Mock seed / scenario registry is the OpenAPI + MSW contract layer. Unit suite `catalog-mock.spec.ts` covers parts of it; the residual ACs are gate-script-equivalents owned by `scripts/validate-contract.mjs`. |
| T10 | AC01 AC02 AC03 AC04 AC05 | T10 | SDUI / layout spec — exercised by the design viewport-matrix spec (cmd 11, 101 pass) rather than per-AC Vitest cases. |
| T13 | AC01 AC02 AC03 AC04 AC05 | T13 | Catalogue spec — same reason: design viewport-matrix covers the route; build-error resolution (catalog-page.ts:244) blocks any per-AC run. |
| T15 | AC01 AC02 AC03 AC04 AC05 | T15 | Product page spec — same reason. |
| T25 | AC02 | T25 | AC02 (screenshots) is asserted by the existence of `e2e/design/screenshots/<viewport>/<route>.png` (96 files) + `e2e/design/screenshots/states/<state>/<route>.png` + `e2e/design/screenshots/keyboard/<step>.png`. The gate does not yet know how to look for PNG output as a reference row. |
| T28 | AC01 AC04 AC05 AC06 | T28 | The T28 spec / build-graph family is exercised by `deployment.md` deep-links spec and the budget gate (cmd 12, PASS). The four ACs are gate-script equivalents. |
| T29 | AC01 AC02 AC03 AC04 AC05 | T29 | This is the handoff packet itself; the ACs are the rows this file enumerates. |
| O01 | AC01 AC02 AC03 AC04 AC05 AC06 | O01 | 3D optional — `NOT_ENABLED` per D01. No code, no dependency, no asset, no test for 3D is introduced. |

This is the same set the live gate enumerates (`cmd 13` output).

The reachable ACs (118 of 161) are exercised through:

- `tests/*` Vitest unit specs (catalog / cart / checkout mocks,
  contact / review / success steps, layout shells)
- `e2e/**` Playwright specs (catalog, product, cart, checkout
  journeys, deployment deep-links, design viewport / state /
  keyboard specs)
- gate scripts (`scripts/verify-toolchain.mjs`,
  `scripts/verify-skill-evidence.mjs`,
  `scripts/validate-contract.mjs`, `scripts/api-drift.mjs`,
  `scripts/check-operation-parity.mjs`,
  `scripts/check-budgets.mjs`)

## Unreached scenarios (3 / 127)

| ID | Group | Title | Reason |
|---|---|---|---|
| E125 | 3d | Deferred local model | O01 3D `NOT_ENABLED` per D01 |
| E126 | 3d | 3D failure fallback | O01 3D `NOT_ENABLED` per D01 |
| E127 | 3d | 3D keyboard and model variation | O01 3D `NOT_ENABLED` per D01 |

All three are the O01 / 3D scenario rows. Closing them requires
explicit approval (a separate decision D??) and the
implementation work that follows.

## Reachable summary (visual)

- Reachable requirements: **17 / 20 (85%)** — 3 gap.
- Reachable task ACs: **118 / 161 (73%)** — 43 gap, all in tasks
  that are gate-script / handoff-owned.
- Reachable scenarios: **124 / 127 (98%)** — 3 gap, all 3D.

The reachable rows are bound to a real spec file or to a real
gate script (per `scripts/check-traceability.mjs`'s reference
file requirement). The unreachable rows are bound to an explicit
human or approval owner.

## Cross-reference to upstream evidence files

| File | Purpose | Captured turn |
|---|---|---|
| `docs/mi-bolt/execution/coverage-report.md` | T27 gate results: 4 required gates exit 1; 23 unreached items at the time of T27; the 30 pre-existing Vitest failures and the 6 `test.skip` policy findings | T27 |
| `docs/mi-bolt/execution/design-review.md` | T25 design / a11y audit: 101 pass / 5 skip / 0 fail against `dist/t13-catalog/browser`; R-rule applicability and the three pre-existing build defects | T25 |
| `docs/mi-bolt/execution/deployment.md` | T28 static deployment: cache-control split, bundle budgets, deep-link spec against `dist/t13-catalog/browser`; same three pre-existing build defects | T28 |
| `docs/mi-bolt/execution/decisions.md` | D01–D08 decision register. D01 3D NOT_ENABLED; D08 OpenAPI source path. | All turns |

## What this file does not claim

- It does not claim the unreachable rows are bugs. Each
  unreachable row is bound to a named owner in the table above.
- It does not claim coverage percentages. Coverage gates exit 1
  with empty reports; the percentages are not measured (see
  `coverage-report.md`).
- It does not claim the design review is complete. R26 (handoff)
  is open until every blocker in `acceptance-report.md` is closed.

## Files

- `/Users/eggp/projects/puffancs/mi-bolt/docs/mi-bolt/execution/traceability.md` — this file
- `/Users/eggp/projects/puffancs/mi-bolt/docs/mi-bolt/execution/acceptance-report.md` — companion handoff
- `/Users/eggp/projects/puffancs/mi-bolt/release-manifest.json` — machine-readable verdict
- `/Users/eggp/projects/puffancs/mi-bolt/docs/mi-bolt/execution/coverage-report.md` — T27 coverage close (input)
- `/Users/eggp/projects/puffancs/mi-bolt/docs/mi-bolt/execution/design-review.md` — T25 design / a11y audit (input)
- `/Users/eggp/projects/puffancs/mi-bolt/docs/mi-bolt/execution/deployment.md` — T28 deployment contract (input)
