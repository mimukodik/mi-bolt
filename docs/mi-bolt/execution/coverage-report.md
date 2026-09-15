# T27 — Full unit and E2E coverage close report

Status: PACKAGED with new gate scripts; **coverage cannot be closed in this turn**. Four gates exit 1 in pre-existing state.

This report records the work T27 added, the four required gate commands with their exit status, the gap the gates reveal, and the honest limits that prevent a green T27 close today. It deliberately avoids representing a not-yet-produced measure as passing.

## What was done

| File | Purpose | Status |
|---|---|---|
| `scripts/check-traceability.mjs` | New gate. Maps each RQxx requirement, Txx-AC0y acceptance criterion and E0xx scenario to a real spec reference (`tests/**`, `e2e/**`); fails when any requirement / AC / scenario is unreached. | Created. |
| `scripts/check-test-policy.mjs` | New gate. Rejects every committed `it.skip` / `it.only` / `it.todo` / `describe.skip` / `describe.only` / `xit` / `test.skip` / `test.fixme` / `test.slow` / quarantine marker and (with `--strict`) every coverage-ignore pragma. | Created. |
| `docs/mi-bolt/execution/coverage-report.md` | This report. | Created. |
| `scripts/runtime-manifest.mjs` (T02) | Unchanged. Already emitted `coverage/runtime-manifest.json` with 78 runtime + 1 bootstrap owned files (`195` total: assets=6, generated=56, runtime=78, styles=19, templates=2, tests=14, other=19, bootstrap=1). | Read-only reference. |
| `scripts/check-coverage.mjs` (T02) | Unchanged. The 100% per-file gate; expects `coverage/unit/coverage-final.json` and `coverage/e2e/coverage-final.json`. | Read-only reference. |
| `vitest.config.ts` | Unchanged. V8 coverage provider, `coverage/unit` output directory, `all: false`. Note: with `all: false`, unvisited files do NOT appear in the report — this is the configuration reason the gate cannot pass even on a green run without a fresh re-check. | Read-only reference. |

Three target files were intentionally **not** edited:

- `vitest.config.ts` — flipping `all` to `true` and forcing a successful coverage run would require fixing the 30 pre-existing test failures documented below; doing that is out of T27's owned boundary.
- `e2e/fixtures/coverage.ts` — the E2E coverage collector is a T02 fixture; T27 reports on its output rather than rebuilding it.
- Existing spec files in `tests/**` and `e2e/**` — the surgical rule keeps the scope on the gate scripts and the report; no failing tests were rewritten to chase a green number.

## Required gate command results

All four required commands exit non-zero today. They are wired correctly and they correctly identify real gaps.

```text
$ npm run coverage:unit:check ; echo exit:$?
> node scripts/check-coverage.mjs --unit
check-coverage [empty-report]: coverage report not found: /Users/eggp/projects/puffancs/mi-bolt/coverage/unit/coverage-final.json
exit:1

$ npm run coverage:e2e:check ; echo exit:$?
> node scripts/check-coverage.mjs --e2e
check-coverage [empty-report]: coverage report not found: /Users/eggp/projects/puffancs/mi-bolt/coverage/e2e/coverage-final.json
exit:1

$ node scripts/check-traceability.mjs ; echo exit:$?
...
check-traceability:FAIL — 23 unreached item(s); first row of each bucket printed above.
exit:1

$ node scripts/check-test-policy.mjs ; echo exit:$?
test-policy:FAIL — 6 finding(s) in 3 location(s) across 37 files:
  - e2e/a11y/keyboard.spec.ts:77            it-skip, pw-skip
  - e2e/design/state-matrix.spec.ts:75     it-skip, pw-skip
  - e2e/design/viewport-matrix.spec.ts:119  it-skip, pw-skip
test-policy: per docs/spec/testing.md and docs/spec/coverage-policy.json, every spec must run.
exit:1
```

`check-traceability` summary (the gate counts each bucket independently):

```text
requirements:        reached=15/20 (unreached=5)
acceptanceCriteria:  reached=116/161 (unreached=45)
scenarios:           reached=119/127 (unreached=8)
```

The five unreached requirements (`RQ01`, `RQ17`, `RQ18`, `RQ19`, `RQ20`) all sit on T00 / T01 / T28 / T29 / O01 — the gate-owned build & handoff family that does not yet have a Vitest spec (T28 = production build verification, T29 = handoff evidence, O01 = 3D bash decision). The 45 unreached ACs sit on T01 / T05 / T06 / T10 / T13 / T15 / T25 / T28 / T29 / O01 — same root cause. The 8 unreached scenarios are `E120..E127`, all in the `isolation / build / 3D` groups that T27 itself owns as gate scripts rather than as specs.

The six test-policy findings are real `test.skip` calls in the e2e design / a11y specs:

- `e2e/a11y/keyboard.spec.ts:103` — `test.skip(true, '<route> not reachable')`
- `e2e/a11y/keyboard.spec.ts:167` — `test.skip(true, '/telefonok not reachable')`
- `e2e/a11y/keyboard.spec.ts:172` — `test.skip(true, 'filter-trigger not present in current build')`
- `e2e/a11y/keyboard.spec.ts:201` — `test.skip(true, '/telefonok not reachable')`
- `e2e/design/state-matrix.spec.ts:108` — `test.skip(true, '<routeId> not yet built (T17–T24)')`
- `e2e/design/state-matrix.spec.ts:179,186` — `test.skip(true, 'cart route / cart-page not yet implemented')` and similar
- `e2e/design/viewport-matrix.spec.ts:145` — `test.skip(true, 'no primary CTA defined for route <id>')`

Per `docs/spec/coverage-policy.json` (forbidden: `skip/todo/only`), these are policy violations the gate is designed to surface. Closing them is a follow-up item that belongs to the spec owners, not to the T27 gate scripts.

## T27-AC01 — unit coverage: NOT MEASURED in this turn

`coverage/unit/coverage-final.json` does not exist. `npm run test:unit:coverage` (Vitest with `coverage-v8` provider) runs the existing spec suite and would emit the report, but the suite is pre-red:

```text
Test Files  5 failed | 21 passed (26)
Tests       30 failed | 597 passed (627)
```

The 30 failures cluster in:

- `tests/checkout-mock.spec.ts` — expects problem code `VALIDATION_ERROR`; the mock returns `VALIDATION_FAILED`. The mock is the source of truth here; the spec is asserting the wire-string the OpenAPI document has not been updated to emit.
- `tests/checkout-state.spec.ts` — same `VALIDATION_FAILED` vs `VALIDATION_ERROR` mismatch in the checkout-state wizard.
- `tests/layouts.spec.ts` (12 failures) — T11 header / footer / drawer / demo-notice renderers. The specs assume DOM that the current build does not produce (e.g. `MarketingLayout header has dark shell and brand label`, `RouteFocusService.focusMainHeading moves focus to the main H1`). These are real regressions uncovered when `mi-bolt-design` changes landed in T25/T26 and the prior T11 specs were not refreshed.
- `tests/review-step.spec.ts` (2) — review-page `re-exported from review-step` string match lost when T22 wired a fresh `review-step.ts`.
- `tests/success-page.spec.ts` (10) — assert `CartFacade.resetOrderedCart()` and `CheckoutFacade.fetchOrder()` exist. T24 says "the cart stays at 0 after resetOrderedCart" but the facade currently exposes neither helper.

Until those are fixed, the Vitest process exits non-zero and `coverage-final.json` is not written; the unit-coverage gate then fails closed on `empty-report`. **Reporting a percentage here would be the documentation equivalent of the forbidden "100% passing tests as a synonym for 100% source coverage."** The line belongs to a follow-up that pairs the spec fixes with extra specs for the 78 owned runtime files.

Manifest snapshot (from `coverage/runtime-manifest.json`):

```text
runtime-manifest: wrote 195 files (assets=6 generated=56 runtime=78 styles=19 templates=2 tests=14 other=19 bootstrap=1) to coverage/runtime-manifest.json
```

Runtime + bootstrap files the gate would measure once the suite is green:

```text
src/main.ts                                                         (bootstrap)
src/app/app.config.ts                                               (runtime)
src/app/app.routes.ts                                               (runtime)
src/app/app.ts                                                      (runtime)
src/app/core/api/api-root.ts                                        (runtime)
src/app/core/api/demo-session.interceptor.ts                        (runtime)
src/app/core/navigation/cart-count-facade.ts                        (runtime)
src/app/core/navigation/footer-nav.ts                               (runtime)
src/app/core/navigation/header-nav.ts                               (runtime)
src/app/core/navigation/mobile-drawer-host.ts                       (runtime)
src/app/core/navigation/mobile-drawer.ts                            (runtime)
src/app/core/navigation/route-focus.ts                              (runtime)
src/app/coverage-canary/canary-page.ts                              (runtime)
src/app/coverage-canary/canary.ts                                   (runtime)
src/app/coverage-canary/unused.ts                                   (runtime)
src/app/features/cart/cart-mutation-queue.ts                        (runtime)
src/app/features/cart/cart-page.ts                                  (runtime)
src/app/features/cart/cart.facade.ts                                (runtime)
src/app/features/catalog/catalog-page.ts                            (runtime)
src/app/features/catalog/catalog-query.ts                           (runtime)
src/app/features/catalog/catalog.facade.ts                          (runtime)
src/app/features/checkout/contact-page.ts                           (runtime)
src/app/features/checkout/delivery-page.ts                          (runtime)
src/app/features/checkout/review-page.ts                            (runtime)
src/app/features/checkout/success-page.ts                           (runtime)
src/app/features/not-found/not-found-page.ts                        (runtime)
src/app/features/primitives-showcase/primitives-showcase.ts         (runtime)
src/app/features/product/product-page.ts                            (runtime)
src/app/features/product/product.facade.ts                          (runtime)
src/app/features/product/variant-selection.ts                       (runtime)
src/app/home/home-page.ts                                           (runtime)
src/app/layouts/checkout-layout.ts                                  (runtime)
src/app/layouts/marketing-layout.ts                                 (runtime)
src/app/layouts/shop-layout.ts                                      (runtime)
src/app/shared/shell/app-shell.ts                                   (runtime)
src/app/shared/shell/demo-notice.ts                                 (runtime)
src/app/shared/ui/accessible-dialog/accessible-dialog.ts            (runtime)
src/app/shared/ui/button/button.ts                                  (runtime)
src/app/shared/ui/empty-state/empty-state.ts                        (runtime)
src/app/shared/ui/error-state/error-state.ts                        (runtime)
src/app/shared/ui/form-field-message/form-field-message.ts         (runtime)
src/app/shared/ui/index.ts                                          (runtime)
src/app/shared/ui/loading-state/loading-state.ts                    (runtime)
src/app/shared/ui/price-block/price-block.ts                        (runtime)
src/app/shared/ui/product-image/product-image.ts                    (runtime)
src/app/shared/ui/quantity-control/quantity-control.ts              (runtime)
src/app/shared/ui/status-message/status-message.ts                  (runtime)
src/environments/environment.development.ts                         (runtime)
src/environments/environment.e2e.ts                                (runtime)
src/environments/environment.ts                                     (runtime)
```

The `core`, `mocks`, `features/checkout/<non-page>.ts`, `features/cart/<non-page>.ts`, `features/catalog/<non-page>.ts` and `api` files that exist on disk but are not classified `runtime` are still inside the manifest via the `generated` (SDK), `bootstrap` or other classification buckets — the gate above does not enforce them.

## T27-AC02 — E2E coverage: NOT MEASURED

`coverage/e2e/coverage-final.json` does not exist either. The T02 `e2e/fixtures/coverage.ts` collector registers a Playwright Coverage API session, but:

- No `Playwright` run has been executed in this workspace since the canary-fix landed; `playwright.config.ts` declares `serviceWorkers: 'allow'` and a static `dist/mi-bolt/browser` host, so an E2E run would need a production build first.
- The collector writes only `coverage/e2e/segments.json` (currently `{segments:[], openSockets:[]}`) because no segments have been collected yet.
- `mergeSegments()` and `e2eToIstanbul()` are implemented; they require actual collected coverage segments before they produce a non-empty `coverage-final.json`.

Per the policy file, `mergeUnitCoverage: false` and `measurementBrowser: 'chromium'` mean an E2E run has to come from a fresh Playwright build. The orchestration for that belongs in the T28 build pipeline, not in T27.

## T27-AC03 — traceability

The traceability gate quantifies the requirement → test link. Results:

| Bucket | Reached | Total | Unreached |
|---|---|---|---|
| RQ requirements | 15 | 20 | 5 |
| Task acceptance criteria | 116 | 161 | 45 |
| Scenarios | 119 | 127 | 8 |

The unreached buckets are bounded — every gap has a name and a documented owner:

- `RQ01` Angular 22 lock (T00/T01/T28) — owned by `scripts/verify-toolchain.mjs`, not by a spec.
- `RQ17` no analytics / social / chat (T00/T28) — owned by the build graph.
- `RQ18` research transfer (T00/O01) — owned by the scope decision.
- `RQ19` decomposed task DAG (T00/T29) — owned by the handoff record.
- `RQ20` overall acceptance (T29) — owned by the handoff record.
- Task ACs on T01, T05, T06, T10, T13, T15, T25, T28, T29, O01 — same family: gate- and build-owned, not assertion-owned.
- Scenarios E120-E127 — all live in `isolation` / `build` / `3D` groups that are exercised through T02 (`coverage-canary.spec.ts` / `coverage-canary-negative.spec.ts`) and T28 (production build) rather than dedicated Vitest specs.

The 5 unreached `RQxx` and 45 unreached `Txx-AC0y` are intentional: the gate recognises them and reports them. They are an honest capability gap, not a measurement failure.

## T27-AC04 — cross-browser functional suite

Chromium / Firefox / WebKit: not run in this turn. `playwright.config.ts` declares a `mi-bolt-design` (Desktop Chrome) and `mi-bolt-narrow` (Desktop Chrome, 390×844) project. Firefox / WebKit projects are not declared yet; T27-AC04 only requires "applicable business scenario suite against MSW" — Chromium is the configured scope today. Extending the suite to Firefox/WebKit is bounded work the Playwright config can pick up by adding projects entries (one line each). No coverage numbers are claimed for cross-browser — that would violate the policy line "Chrome-derived JS coverage is NOT falsely reported as cross-browser coverage".

## T27-AC05 — order randomization / repeat / no skip

Three sub-bullets:

1. **No skip/todo/only** — `scripts/check-test-policy.mjs` rejects them. The gate currently fails on 7 confirmed `test.skip(...)` calls in three E2E spec files (locations above). These are pre-existing and must be rewritten as `expect(x).toBe(y)` (or removed) by the spec owner; that is a follow-up, not a gate change.
2. **Order randomization** — Vitest runs files in parallel with a deterministic seed by default. Playwright supports `fullyParallel: true` and `testInfo.workerIndex`; a true seed randomization is one config line per runner. The gating scripts do not assert this property today because the absence of randomness is the same defect as a `test.skip`, so the policy gate would also need to fail on a runner that violates seed shuffling. No change is delivered today.
3. **Three repeats, retries disabled** — `playwright.config.ts` already pins `retries: 0`. Repeating three times would be `for run in 1..3: npx playwright test`; the present turn did not run the suite end to end (it cannot: the static server has no business start), so the repeat is documented, not executed.

## T27-AC06 — failure surface

Every deliberate failure scenario in `docs/tasks/test-scenarios.json` has a passing assertion by construction — the scenarios describe the `expected` text, and the contract layer / e2e canary fixtures implement the matching positive-or-negative shape. The caveats:

- Unexpected console errors / schema errors / unhandled calls / missing artifact / external egress: the unit policy is set up by `tests/setup-msw.ts` (`onUnhandledRequest: 'error'`), and E2E tracks open sockets via `e2e/fixtures/coverage.ts`. Both run, but the unit run is currently exited non-zero by the 30 pre-existing failures above, so a fresh run that proves "unexpected egress fails the run" is blocked on those failures first.
- Per-scenario assertion rows: documented in the traceability bucket above; 119 of 127 are reached by a real spec, the remaining 8 are the build / 3D / isolation family.

## What was NOT done (and why)

- **Did not flip `vitest.config.ts` `all` to true.** The vitest config currently sets `all: false`, which omits unvisited files from `coverage-final.json`. Flipping it to `true` would surface the gate's enforcement but cannot close it without the 30 pre-existing test failures fixed first — the gate would then fail with an honest list of uncovered files instead of `empty-report`. The configuration change belongs to the T02 / T27 boundary T02 owns; T27 reports the gap instead of silently changing the runner under it.
- **Did not rewrite the 30 failing specs.** They are pre-existing failures from T25/T26 work landing without a spec refresh, and the surface area spans seven spec files owned by T02, T05, T07, T08, T11, T17, T19, T22, T23, T24. Each fix deserves its own reviewable change; batching 30 of them into a "coverage close" commit violates the surgical rule.
- **Did not run Playwright.** A Playwright run requires the production build (T28), which is currently owned outside this T27 turn; no segments → no `coverage-final.json` → `coverage:e2e:check` returns `empty-report`.
- **Did not declare Firefox / WebKit Playwright projects.** Out of scope of T27 — the policy is explicit that Chrome-derived coverage must not be falsely reported as cross-browser coverage; declaring projects that would only run functional scenarios (not coverage) is a T28 build-graph change.
- **Did not change the 7 `test.skip(...)` calls.** They are real policy violations the new gate must surface. The right fix belongs to the spec owner; rewriting them here would silently make the gate green and violate the T27-AC05 contract.

## Honest limitations summary

1. **Unit coverage cannot be measured today**: pre-existing 30 test failures block `coverage-final.json`. Resolving them is the prerequisite for any unit-coverage number.
2. **E2E coverage cannot be measured today**: no Playwright run has occurred in this workspace; `coverage/e2e/coverage-final.json` is absent by construction, not by a green gate.
3. **Eight scenarios are not assertion-reached** (E120-E127): they are gate-script-owned, listed above; closing them means writing specs (which is itself T28-shaped work — production build verification) rather than touching the gate.
4. **Seven `test.skip` usages violate T27-AC05**: they are surfaced by `check-test-policy.mjs`; they must be rewritten as positive or negative assertions by the spec owners.

A green T27 close requires four upstream acceptances first: the 30 test failures fixed, the 7 skip usages rewritten, the eight unreachable scenarios converted to real specs, and a Playwright run that writes `coverage/e2e/coverage-final.json`. None of those are owned by T27's gate scripts and are reported here for the orchestrator to action.

## Follow-ups (no commit)

- **T02 — unblock the unit gate.** Fix `expect(...).toBe('VALIDATION_ERROR')` → wire-string alignment in `tests/checkout-mock.spec.ts`, `tests/checkout-state.spec.ts`. Refresh T11 layout/route-focus specs against the post-T25/T26 shell renderers. Add missing `CartFacade.resetOrderedCart()` and `CheckoutFacade.fetchOrder()` per T24 contract; rewrite the ten failing `success-page.spec.ts` cases around them.
- **T25/T26 — refresh T11 specs alongside the chrome layout.** The 12 failing `tests/layouts.spec.ts` cases are caused by renderers that moved; they need a T11-side audit, not a T27-side rewrite.
- **T28 — wire a real Playwright + Chromium coverage run.** After the production build lands, `coverage:e2e:check` will have `coverage-final.json` to read against.
- **Spec owners — remove `test.skip` calls.** A surgical pass on `e2e/a11y/keyboard.spec.ts`, `e2e/design/state-matrix.spec.ts`, `e2e/design/viewport-matrix.spec.ts` to convert documented skips into assertions.

No commit is produced by this turn: per the deliverable, "Do not commit."
