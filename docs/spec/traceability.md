# Requirement traceability

## RQ01 — Angular 22 latest stable; no SSR

Tasks: T00, T01, T28.

Acceptance evidence: Toolchain lock, build artifact inspection and static deep links.

## RQ02 — Mandatory mi-bolt-design on every execution AND verification

Tasks: T00, T10, T25, T29.

Acceptance evidence: Every task evidence has separate implementation and review skill application; skill package hashes match.

## RQ03 — Four precise screen families and three responsive layout shells

Tasks: T11, T13, T14, T16, T18, T20, T21, T22, T24, T25.

Acceptance evidence: Desktop/mobile designs, state matrix and route contract.

## RQ04 — Signals + modern Angular templates + Signal Forms

Tasks: T01, T12, T15, T17, T19, T20.

Acceptance evidence: Static lint, compiler diagnostics and rendered behavioral tests.

## RQ05 — No backend; MSW-only business operations

Tasks: T05, T06, T07, T08, T09, T28.

Acceptance evidence: MSW ownership + isolated egress logs in demo and all tests.

## RQ06 — OpenAPI 3.0/3.1 as authoritative contract; choose 3.1.0

Tasks: T03, T26.

Acceptance evidence: All 16 endpoints/32 schemas validate; request/response parity.

## RQ07 — ng-openapi-gen-generated SDK

Tasks: T04, T26.

Acceptance evidence: Clean generation diff and actual SDK transport tests.

## RQ08 — Search/filter/sort/pagination URL state

Tasks: T06, T12, T13.

Acceptance evidence: Same-variant filtering, result counts, URL back/forward, latest-request-wins.

## RQ09 — Product gallery/variants/specifications

Tasks: T15, T16.

Acceptance evidence: Variant-consistent price, media, stock and accessible gallery controls.

## RQ10 — Editable persistent cart

Tasks: T07, T17, T18.

Acceptance evidence: One authoritative state, reload restoration, exact integer-HUF totals.

## RQ11 — Complete simulated purchase and durable receipt

Tasks: T08, T09, T19, T20, T21, T22, T23, T24.

Acceptance evidence: COD and mock-card paths; record exists through API; no false live transaction.

## RQ12 — Validation, errors, timeouts and idempotency

Tasks: T07, T08, T09, T19, T23.

Acceptance evidence: All negative scenarios preserve data, revalidate state and prevent duplicate commits.

## RQ13 — 100% unit source coverage

Tasks: T02, T27.

Acceptance evidence: Per-file and global statement/branch/function/line thresholds=100; inventory includes unvisited source.

## RQ14 — 100% independent E2E coverage

Tasks: T02, T27.

Acceptance evidence: Browser source coverage=100 independently + all declared behavior/state cases; no unit-counter merge.

## RQ15 — All tests use mocks; no real services

Tasks: T02, T05, T26, T27.

Acceptance evidence: No SDK replacement, live request, production payment, remote media or data leak.

## RQ16 — Responsive and accessible operation

Tasks: T10, T11, T25.

Acceptance evidence: Six viewport widths, keyboard flow, target sizes, focus restoration and manual evidence.

## RQ17 — No analytics/social/tracking/chat

Tasks: T00, T28.

Acceptance evidence: Dependency/script/network allowlist; no dead signup or account feature.

## RQ18 — Research transfer evaluation; optional 3D discussion

Tasks: T00, O01.

Acceptance evidence: Evidence/inference distinction, adoption matrix and model licensing/asset decision.

## RQ19 — Decomposed tasks, dependency DAG and strict per-task acceptance

Tasks: T00, T29.

Acceptance evidence: 31 packets; 30 baseline +1 optional; acyclic validated graph with exact dependencies.

## RQ20 — Separate overall acceptance and reproducible handoff

Tasks: T29.

Acceptance evidence: Every overall criterion has evidence; planned activity never labeled passed.
