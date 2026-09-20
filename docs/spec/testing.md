# Mock-only quality strategy — strict 100% unit AND independent E2E

These are acceptance requirements for the future application. This planning package does not contain a completed Angular app and therefore does not claim an Angular test suite, 100% application coverage, or successful SDK compilation. Historical package-generation logs are intentionally not distributed with these project docs; fresh application evidence must be produced during implementation under docs/mi-bolt/execution/.

## 1. Exact meaning of 100%

Four independent unit metrics must be100% both globally and per owned executable runtime file: statements, branches, functions, lines. The same four browser-runtime metrics must independently be100% through user-facing E2E actions. A100% unit run cannot fill an E2E gap. Passing100% of written tests is NOT100% source coverage, nor does source coverage prove correctness. The scenario/state/requirements matrix therefore adds independent behavioral assertions.

The denominator is explicit and version-controlled in the `coverageInclude` and `coverageExclude` options of the `test` target in `angular.json`. Include **all first-party runtime TypeScript**, including app bootstrap, guards, interceptors, facades, presentational behavior, parsing/validation, shared helpers and MSW mock handler/domain/persistence code. An unimported or unvisited file remains in the denominator with zero execution. Dead or impossible code requires a design correction, not an ignore annotation. No broad `core/**`, `mocks/**` or `errors/**` exclusions are allowed.

Classification boundaries, not hidden relaxations:

* Vendor dependencies, Angular compiler-generated internals and untouched ng-openapi-gen output are not handwritten application code. Generated SDK still has100% **operation/transport/schema** parity tests. Handwritten templates for a generator would become owned source.
* Type-only .d.ts and interfaces have no executable statements; they are covered by strict compile/contract checks. Test code is not recursively required to test itself.
* Node-only test adapters and build/gate tools cannot execute in a browser. They receive100% unit coverage and black-box command/integration coverage in their own process; do not falsely report them as Chromium UI coverage. Every target's classification is auditable. Shared mock domain code does execute in browser and MUST appear in E2E source coverage.
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
    "coverageInclude": ["src/**/*.ts"],
    "coverageExclude": ["**/*.spec.ts", "**/*.test.ts", "**/*.d.ts", "src/app/api/generated/**"],
    "coverageThresholds": {"statements":100,"branches":100,"functions":100,"lines":100},
    "coverageReporters": ["html","lcov","json","json-summary"]
  }
}
```

Set `coverageThresholds.perFile` to `true` beside the four 100 values, so each file is measured against the threshold rather than the project aggregate, and leave the runner's `coverage.all` on so an unimported file appears in the report with zero execution instead of being absent from it. The builder exits non-zero when a threshold is unmet. This is planned configuration to validate in T02 against the selected CLI schema, not a claim it was run here.

## 3. E2E strategy and the MSW service-worker trap

Use Playwright with `serviceWorkers:'allow'` and browser `setupWorker`. The scenario descriptor is supplied through a test-only init hook **before app boot**, then the app constructs the same handlers used by Node tests. Every test/context gets a fresh synthetic repository and fixed clock/seed. Controlled reload tests intentionally retain only their own allowlisted snapshot.

Do not enable serviceWorkers:block while claiming browser MSW is still used. Do not substitute page.route().fulfill() for the MSW business API. MSW can own traffic not visible to ordinary Playwright routing; the official Network guide explicitly calls this out. [S14]

Closed-world network checks combine MSW's unhandled/response events, expected operation ownership and browser CSP. Unknown business endpoints fail; same-origin static app chunks/images/worker are explicitly allowlisted. No external DNS/HTTP business traffic is allowed. A deliberate negative test proves egress blocks. Playwright request observation alone is not sufficient evidence for SW-owned traffic.

Tests drive DOM/user events or public URL navigation. `page.evaluate` may set a test fixture/clock or read coverage artifacts; it may NOT call an internal facade/domain function to paint coverage green. Failures that are normally hard to reach come from MSW scenarios or controlled browser capability/storage errors, not calling branches manually.

## 4. Deterministic scenario catalogue

`docs/tasks/test-scenarios.json` contains127 specified scenario rows;124 baseline and3 optional3D. Rows include exact actions, expected assertions, scenario names, groups and owning tasks. Many rows are parameterized (all sort modes, input boundaries, viewport matrix), so127 is an inventory count, not final test-run count or source coverage claim.

A ScenarioDescriptor contains scenarioId, fixedNow, seed, handler overrides/failure schedule and optional non-PII initial snapshot. Allowed fault types:503 once, network error before commit, delayed old read, version conflict, out-of-stock at add/order, price changed, stale/expired quote, declined/pending payment, response lost after commit, invalid storage and unavailable worker/asset. Unit and E2E use the same scenario semantics.

Hold response ordering explicitly for race tests. Avoid arbitrary sleep. Use Playwright auto-wait, condition assertions, controllable deferred responses and mock clocks. Mock stock/date/IDs are reproducible. Polling tests advance clock, not real waiting. Local images are deterministic; reduced motion and fonts are stable for snapshots.

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

Planned E2E baseline assertions:

```ts
await page.goto('/telefonok/demo-one-5g?variant=demo-one-5g-graphite-256');
await page.getByRole('button', {name:'Kosárba teszem', exact:true}).click();
await page.getByRole('link', {name:/Kosár/}).click();
await expect(page.getByRole('heading', {name:'A kosarad'})).toBeVisible();
await expect(page.getByTestId('cart-subtotal')).toHaveText(/339\s*990\s*Ft/);
```

Use human-readable roles/names, and stable data-testid only for ambiguous numeric summaries. Test files have explicit per-scenario fixture setup, not production calls. Full suites include reversed/failed paths, not only this happy path.

## 6. Accessibility and visual matrix

For all four families plus5 purchase states:320,390,768,1024,1440,1920px; default+loading+error/empty as applicable. Add filtered drawer, variant disabled, image failure/zoom, contact invalid, review submitting/declined/expired/price changed and receipt states. Full keyboard journey includes all dialog types with focus restoration. Manual/automated checks cover contrast, names, order, sticky focus, reduced motion and200% text resizing. Axe scans supplement but do not certify WCAG compliance.

Visual reference is the unchanged reference image in the separately installed skill plus its more precise written tokens/rules. Record deliberate changes: MiBolt live name replaces old raster branding, dark text corrects orange-button contrast, absent-scope commercial/marketing elements removed. Reuse screenshot dimensions and do not accept wholesale snapshot updates without review.

## 7. Project commands

Implement these exact package scripts in their owning tasks; they are not commands claimed executed for an absent app:

```text
npm ci
npm run lint              ng lint — TS, templates, and the test-policy rules
npm run test              ng test — Vitest through @angular/build:unit-test, with coverage and per-file 100% thresholds
npm run build              ng build — the optimized production artifact
npm start                 ng serve — the local development server
npm run build:e2e         ng build --configuration e2e — the artifact the Playwright static host serves
npm run api:generate      ng-openapi-gen --config ng-openapi-gen.json
npm run api:drift         api:generate, then git diff --exit-code on the generated SDK
npm run format            prettier --write .
npm run format:check      prettier --check .
npx playwright test       the E2E suite: the Chromium, Firefox and WebKit projects
```

There is no CI pipeline and no aggregate release gate. Each command is run directly by whoever does the work, and its exit code is recorded in that task's evidence under docs/mi-bolt/execution/. Two of the checks are configuration rather than commands of their own: bundle budgets are the Angular CLI's own `budgets` array in the `production` build configuration of angular.json, so `ng build` enforces them, and unit coverage thresholds are the `@angular/build:unit-test` builder's own `coverageThresholds`, so `ng test` enforces them. Browser tests use a local STATIC host, not a business backend. Unexpected console/schema/network errors fail immediately; scenario-expected failures are explicitly asserted.

## 8. Required evidence

Per task: skill version/hash at implementation and independent review; revision; exact command+exit status; the unit coverage report; scenario assertions; actual screenshot viewports; issues fixed and reviewer result. Per release: full source metrics, operation matrix, requirement traceability, static-network log, builds, dependency versions and explicit limitations. Existing plan-package screenshots are not Angular implementation evidence.
