# Coverage register

Every tracked area of the project, what it is responsible for, which skill
owns it or why none does, how deeply it was mapped, and what is still unknown.
A tracked path that serves how work on the repository is done, rather than the
project itself, deliberately has no row. Paths are relative to the repository
root, except `SKILL.md`, which is this skill's own file.

## Contents

- [How to read a row](#how-to-read-a-row)
- [Workspace root](#workspace-root)
- [Frontend workspace configuration](#frontend-workspace-configuration)
- [Storefront](#storefront)
- [Shop libraries, demo payment and core-api](#shop-libraries-demo-payment-and-core-api)
- [Admin](#admin)
- [Frontend documents and design](#frontend-documents-and-design)
- [Contract, generation and catalogue data](#contract-generation-and-catalogue-data)
- [Backend](#backend)
- [Deploy, CI and tools](#deploy-ci-and-tools)
- [Excluded areas](#excluded-areas)

## How to read a row

- **Owner** is the skill that carries the area's how-to, or the reason
  nothing does; where a row names a second skill, that skill carries the part
  the row names beside it. Load the owner for work in the area; this register
  only says which one it is.
- **"As files"** means the owner carries reading and editing those files, not
  a dependency upgrade: no MiBolt skill carries choosing or moving a
  dependency version.
- **Depth** records what was read when the set was mapped on 2026-09-26 at
  commit `7099e689`: *full* (every file named was read), *mostly full*,
  *sampled* (representative files read), *headers* (header comments only),
  *config only*, *names only* or *existence*.
- **Unknowns** were not read, or are questions the reading did not settle.
  Open the file before claiming anything about it, and do not describe a
  *sampled* or *headers* area as fully understood.
- **A path that matches no row** falls under the closest parent directory that
  has a row here or in the layout table of `SKILL.md`. If neither has one, or
  the row it falls under only sends the reader back to this register, open it:
  a path that is part of the project is not mapped yet, which is a reason to
  update this register, and one that only serves how the work is done stays
  out of it.

## Workspace root

| Area | Responsibility | Owner | Depth | Unknowns |
|---|---|---|---|---|
| `mise.toml`, `.gitignore`, `.gitattributes` | root task graph, tool pins, ignore and line-ending rules | `mibolt-workspace-ops` | full | — |
| `README.md`, `docs/monorepo.md` | install and run-mode guide, ports, command and CI-filter tables | `mibolt-workspace-ops` for the tables; this skill's docs index for reading | full | both command tables omit `mise run deploy:check`, which `mise.toml:103-105` defines |
| `.editorconfig` | editor settings | `mibolt-workspace-ops` for the file; the formatting facts sit in `mibolt-frontend-code-standards` and `mibolt-backend-code-standards` | full | — |

## Frontend workspace configuration

| Area | Responsibility | Owner | Depth | Unknowns |
|---|---|---|---|---|
| the `test` targets in `frontend/angular.json`: coverage include, exclude and `coverageThresholds` | unit-test gates | `mibolt-verification` | full | — |
| the build and serve targets in `frontend/angular.json`: budgets, `fileReplacements`, proxies; `frontend/.postcssrc.json` | build configuration; the PostCSS file registers the `@tailwindcss/postcss` plugin | `mibolt-workspace-ops` | full | — |
| `frontend/package.json`, `frontend/package-lock.json` | the manifest, its npm scripts, the declared and resolved dependency versions | `mibolt-workspace-ops`, as files | full; lockfile sampled | whether `packageManager` `npm@11.17.0` is enforced against a local npm 11.19.1 |
| `frontend/tsconfig.json`, `frontend/tsconfig.e2e.json`, the per-project tsconfigs, `frontend/eslint.config.mjs`, `frontend/.prettierrc`, `frontend/.prettierignore` | static rules | `mibolt-frontend-code-standards` | root files full | the per-project tsconfigs |
| `frontend/mise.toml` | area tasks | `mibolt-workspace-ops` | full | — |
| `frontend/ng-openapi-gen.json`, `frontend/ng-openapi-gen.admin.json`, `frontend/vitest.contract.config.ts`, `frontend/tests/contract/` | client generation and the contract suite | `mibolt-cross-package-changes` | full / partial | the bodies of `frontend/tests/contract/sdk-transport.spec.ts`, `frontend/tests/contract/shop-bad-request.spec.ts` and `frontend/tests/contract/response-validation.ts` |
| `frontend/tests/setup-msw.ts`, `frontend/tests/msw-server.ts`, `frontend/tests/network-isolation.spec.ts` | the Node MSW harness | `mibolt-shop-frontend` | full | — |
| `frontend/tests/web-image/`, `frontend/tests/scripts/`, `frontend/Dockerfile`, `frontend/.dockerignore`, `frontend/nginx/`, `frontend/proxy.conf.json`, `frontend/proxy.local-backend.conf.json`, `frontend/proxy.payment.conf.json` | image and serving | `mibolt-workspace-ops` | mostly full | `frontend/nginx/security-headers.conf`, `frontend/nginx/robots.txt` |
| `frontend/scripts/build-check.mjs` with `frontend/scripts/fixtures/`, `frontend/scripts/check-app-boot.mjs`, `frontend/scripts/check-dist-free-of.mjs`, `frontend/scripts/check-budgets.mjs`, `frontend/scripts/coverage-summary.mjs` | build checks | `mibolt-verification` | headers | the full bodies; no npm script, mise task or workflow runs `frontend/scripts/check-budgets.mjs`; no npm script, mise task or workflow feeds the two sample build logs in `frontend/scripts/fixtures/` to the build check's `--input` option (`frontend/scripts/build-check.mjs:21-25`); `mibolt-verification` documents running it on them by hand |
| `frontend/scripts/build-catalog-fixture.mjs` and its output `frontend/docs/api/fixtures/catalog.json` | catalogue fixture generator | `mibolt-cross-package-changes` | header | — |
| `frontend/scripts/serve-static.mjs`, `frontend/scripts/proxy-timeout.mjs` | static serving | `mibolt-workspace-ops` | header | — |
| `frontend/playwright.config.ts`, `frontend/e2e/`, `frontend/specs/` | end-to-end suite, conventions file and test plans | none for the specs, the plans and the suite's own settings in `frontend/playwright.config.ts`, its projects and web servers among them, which are outside the MiBolt skills; `mibolt-frontend-code-standards` for the lint rules that reach `frontend/e2e/` and `frontend/playwright.config.ts`, and for `frontend/e2e/seed.spec.ts` and `frontend/e2e/fixtures/` as code; `mibolt-verification` for the end-to-end coverage floor in `frontend/e2e/coverage-thresholds.json` | fixtures full | the spec bodies |

## Storefront

| Area | Responsibility | Owner | Depth | Unknowns |
|---|---|---|---|---|
| `frontend/projects/storefront/src/main.ts`, `frontend/projects/storefront/src/core/bootstrap-demo.ts`, `frontend/projects/storefront/src/app/app.config.ts`, `frontend/projects/storefront/src/app/app.routes.ts`, `frontend/projects/storefront/src/app/core/demo-access/`, and the `catalog`, `cart`, `checkout` and `product` folders of `frontend/projects/storefront/src/app/features/` | bootstrap, routing, the demo-access gate, pages, facades, guards | `mibolt-shop-frontend` | full for facades and routes; sub-components sampled | `frontend/projects/storefront/src/app/features/cart/cart-mutation-queue.ts` beyond line 60, `frontend/projects/storefront/src/app/features/product/variant-selection.ts`, `frontend/projects/storefront/src/app/features/checkout/checkout-form.model.ts`, `frontend/projects/storefront/src/app/features/checkout/order-submission.ts`, `frontend/projects/storefront/src/app/features/checkout/review-page.ts`, the delivery and payment step files |
| the `home`, `not-found`, `demo-sign-in` and `primitives-showcase` folders of `frontend/projects/storefront/src/app/features/` | utility pages | `mibolt-shop-frontend` | names only | their contents |
| `frontend/projects/storefront/src/app/core/navigation/`, `frontend/projects/storefront/src/app/layouts/`, `frontend/projects/storefront/src/app/shared/`, `frontend/projects/storefront/src/styles/` | chrome, UI primitives, helpers, design tokens (values from `frontend/docs/design/yettel.md`) | `mibolt-shop-frontend` | sampled | 11 of the 12 primitive folders under `frontend/projects/storefront/src/app/shared/ui/`, `frontend/projects/storefront/src/styles/primitives.css`, any consumer of `cartStorageKey` and `ordersStorageKey` from `frontend/projects/storefront/src/environments/` |
| the storefront `test` target in `frontend/angular.json`, `frontend/projects/storefront/vitest.config.ts` | test and coverage settings | `mibolt-verification` | full | — |
| `frontend/projects/storefront/public/`, except `media/`, which has its own row under the catalogue data | the storefront's static files: the fonts, the favicon, the placeholder and four product illustrations under `frontend/projects/storefront/public/assets/`, and `mockServiceWorker.js`, which the development builds of all three apps serve (`frontend/angular.json:72-77`, `frontend/angular.json:184-189`, `frontend/angular.json:309-312`) | `mibolt-shop-frontend` | names only | — |

## Shop libraries, demo payment and core-api

| Area | Responsibility | Owner | Depth | Unknowns |
|---|---|---|---|---|
| `frontend/projects/shop-api/` | the generated shop SDK, reached as `@mi-bolt/api/*` | `mibolt-cross-package-changes` | sampled | — (generated; never edited by hand) |
| `frontend/projects/shop-mocks/` | the shop MSW mock backend, reached as `@mi-bolt/mocks/*` | `mibolt-shop-frontend` | 3 files full | the cart, checkout, orders, payment and demo handler internals |
| `frontend/projects/demo-payment/` | the demo payment page | `mibolt-shop-frontend` | every `.ts` source full | the template, stylesheet and spec beside `frontend/projects/demo-payment/src/app/payment-page.ts` |
| `frontend/projects/core-api/` | API root, demo-session interceptor and splash shared by the apps, reached as `@mi-bolt/core-api/*` | `mibolt-cross-package-changes` | full | — |

## Admin

| Area | Responsibility | Owner | Depth | Unknowns |
|---|---|---|---|---|
| `frontend/projects/admin/src/app/` (shell, auth, interceptors, icons, locale, features, form helpers, image upload), `frontend/projects/admin/src/environments/`, `frontend/projects/admin/src/material-theme.scss` | the admin app | `mibolt-admin-frontend` | mostly full | the dialogs, the list sub-components, the six edit sections, `frontend/projects/admin/src/app/shared/image-upload/image-upload.ts`, `frontend/projects/admin/src/app/shared/image-upload/upload-tracker.ts` |
| `frontend/projects/admin/src/mocks/`, `frontend/projects/admin/src/testing/` | the admin's own MSW mock backend and its spec harness | `mibolt-admin-frontend` | sampled | the handlers, `frontend/projects/admin/src/mocks/db.ts`, the contents of `frontend/projects/admin/src/testing/` |
| `frontend/projects/admin/src/app/api/generated/` | the generated admin client (`AdminApi`) | `mibolt-cross-package-changes` | config only | — |

## Frontend documents and design

| Area | Responsibility | Owner | Depth | Unknowns |
|---|---|---|---|---|
| `frontend/docs/design/yettel.md`, `frontend/docs/design/yettel/` | design authority for every rendered surface | `mibolt-shop-frontend` ("Design authority") | existence | whether it binds the admin and demo-payment apps in practice: it is the reference for every rendered surface, yet the document never mentions the admin app, which uses Angular Material's azure-blue theme (`frontend/projects/admin/src/material-theme.scss:13`) |
| `frontend/README.md`, `frontend/docs/README.md`, `frontend/docs/spec/`, `frontend/projects/admin/README.md`, `frontend/docs/design/README.md`, `frontend/docs/design/asset-manifest.json`, `frontend/docs/design/assets/` | frontend documents; the demo device illustrations the design README describes, with their manifest | this skill's docs index | partial | currency, recorded per document in the docs index |
| `frontend/docs/api/README.md` | SDK and fixture documentation | `mibolt-cross-package-changes` | full | — |
| `frontend/docs/lint-relaxations.md` | lint relaxation history | `mibolt-frontend-code-standards` | full | — |

## Contract, generation and catalogue data

| Area | Responsibility | Owner | Depth | Unknowns |
|---|---|---|---|---|
| `contracts/commerce/openapi.yaml`, `contracts/commerce/kommunikacio.md`, `contracts/commerce/samples/`, `contracts/commerce/sequences/`, `contracts/check-samples.sh`, `contracts/mise.toml` | the one API contract, its protocol document and its checks | `mibolt-cross-package-changes` | structure full | — |
| `backend/services/commerce/build.gradle:39-139` | backend code generation from the contract | `mibolt-cross-package-changes` | full | — |
| `data/catalog/` | catalogue data, schema and images | `mibolt-cross-package-changes` | structure full | — |
| `frontend/projects/storefront/public/media/` | a byte-identical tracked copy of `data/catalog/images/` that nothing in the repository regenerates, which the shop mocks fetch (`frontend/projects/shop-mocks/src/catalog/catalog.handlers.ts:355`) and the admin development build serves (`frontend/angular.json:314-315`) | `mibolt-cross-package-changes` | names only | — |
| `tools/catalog-import/` | the yettel.hu catalogue scraper | `mibolt-cross-package-changes` | header | the body of `tools/catalog-import/src/import.ts` |

## Backend

| Area | Responsibility | Owner | Depth | Unknowns |
|---|---|---|---|---|
| `backend/config/pmd/ruleset.xml`, `backend/services/commerce/build.gradle:220-245` | PMD rules and their wiring | `mibolt-backend-code-standards` | full | — (the rules in force are PMD 7.24.0's `rulesets/java/quickstart.xml` with the changes `backend/config/pmd/ruleset.xml` makes: `UseUtilityClass` excluded, `MethodNamingConventions` re-added with its own test-name pattern, five rules added. `mibolt-backend-code-standards` names where the full quickstart list is read; a PMD report lists violations, not the rules in force) |
| `backend/docs/02-backend.md` §2 code-generation rules, §3 layering, §7.0 test rule, §9 forbidden list | written backend code rules | `mibolt-backend-code-standards` | full | — |
| Java conventions across `backend/services/commerce/src/`: naming, logging, nulls, formatting, `Clock`, money | observed code patterns | `mibolt-backend-code-standards` | measured by grep | whether the tab-versus-space conflict with `.editorconfig` is intended |
| `backend/README.md`, `backend/docs/02-backend.md` §4 invariants and §8 decisions, `backend/docs/04-adatbazis.md`, `backend/docs/decisions/`, the service under `backend/services/commerce/src/main/`, the test harness under `backend/services/commerce/src/test/`, `backend/services/commerce/scripts/smoke.sh` | service behaviour: domains, security, errors, data and migrations, configuration | `mibolt-commerce-backend` | mostly full; 16 of 22 decisions by title only; 1 of 11 changesets in full; the admin package code not read | CORS configuration, `WebMvcConfig`, the run order of `DemoAccessBootstrap`, JUnit 5.11.4 versus 6.0.3 on the test classpath, `variantSlug` uniqueness in the migrations, the admin package internals, the test counts recorded in decision 0011 |
| `backend/services/commerce/build.gradle:141-218` | unit, integration and JaCoCo gates | `mibolt-verification` | full | — |
| `backend/mise.toml`, `backend/services/commerce/Dockerfile`, `backend/services/commerce/Dockerfile.dockerignore`, `backend/gradlew`, `backend/gradlew.bat`, `backend/gradle/wrapper/`, `backend/services/commerce/gradle/wrapper/gradle-wrapper.properties`, `backend/.gitattributes`, `backend/.gitignore`, `backend/docs/06-uzembe-helyezes.md` | area tasks, image, the Gradle wrapper, manual server deployment; `backend/services/commerce/gradle/wrapper/gradle-wrapper.properties` is a tracked symlink to `backend/gradle/wrapper/gradle-wrapper.properties`, added in commit `30985558` | `mibolt-workspace-ops` | full, except the deployment document | `backend/docs/06-uzembe-helyezes.md` not read in full |
| `backend/settings.gradle`, `backend/services/commerce/build.gradle:1-37` | the one Gradle subproject, the plugin versions, the Java toolchain, the declared dependencies | `mibolt-commerce-backend`, as files | full | the resolved dependency graph, which has no lockfile |

## Deploy, CI and tools

| Area | Responsibility | Owner | Depth | Unknowns |
|---|---|---|---|---|
| `deploy/compose.yaml`, `deploy/compose.sh`, `deploy/stack.sh`, `deploy/.env.example`, `deploy/helm/mi-bolt/`, `deploy/candidate/`, `deploy/tests/` | the container stack, the per-worktree stack, the Helm chart, candidate build and release | `mibolt-workspace-ops` | documents and compose full | the Helm templates, `deploy/helm/mi-bolt/values.schema.json`, the Python bodies under `deploy/candidate/` and `deploy/tests/`, `deploy/stack.sh` beyond its header |
| `.github/components.yml`, `.github/workflows/` | CI pipeline and path filters | `mibolt-workspace-ops` for the content; `mibolt-verification` maps jobs to local commands | 7 of 11 workflow files full | `.github/workflows/smoke.yml` beyond its first job; `.github/workflows/preview-smoke.yml`, `.github/workflows/close-bolt-preview.yml` and `.github/workflows/stable-smoke.yml` read for their triggers only |
| `tools/dev-server/`, `tools/mise.toml`, `tools/package.json`, `tools/package-lock.json`, `tools/tsconfig.json` | the dev-server helper and its test, and the tools workspace, which installs the dependencies of that test and of the catalogue importer, typechecks both and runs that test; the importer has no tests | `mibolt-workspace-ops`, the manifest, lockfile and tsconfig as files | full / partial | — |

## Excluded areas

No row: a tracked path that only serves how the work is done, such as the IDE
settings under `.idea/`, stays out of this register, as "How to read a row"
says for a path that matches no row.
