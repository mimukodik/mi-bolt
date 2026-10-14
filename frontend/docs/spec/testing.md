# Mock-only quality strategy — unit coverage thresholds

The end-to-end suite was reinstated on 2026-09-22: Playwright under `e2e/`, written only by the `playwright-test-*` agents, its CI job skipped until the first spec lands. Section 3 describes it.

These are acceptance requirements for the future application. This planning package does not contain a completed Angular app and therefore does not claim an Angular test suite, 100% application coverage, or successful SDK compilation. Historical package-generation logs are intentionally not distributed with these project docs; fresh application evidence is produced during implementation and recorded with the work in Linear.

## 1. Exact meaning of the coverage thresholds

Four independent unit metrics are measured on the aggregate of each project with a `test` target (the generated `shop-api` library has none): statements ≥ 80, branches ≥ 75, functions ≥ 80, lines ≥ 80 (`angular.json`, `coverageThresholds`, `perFile: false`). Passing100% of written tests is NOT100% source coverage, nor does source coverage prove correctness. The scenario/state/requirements matrix therefore adds independent behavioral assertions.

The denominator is explicit and version-controlled in the `coverageInclude` and `coverageExclude` options of the `test` target in `angular.json`. Include **all first-party runtime TypeScript**, including app bootstrap, guards, interceptors, facades, presentational behavior, parsing/validation, shared helpers and MSW mock handler/domain/persistence code. An unimported or unvisited file remains in the denominator with zero execution. Dead or impossible code requires a design correction, not an ignore annotation. No broad `core/**`, `mocks/**` or `errors/**` exclusions are allowed.

Classification boundaries, not hidden relaxations:

* Vendor dependencies, Angular compiler-generated internals and untouched ng-openapi-gen output are not handwritten application code. Generated SDK still has100% **operation/transport/schema** parity tests. Handwritten templates for a generator would become owned source.
* Type-only .d.ts and interfaces have no executable statements; they are covered by strict compile/contract checks. Test code is not recursively required to test itself.
* Node-only test adapters and build/gate tools cannot execute in a browser. They receive unit tests and black-box command/integration coverage in their own process. Every target's classification is auditable.
* CSS/HTML design is not equated to JavaScript statement coverage. Every meaningful authored template control-flow state and interactive UI state needs an asserted DOM/state row and visual evidence, plus responsive/a11y audits.

Any new file or changed coverage boundary needs an explicit classification. A coverage run with an absent report, an empty source map, a NaN or undefined metric, an unknown exclusion or an unreviewed exemption is not evidence, and the task that produced it records that rather than a percentage. No coverage-ignore pragmas or arbitrary green thresholds.

## 2. Unit strategy

Use the Angular official `@angular/build:unit-test` builder with Vitest and coverage-v8. Angular's published configuration supports coverageInclude/coverageExclude/coverageThresholds/coverageReporters. Pin runner and coverage-provider versions compatibly with the selected Angular22 toolchain. [S11,S12]

Use real Angular TestBed and generated SDK/HttpClient when testing data flow. **MSW setupServer** intercepts the outgoing request. Do not mock the Api service, HttpClient or facades just to avoid testing the HTTP boundary; do not replace business HTTP with provideHttpClientTesting/HttpTestingController. Pure functions receive deterministic fixture arguments; 'all tests use mocks' means all external data/dependencies are controlled, not that functions under test are mocked away.

For isolated presentation-unit tests it is valid to pass typed inputs and spy on their output event, because no business request is involved. Inject deterministic Clock/IdFactory/PersistenceAdapter and controlled model-viewer adapter for boundary failures. Test actual browser adapters using their appropriate integration tests.

Setup lifecycle: beforeAll server.listen with fail-closed unhandled policy; beforeEach fresh repository/scenario; afterEach verify no unexpected/unhandled request, clear handlers and fake timers; afterAll close. All fixture images/fonts/models are local or mocked; no operator site or production SDK host is contacted. Test runtime input schema validation, not only TS assignability.

Example planned angular.json test target:

```json
{
  "builder": "@angular/build:unit-test",
  "options": {
    "coverage": true,
    "coverageInclude": ["projects/storefront/src/**/*.ts"],
    "coverageExclude": ["**/*.spec.ts", "**/*.test.ts", "**/*.d.ts", "tests/**"],
    "coverageThresholds": {"perFile":false,"statements":80,"branches":75,"functions":80,"lines":80},
    "coverageReporters": ["html","lcov","json","json-summary"]
  }
}
```

`coverageThresholds.perFile` is `false`, so the four thresholds apply to the project aggregate rather than to each file. Leave the runner's `coverage.all` on, so an unimported file appears in the report with zero execution instead of being absent from it. The builder exits non-zero when a threshold is unmet.

## 3. End-to-end suite

The end-to-end suite was reinstated on 2026-09-22. `playwright.config.ts` defines twelve projects: `seed`; six `integration-{chromium,firefox,webkit}-{fullhd,mobile}` projects (1920×1080 and 390×844) and four Chromium-only `integration-chromium-{320,768,1024,1440}` projects, the standard's other widths from §6, each with the height and touch flags of the existing project on its side of the 1024px breakpoint (844 and mobile below it, 1080 from it), all ten running the whole of `e2e/integration/` against the MSW-mocked development build (plus `e2e/seed.spec.ts`); and a `smoke` project that runs against the `local-backend` configuration (`e2e/smoke/`) with no mocks. Every spec imports `test` from `e2e/fixtures/coverage`, which collects V8 coverage through monocart-reporter on the Chromium projects (Firefox and WebKit run without coverage because `page.coverage` is Chromium-only). The coverage gate lives in the `onEnd` hook of `playwright.config.ts`; it compares statements, branches, functions and lines against its own thresholds in `e2e/coverage-thresholds.json` (80 statements, 68 branches, 80 functions, 80 lines), and is skipped while `e2e/integration/` has no `*.spec.ts`. Statements, functions and lines match the unit thresholds; branches is the owner's decision to lower the e2e gate in configuration only where needed, to the whole-number floor of the lower gated cell's measured branch coverage (68.1, `integration-chromium-fullhd` with `seed`, measured the way CI runs it). Only the `playwright-test-planner`, `-generator` and `-healer` agents write specs; the `playwright-tests` skill says how. The `e2e` CI job runs only the `integration-chromium-fullhd` cell, with `seed` and the coverage gate, on every call, and keeps the other nine cells commented out in its matrix to save CI minutes; it builds the storefront and the `demo-payment` app in their `development` configuration and serves both through `scripts/serve-static.mjs`, the payment app at `/demo-fizetes/` through `MI_BOLT_PAYMENT_STATIC_DIR`, because the card payment scenarios leave the shop for it. It runs with `--grep-invert @ci-skip` to keep the run short, so specs tagged `@ci-skip` are left out of CI and run only locally, where they must pass; the tag goes on lower-value specs chosen by their CI run time and their value, each with a comment saying what it asserts, as long as the specs CI still runs pass the coverage gate (BOLT-7).

## 4. Deterministic scenario catalogue

`docs/spec/test-scenarios.md` lists 126 specified scenario rows: 123 baseline and 3 optional 3D. E004, the coverage canary, was removed with the coverage-canary subsystem under decision D19. Rows include exact actions, expected assertions, scenario names and groups. Many rows are parameterized (all sort modes, input boundaries, viewport matrix), so 126 is an inventory count, not final test-run count or source coverage claim.

A ScenarioDescriptor contains scenarioId, fixedNow, seed, handler overrides/failure schedule and optional non-PII initial snapshot. Allowed fault types:503 once, network error before commit, delayed old read, version conflict, out-of-stock at add/order, price changed, declined/pending payment, response lost after commit, invalid storage and unavailable worker/asset.

Hold response ordering explicitly for race tests. Avoid arbitrary sleep. Use condition assertions, controllable deferred responses and mock clocks. Mock stock/date/IDs are reproducible. Polling tests advance clock, not real waiting. Local images are deterministic; reduced motion and fonts are stable for snapshots.

Contract matrix covers all16 operations with success, each documented status/code family, required-header cases, schema-invalid requests and semantic-domain failures. A wire contract does not create business logic: shipping/address conditions, stock atomics and idempotency still need domain assertions. [S15]

## 5. Layer-specific examples

Planned unit transport pattern after code generation and mock implementation:

```ts
const cart = await firstValueFrom(api.invoke(addCartItem, {
  cartId: seededCart.id,
  'If-Match': `"${seededCart.version}"`,
  'Idempotency-Key': 'intent-add-001',
  'X-Demo-Session': 'test-session-001',
  body: { variantId: 'demo-one-5g-graphite-256', quantity: 2 }
}));
expect(cart.items).toHaveLength(1);
expect(cart.subtotal).toEqual({amount:679980,currency:'HUF'});
```

The parameter field spelling must be checked against actual ng-openapi-gen output in T04; do not hand-edit generated names to match a snippet. This illustrates a real SDK request intercepted by MSW, not a stubbed SDK return. The snippet assumes an EMPTY seeded cart; test preconditions must state that explicitly so adding2 does not merge into an existing1.

Browser-driven baseline assertions are written as Playwright specs under `e2e/integration/` by the `playwright-test-*` agents (section 3); none exist yet.

## 6. Accessibility and visual matrix

For all four families plus5 purchase states:320,390,768,1024,1440,1920px; default+loading+error/empty as applicable. Add filtered drawer, variant disabled, image failure/zoom, contact invalid, review submitting/declined/expired/price changed and receipt states. Full keyboard journey includes all dialog types with focus restoration. Manual/automated checks cover contrast, names, order, sticky focus, reduced motion and200% text resizing. Axe scans supplement but do not certify WCAG compliance.

Visual reference is the unchanged reference image in the separately installed skill plus its more precise written tokens/rules. Record deliberate changes: MiBolt live name replaces old raster branding, dark text corrects orange-button contrast, absent-scope commercial/marketing elements removed. Reuse screenshot dimensions and do not accept wholesale snapshot updates without review.

## 7. Project commands

These are the exact package scripts the application defines; they are not commands claimed executed for an absent app:

```text
npm ci
npm run lint              ng lint — TS, templates, and the test-policy rules
npm run test              ng test — Vitest through @angular/build:unit-test, with coverage and the 80/75/80/80 thresholds
npm run build              ng build — the optimized production artifact
npm start                 ng serve — the local development server
npm run api:generate      ng-openapi-gen --config ng-openapi-gen.json, then --config ng-openapi-gen.admin.json
npm run api:drift         api:generate, then git diff --exit-code and git ls-files --others --exclude-standard on both generated SDKs
npm run format            prettier --write .
npm run format:check      prettier --check .
```

The frontend CI workflow (`.github/workflows/frontend.yml`, called by `.github/workflows/ci.yml`) runs these gates: `lint`, `unit-tests` with coverage, `build`, `api-drift`, the ten-cell `e2e` matrix (the full HD and mobile Chromium cells coverage-gated, §3) and `e2e-report`. Every command is also run directly by whoever does the work, and its exit code is recorded with that task's evidence in Linear. Two of the checks are configuration rather than commands of their own: bundle budgets are the Angular CLI's own `budgets` array in the `production` build configuration of angular.json, so `ng build` enforces them, and unit coverage thresholds are the `@angular/build:unit-test` builder's own `coverageThresholds`, so `ng test` enforces them. Browser tests use a local STATIC host, not a business backend. Unexpected console/schema/network errors fail immediately; scenario-expected failures are explicitly asserted.

## 8. Required evidence

Per task: skill version/hash at implementation and independent review; revision; exact command+exit status; the unit coverage report; scenario assertions; actual screenshot viewports; issues fixed and reviewer result. Per release: full source metrics, operation matrix, requirement traceability, static-network log, builds, dependency versions and explicit limitations. Existing plan-package screenshots are not Angular implementation evidence.
