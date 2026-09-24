# MiBolt frontend

The Angular workspace under this directory, generated with Angular CLI 22.1.8. It holds three applications, `storefront`, `demo-payment` and `admin`, and three libraries, `core-api`, `shop-api` and `shop-mocks`. Installing the workspace and the `mise run` modes that start these apps are covered in the repository root [`README.md`](../README.md), not repeated here.

## 📋 Projects

| Project        | Type        | Path                    | What it is                                                                                                                                                                        | Dev port                                                   | Alias                 |
| -------------- | ----------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------- |
| `storefront`   | application | `projects/storefront`   | The shop: catalogue, cart and checkout                                                                                                                                            | 4200 (`ng serve`'s own default; not set in `angular.json`) | —                     |
| `demo-payment` | application | `projects/demo-payment` | The demo payment gateway, a separate origin the shop hands off to, served under `/demo-fizetes/`                                                                                  | 4210                                                       | —                     |
| `admin`        | application | `projects/admin`        | The shop's back-office application, served under `/admin/`                                                                                                                        | 4220                                                       | —                     |
| `core-api`     | library     | `projects/core-api`     | The API root resolution (`resolveApiRoot`) and the demo-session interceptor the storefront and the demo payment app share; the admin keeps its own `If-Match` interceptor instead | —                                                          | `@mi-bolt/core-api/*` |
| `shop-api`     | library     | `projects/shop-api`     | The SDK `ng-openapi-gen` generates from `../contracts/commerce/openapi.yaml`; never edited by hand                                                                                | —                                                          | `@mi-bolt/api/*`      |
| `shop-mocks`   | library     | `projects/shop-mocks`   | The MSW mock backend: handlers, fixtures, persistence and the in-page worker bootstrap                                                                                            | —                                                          | `@mi-bolt/mocks/*`    |

## 👤 Configurations: mock or real backend

`npm start` (`ng serve storefront`, the `development` configuration and the default) runs the shop on the in-page MSW mock: `environment.development.ts` replaces `environment.ts` (`demo: true`), and `proxy.conf.json` only forwards `/demo-fizetes` to the payment app's own dev server on port 4210 — every `/api` call stays in the page. `npm run start:local-backend` (`--configuration local-backend`) swaps in `environment.local-backend.ts` instead (`demo: false`, so the mock worker never starts) and `proxy.local-backend.conf.json`, which forwards `/api` to `http://localhost:8080`. `npm run start:admin` and `npm run start:admin:local-backend` are the same pair for the admin app, on the same two files under `projects/admin/src/environments/` and the same `proxy.local-backend.conf.json`.

How the shop reaches the payment app follows the same switch. On the mock configuration both apps stay on port 4200: the mock's URLs are relative and `proxy.conf.json` reaches the payment app through `/demo-fizetes`. On `local-backend`, the backend hands the shop an absolute `redirectUrl` on `http://localhost:4210` (`projects/storefront/src/app/features/checkout/order-submission.ts`, `review-page.ts`) — the payment gateway is a separate origin, as a real one is — so the browser leaves the shop for the payment app's dev server; `returnUrl` brings the browser back to `http://localhost:4200/penztar` (`projects/demo-payment/src/app/payment-page.ts`). ⚠️ The payment app has no `local-backend` configuration: its dev server always runs the `development` configuration, whose `projects/demo-payment/src/main.ts` starts the MSW mock whenever `isDevMode()` is true, and the mock's handler for `*/api/v1/payment-intents/:paymentIntentId` answers before `proxy.payment.conf.json` (which forwards `/api` to port 8080) is ever reached. The mock does not know the backend's payment intent, so on `local-backend` the payment page reports it as not found and a card payment does not complete. MIM-433 tracks the fix; until then a full purchase against the real backend runs on the root `mise run stack`, whose web container serves the production build of the payment app.

The built apps run on the real backend through two static hosts, both `scripts/serve-static.mjs`: `MI_BOLT_API_PROXY=http://localhost:8080 PORT=4200` for the shop (serving `dist/storefront/browser/`), and `MI_BOLT_PAYMENT_ONLY=1 MI_BOLT_PAYMENT_STATIC_DIR=dist/demo-payment/browser MI_BOLT_API_PROXY=http://localhost:8080 PORT=4210` for the payment app. `MI_BOLT_API_PROXY_TIMEOUT_MS` bounds how long the proxy waits for the backend before answering `502`; `HOST` and `MI_BOLT_E2E_STATIC_DIR` are the remaining environment variables the script reads.

The root `mise run dev` and `mise run dev:docker` start the storefront and the admin in the `local-backend` configuration, the payment app with `npm run start:payment` (on the mock, as above), and the backend, for you; see the root [`README.md`](../README.md).

## 🔧 npm scripts

Run a script as `npm --prefix frontend run <script>` from the repository root, or `npm run <script>` from inside `frontend/`.

| Script                      | Runs                                                                                                                                                                                                            | Use it when                                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `ng`                        | The Angular CLI directly                                                                                                                                                                                        | Running an arbitrary `ng` command against the workspace                                     |
| `start`                     | `ng serve storefront` (`development` configuration, in-page MSW mock)                                                                                                                                           | Everyday shop development on the mock backend                                               |
| `start:payment`             | `ng serve demo-payment` (`development` configuration, in-page MSW mock)                                                                                                                                         | Serving the payment app on its own dev server                                               |
| `start:admin`               | `ng serve admin` (in-page MSW mock)                                                                                                                                                                             | Everyday admin development on the mock backend                                              |
| `start:admin:local-backend` | `ng serve admin --configuration local-backend`                                                                                                                                                                  | Developing the admin app against the real Spring backend                                    |
| `start:local-backend`       | `ng serve storefront --configuration local-backend`                                                                                                                                                             | Developing the shop against the real Spring backend                                         |
| `build`                     | `ng build storefront` (`production` by default)                                                                                                                                                                 | Production build of the shop into `dist/storefront/`                                        |
| `build:payment`             | `ng build demo-payment`                                                                                                                                                                                         | Production build of the payment app into `dist/demo-payment/`                               |
| `build:admin`               | `ng build admin`                                                                                                                                                                                                | Production build of the admin app into `dist/admin/`                                        |
| `check:payment-boot`        | `node scripts/check-app-boot.mjs`: boots `demo-payment` under `ng serve` and asserts the MSW worker script is served at its own base path                                                                       | After a production build, to catch a base-path or `assets` regression                       |
| `check:admin-boot`          | `node scripts/check-app-boot.mjs --project admin --base-path /admin`: the same check for the admin app                                                                                                          | After a production build, to catch the same regression on the admin app                     |
| `check:admin-dist`          | `node scripts/check-dist-free-of.mjs dist/admin/browser setupWorker mockServiceWorker`: fails if any built `.js` file names or contains one of the needles                                                      | After building `admin`, to prove the production dist ships no mock code                     |
| `check:storefront-dist`     | The same check against `dist/storefront/browser`                                                                                                                                                                | After building `storefront`, for the same proof                                             |
| `check:payment-dist`        | The same check against `dist/demo-payment/browser`                                                                                                                                                              | After building `demo-payment`, for the same proof                                           |
| `build:check`               | `node scripts/build-check.mjs`: runs `ng build storefront --configuration production`, streams its output and fails on any line that looks like a warning                                                       | A stricter production build gate than `build`, used in CI                                   |
| `watch`                     | `ng build storefront --watch --configuration development`                                                                                                                                                       | Rebuilding the shop on every source change without serving it                               |
| `test`                      | `ng test`: the Vitest unit suite, for every project that defines a `test` target (`storefront`, `demo-payment`, `admin`, `core-api`, `shop-mocks`), each against its own `coverageThresholds` in `angular.json` | Before every commit                                                                         |
| `test:contract`             | `vitest run --config vitest.contract.config.ts`: the Node-only contract suite under `tests/contract/`                                                                                                           | After `test`, to prove the generated SDK against the OpenAPI contract and MSW's Node server |
| `e2e`                       | `E2E_COVERAGE_GATE=1 playwright test --project=seed --project=integration-chromium-fullhd --project=integration-chromium-mobile`                                                                                | The default Chromium end-to-end run, coverage-gated                                         |
| `e2e:all`                   | `playwright test --project=seed --project='integration-*'`                                                                                                                                                      | Running every browser/viewport integration project                                          |
| `e2e:smoke`                 | `E2E_TARGET=local-backend playwright test --project=smoke`                                                                                                                                                      | Running the smoke project against the `local-backend` configuration                         |
| `e2e:install`               | `playwright install --with-deps chromium firefox webkit`                                                                                                                                                        | Once, before running any of the `e2e*` scripts                                              |
| `lint`                      | `ng lint`                                                                                                                                                                                                       | ESLint over every project's own `lintFilePatterns`                                          |
| `format`                    | `prettier --write .`                                                                                                                                                                                            | Reformatting the workspace                                                                  |
| `format:check`              | `prettier --check .`                                                                                                                                                                                            | Verifying formatting without writing, as CI does                                            |
| `api:generate`              | `ng-openapi-gen --config ng-openapi-gen.json && ng-openapi-gen --config ng-openapi-gen.admin.json`: regenerates both SDKs from `../contracts/commerce/openapi.yaml`                                             | After the OpenAPI contract changes                                                          |
| `api:drift`                 | `api:generate`, then `git diff --exit-code` and `git ls-files --others --exclude-standard` over both generated directories                                                                                      | Proving the committed SDKs match the committed contract, as CI does                         |
| `fixtures:catalog`          | `node scripts/build-catalog-fixture.mjs`: regenerates `docs/api/fixtures/catalog.json` from `../data/catalog/catalog.json`                                                                                      | After the backend catalogue data changes                                                    |
| `fixtures:catalog:check`    | `node scripts/build-catalog-fixture.mjs --check`                                                                                                                                                                | Proving the committed fixture matches the source catalogue, as CI does                      |

## 🧪 Tests

Unit tests run through Vitest under the `@angular/build:unit-test` builder (`ng test`, the `test` script): every project with a `test` target — `storefront`, `demo-payment`, `admin`, `core-api` and `shop-mocks` — is checked against the same coverage floor in its own `angular.json` entry: statements 80, branches 75, functions 80, lines 80. `shop-api` has no `test` target; it is generated code.

The contract suite (`test:contract`) runs `vitest run --config vitest.contract.config.ts` in a Node environment, over `tests/**/*.spec.ts`: it reads the OpenAPI document and drives the generated SDK against MSW's Node server rather than jsdom, which `ng test`'s own discovery cannot reach.

The Playwright projects, defined in `playwright.config.ts`, all serve `storefront`:

- `e2e` runs `seed` plus the two Chromium integration projects (`integration-chromium-fullhd`, `integration-chromium-mobile`), with `E2E_COVERAGE_GATE=1`.
- `e2e:all` runs `seed` plus all six `integration-{chromium,firefox,webkit}-{fullhd,mobile}` projects.
- `e2e:smoke` sets `E2E_TARGET=local-backend` and runs the `smoke` project alone, against the `local-backend` configuration.

Both `e2e` and `e2e:all` serve the `development` configuration on port 4400 by default (`E2E_PORT` overrides it); `e2e:smoke` serves the `local-backend` configuration on port 4410. `e2e:install` (`playwright install --with-deps chromium firefox webkit`) installs the browsers once before any of the three are run.

## 🔧 API client and fixtures

`api:generate` runs `ng-openapi-gen` twice against `../contracts/commerce/openapi.yaml`: once for the shop SDK (`projects/shop-api/src/generated/`) and once for the admin SDK (`projects/admin/src/app/api/generated/`). `api:drift` reruns `api:generate` and then fails if either generated directory differs from what is committed, or holds an untracked file — the CI gate that proves the two SDKs have not drifted from the contract.

`fixtures:catalog` regenerates `docs/api/fixtures/catalog.json` from `../data/catalog/catalog.json`, the backend's own catalogue data, shaped to the OpenAPI `Product` schema. `fixtures:catalog:check` runs the same generator with `--check` and exits 1 with a one-line message when the committed fixture is stale.

## 🧪 CI

`.github/workflows/frontend.yml` (`workflow_call`) runs four jobs in parallel on every call: `lint` (`npm run lint`, `npm run format:check`), `unit-tests` (`npm run test`, `npm run test:contract`, then a coverage summary per project and one `coverage-unit` artifact upload), `build` (`build:check`, `build:payment`, `build:admin`, the three `check:*-dist` gates, then `check:payment-boot` and `check:admin-boot`), and `api-drift` (`npm run api:drift`). Two further jobs, `e2e` (a six-cell matrix, one job per browser and viewport, the Chromium cells coverage-gated) and `e2e-report` (merging the six blob reports into one HTML report), are switched off today: both carry `if: false`, because the suite has no spec under `e2e/integration/` yet and the coverage gate would fail on an empty denominator.

`.github/workflows/ci.yml` calls `frontend.yml` on a pull request or a push to `main`, but only when its `changes` job (`dorny/paths-filter` against `.github/components.yml`) finds a changed path under `frontend/**`, `contracts/**`, `data/catalog/**`, `mise.toml`, `.github/**` or `tools/ci/**`.

## 📋 Further reading

- [`../README.md`](../README.md) — the repository root: install, the `mise run` start modes, workflows, the stack and order-flow diagrams
- [`../docs/monorepo.md`](../docs/monorepo.md) — how the repository is laid out
- [`docs/README.md`](docs/README.md) — the MVP design and execution documentation
- [`docs/api/README.md`](docs/api/README.md) — the API contract and mock data
- [`docs/design/README.md`](docs/design/README.md) — the yettel design reference
- [`projects/admin/README.md`](projects/admin/README.md) — the admin application's own commands and mock backend
- [`specs/README.md`](specs/README.md) — the test plans directory
- [`../backend/README.md`](../backend/README.md) — the Spring backend

## Hosted full-stack checks

The deployed web image serves the storefront at `/`, admin at `/admin/`, and
the payment app at `/demo-fizetes/`. All three use `/api/v1` on the same HTTPS
origin. A PR preview uses `https://bolt-pr-<PR-number>.mimukodik.hu`; the stable
demo uses `https://bolt.mimukodik.hu`. Hosted builds use the real commerce
backend, including the payment redirect and return flow.

Before reporting a preview as verified, compare `/__candidate.json` with the
Actions candidate receipt and wait for the deployed `Preview Smoke` receipt.
The local `smoke` run and a healthy deployment are separate checks. See the
[candidate rollout guide](../deploy/candidate/README.md) for eligibility and
retry commands. A new PR commit resets preview data from the approved template.
