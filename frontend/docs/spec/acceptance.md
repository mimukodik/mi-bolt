# Project-wide strict acceptance criteria

These are RELEASE GATES for the future Angular implementation, not results of this planning package. Every baseline task must also satisfy its own criteria and the mandatory design-skill gate.

- [ ] **AC01** Latest stable Angular 22.x is resolved at execution, exact versions locked, supported peer dependencies verified; Angular 21/23/next/rc are rejected.
- [ ] **AC02** The app is standalone, zoneless, client-rendered only; no SSR/prerender/hydration/server artifacts or Angular PWA worker.
- [ ] **AC03** All authored interactive state uses signals; components use input()/output(), computed() for derived state and @if/@for/@switch with stable track keys. Signal Forms manages checkout.
- [ ] **AC04** `docs/design/yettel.md` is cited for EVERY task execution and EVERY independent verification; the earlier design-skill R01–R26 gate is retired.
- [ ] **AC05** Exactly four commerce screen families exist: Home, Catalogue, Product, Purchase. Three shells: Marketing, Shop, Checkout. Purchase includes cart/contact/delivery/review/success and their error states.
- [ ] **AC06** Every screen and relevant state respects the provided semantic tokens, Hungarian copy, dark shell, orange primary actions, grid, typography and readable price hierarchy.
- [ ] **AC07** All four families and wizard steps work at 320/390/768/1024/1440/1920 CSS px without page overflow; controls remain >=44px, including sticky mobile controls.
- [ ] **AC08** Catalogue search, all declared facets, matching-variant price, counts, all sort modes, pagination, direct URLs and browser history agree under latest-request-wins behavior.
- [ ] **AC09** Product choice keeps media/color/storage/stock/price synchronized; unavailable combinations never silently substitute another variant; gallery works without 3D.
- [ ] **AC10** A single global authoritative mock cart supports add/merge/change/remove, stock/quantity limits, expiry and scoped reload persistence with exact whole-HUF arithmetic.
- [ ] **AC11** Contact/delivery/payment selection/review create a real in-memory mock transaction and durable demo receipt; no placeholder success screen unrelated to API state.
- [ ] **AC12** COD and mock-card success, decline, pending, timeout, server error, stock/price change (409 PRICE_CHANGED on order) and unknown outcome have tested recovery paths.
- [ ] **AC13** Duplicate clicks, repeated requests and timeout-after-commit produce one order and one stock decrement through atomic idempotent processing.
- [ ] **AC14** No payment card data, real fulfillment, external order submission or email is collected/performed; demo labels truthfully describe simulation throughout.
- [ ] **AC15** OpenAPI 3.1.0 defines all 16 operations and all wire models/errors/headers; validators enforce schemas and documented domain invariants.
- [ ] **AC16** ng-openapi-gen generates the only frontend SDK; no manually duplicated DTOs or direct business fetches in components; regeneration is deterministic and clean.
- [ ] **AC17** One reusable MSW handler/domain implementation runs in browser and Node. Mock boot is awaited before Angular. Unknown API traffic fails closed; no real-backend fallback.
- [ ] **AC18** Every test uses deterministic mock state and fake clocks/IDs where needed; each context/test is isolated; after dependency provisioning the test environment cannot reach business internet hosts.
- [ ] **AC19** UNIT: statements, branches, functions and lines meet the aggregate thresholds of each project with a `test` target in `angular.json` `coverageThresholds` (80, 75, 80, 80), as `docs/spec/testing.md` §1 describes. Unvisited files count as zero. Generated/vendor/test-only artifacts are explicitly classified, not covertly excluded.
- [ ] **AC20** E2E: the Playwright suite described in `docs/spec/testing.md` §3 passes; rendered surfaces are also verified by the real-browser pass.
- [ ] **AC21** All declared requirements, component states and mandatory scenario rows have passing assertions in applicable Chromium/Firefox/WebKit suites; code execution alone is not sufficient functional coverage.
- [ ] **AC22** No .skip/.todo/.only, coverage-ignore pragmas, lowered threshold, hidden unreachable-code exclusion or silent retry masks incomplete work; release repeat runs pass without automatic retries. The first owner-approved exception is the e2e coverage gate's branch threshold, which lives in `e2e/coverage-thresholds.json` apart from the unit thresholds and sits at the measured floor (`docs/spec/testing.md` §3). The second is the CI-only exclusion of e2e specs tagged `@ci-skip` (BOLT-7): the CI e2e job runs with `--grep-invert @ci-skip` to stay short, the tagged specs stay in the suite and must pass in every local `npm run e2e`, and the tag goes only on a spec whose behaviour another spec that CI runs also asserts, with a comment naming that spec.
- [ ] **AC23** Accessibility includes semantics, route focus, keyboard-only purchase, screen-reader names/errors, dialogs, reduced motion and 200% text sizing. Automated scans alone are not represented as WCAG certification.
- [ ] **AC24** Snapshot allowlist excludes contact/address/draft/raw request data. Reload preserves cart and privacy-minimized receipt; incomplete checkout reload resets personal fields with explanation. Error within the same app session preserves fields.
- [ ] **AC25** No analytics, tag manager, tracking pixels, session replay, social integration, chat widget, external fonts, consent SaaS or unnecessary operator framework is shipped.
- [ ] **AC26** Optimized static build meets declared budgets under a recorded profile, routes resolve under root/subpath, worker/index cache policy prevents stale boot, and API URLs never receive index.html as a fake JSON response.
- [ ] **AC27** 3D is excluded by default. If approved, local licensed assets + lazy model-viewer + fallback + same quality requirements are mandatory and O01 blocks final acceptance.
- [ ] **AC28** Clean-checkout generation, lint, unit coverage, contract tests, browser matrix, design audit and optimized build all pass with fresh artifacts, including the end-to-end suite described in `docs/spec/testing.md` §3; rendered surfaces are also verified by the real-browser pass. All task statuses and remaining limitations are truthful.
