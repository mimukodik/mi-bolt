# Coverage register

Every tracked area of the repository, what it is responsible for, which skill
owns it or why none does, how deeply it was mapped, and what is still unknown.
Paths are relative to the repository root.

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
- [Harness and excluded areas](#harness-and-excluded-areas)

## How to read a row

- **Owner** is the one skill that carries the area's how-to, or the reason
  nothing does. Load that skill for work in the area; this register only says
  which one it is.
- **Depth** records what was read when the set was mapped on 2026-09-26 at
  commit `7099e689`: *full* (every file named was read), *mostly full*,
  *sampled* (representative files read), *headers* (header comments only),
  *config only*, *names only* or *existence*.
- **Unknowns** were not read, or are questions the reading did not settle.
  Open the file before claiming anything about it, and do not describe a
  *sampled* or *headers* area as fully understood.
- **A path that matches no row** falls under the closest parent directory that
  has one. If none has, the area is uncovered: say so in the report, and treat
  it as a reason to update this register.

## Workspace root

| Area | Responsibility | Owner | Depth | Unknowns |
|---|---|---|---|---|
| `mise.toml`, `.gitignore`, `.gitattributes` | root task graph, tool pins, ignore and line-ending rules | `mibolt-workspace-ops` | full | — |
| `README.md`, `docs/monorepo.md` | install and run-mode guide, ports, command and CI-filter tables | `mibolt-workspace-ops` for the tables; this skill's docs index for reading | full | both command tables omit `mise run deploy:check`, which `mise.toml:100-102` defines |
| `.editorconfig` | editor settings | `mibolt-workspace-ops` for the file; the formatting facts sit in `mibolt-frontend-code-standards` and `mibolt-backend-code-standards` | full | — |
| `CLAUDE.md` | Angular and TypeScript conventions, the accessibility override | existing instruction file, loaded at launch; `mibolt-frontend-code-standards` points at it | full | — |

## Frontend workspace configuration

| Area | Responsibility | Owner | Depth | Unknowns |
|---|---|---|---|---|
| the `test` targets in `frontend/angular.json`: coverage include, exclude and `coverageThresholds` | unit-test gates | `mibolt-verification` | full | — |
| the build and serve targets in `frontend/angular.json`: budgets, `fileReplacements`, proxies; `frontend/.postcssrc.json` | build configuration | `mibolt-workspace-ops` | full for `frontend/angular.json` | `frontend/.postcssrc.json` not read |
| `frontend/package.json`, `frontend/package-lock.json` | manifests and npm scripts | `mibolt-workspace-ops` | full; lockfile sampled | whether `packageManager` `npm@11.17.0` is enforced against a local npm 11.19.1 |
| `frontend/tsconfig.json`, `frontend/tsconfig.e2e.json`, the per-project tsconfigs, `frontend/eslint.config.mjs`, `frontend/.prettierrc`, `frontend/.prettierignore` | static rules | `mibolt-frontend-code-standards` | root files full | the per-project tsconfigs |
| `frontend/mise.toml` | area tasks | `mibolt-workspace-ops` | full | — |
| `frontend/ng-openapi-gen.json`, `frontend/ng-openapi-gen.admin.json`, `frontend/vitest.contract.config.ts`, `frontend/tests/contract/` | client generation and the contract suite | `mibolt-cross-package-changes` | full / partial | the bodies of `frontend/tests/contract/sdk-transport.spec.ts`, `frontend/tests/contract/shop-bad-request.spec.ts` and `frontend/tests/contract/response-validation.ts` |
| `frontend/tests/setup-msw.ts`, `frontend/tests/msw-server.ts`, `frontend/tests/network-isolation.spec.ts` | the Node MSW harness | `mibolt-shop-frontend` | full | — |
| `frontend/tests/web-image/`, `frontend/tests/scripts/`, `frontend/Dockerfile`, `frontend/.dockerignore`, `frontend/nginx/`, `frontend/proxy.conf.json`, `frontend/proxy.local-backend.conf.json`, `frontend/proxy.payment.conf.json` | image and serving | `mibolt-workspace-ops` | mostly full | `frontend/nginx/security-headers.conf`, `frontend/nginx/robots.txt` |
| `frontend/scripts/build-check.mjs` with `frontend/scripts/fixtures/`, `frontend/scripts/check-app-boot.mjs`, `frontend/scripts/check-dist-free-of.mjs`, `frontend/scripts/check-budgets.mjs`, `frontend/scripts/coverage-summary.mjs` | build checks | `mibolt-verification` | headers | the full bodies; no npm script, mise task or workflow runs `frontend/scripts/check-budgets.mjs` |
| `frontend/scripts/build-catalog-fixture.mjs` | catalogue fixture generator | `mibolt-cross-package-changes` | header | — |
| `frontend/scripts/serve-static.mjs`, `frontend/scripts/proxy-timeout.mjs` | static serving | `mibolt-workspace-ops` | header | — |
| `frontend/playwright.config.ts`, `frontend/e2e/`, `frontend/specs/` | end-to-end suite, conventions file and test plans | `playwright-tests` | fixtures full | the spec bodies |

## Storefront

| Area | Responsibility | Owner | Depth | Unknowns |
|---|---|---|---|---|
| `frontend/projects/storefront/src/main.ts`, `frontend/projects/storefront/src/core/bootstrap-demo.ts`, `frontend/projects/storefront/src/app/app.config.ts`, `frontend/projects/storefront/src/app/app.routes.ts`, `frontend/projects/storefront/src/app/core/demo-access/`, and the `catalog`, `cart`, `checkout` and `product` folders of `frontend/projects/storefront/src/app/features/` | bootstrap, routing, the demo-access gate, pages, facades, guards | `mibolt-shop-frontend` | full for facades and routes; sub-components sampled | `frontend/projects/storefront/src/app/features/cart/cart-mutation-queue.ts` beyond line 60, `frontend/projects/storefront/src/app/features/product/variant-selection.ts`, `frontend/projects/storefront/src/app/features/checkout/checkout-form.model.ts`, `frontend/projects/storefront/src/app/features/checkout/order-submission.ts`, `frontend/projects/storefront/src/app/features/checkout/review-page.ts`, the delivery and payment step files |
| the `home`, `not-found`, `demo-sign-in` and `primitives-showcase` folders of `frontend/projects/storefront/src/app/features/` | utility pages | `mibolt-shop-frontend` | names only | their contents |
| `frontend/projects/storefront/src/app/core/navigation/`, `frontend/projects/storefront/src/app/layouts/`, `frontend/projects/storefront/src/app/shared/`, `frontend/projects/storefront/src/styles/` | chrome, UI primitives, helpers, design tokens (values from `frontend/docs/design/yettel.md`) | `mibolt-shop-frontend` | sampled | 11 of the 12 primitive folders under `frontend/projects/storefront/src/app/shared/ui/`, `frontend/projects/storefront/src/styles/primitives.css`, any consumer of `cartStorageKey` and `ordersStorageKey` from `frontend/projects/storefront/src/environments/` |
| the storefront `test` target in `frontend/angular.json`, `frontend/projects/storefront/vitest.config.ts` | test and coverage settings | `mibolt-verification` | full | — |

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
| `frontend/docs/design/yettel.md`, `frontend/docs/design/yettel/` | design authority for rendered surfaces | existing rule (`.claude/CLAUDE.md`, "Design authority"); `mibolt-shop-frontend` consumes it | existence | whether it binds the admin and demo-payment apps: `.claude/CLAUDE.md` names it the reference for every rendered surface, while the document never mentions the admin app, which uses Angular Material's azure-blue theme |
| `frontend/README.md`, `frontend/docs/README.md`, `frontend/docs/spec/`, `frontend/projects/admin/README.md` | frontend documents | this skill's docs index | partial | currency, recorded per document in the docs index |
| `frontend/docs/api/README.md` | SDK and fixture documentation | `mibolt-cross-package-changes` | full | — |
| `frontend/docs/lint-relaxations.md` | lint relaxation history | `mibolt-frontend-code-standards` | full | — |
| `frontend/docs/briefs/` | archived runner briefs | excluded: "a reference, not a rule" (`frontend/docs/briefs/README.md:8`) | — | — |

## Contract, generation and catalogue data

| Area | Responsibility | Owner | Depth | Unknowns |
|---|---|---|---|---|
| `contracts/commerce/openapi.yaml`, `contracts/commerce/kommunikacio.md`, `contracts/commerce/samples/`, `contracts/commerce/sequences/`, `contracts/check-samples.sh`, `contracts/mise.toml` | the one API contract, its protocol document and its checks | `mibolt-cross-package-changes` | structure full | — |
| `backend/services/commerce/build.gradle:39-139` | backend code generation from the contract | `mibolt-cross-package-changes` | full | — |
| `data/catalog/` | catalogue data, schema and images | `mibolt-cross-package-changes` | structure full | — |
| `tools/catalog-import/` | the yettel.hu catalogue scraper | `mibolt-cross-package-changes` | header | the body of `tools/catalog-import/src/import.ts` |

## Backend

| Area | Responsibility | Owner | Depth | Unknowns |
|---|---|---|---|---|
| `backend/config/pmd/ruleset.xml`, `backend/services/commerce/build.gradle:220-245` | PMD rules and their wiring | `mibolt-backend-code-standards` | full | the full quickstart rule list: read it from the PMD report |
| `backend/docs/02-backend.md` §2 code-generation rules, §3 layering, §7.0 test rule, §9 forbidden list | written backend code rules | `mibolt-backend-code-standards` | full | — |
| Java conventions across `backend/services/commerce/src/`: naming, logging, nulls, formatting, `Clock`, money | observed code patterns | `mibolt-backend-code-standards` | measured by grep | whether the tab-versus-space conflict with `.editorconfig` is intended |
| `backend/docs/02-backend.md` §4 invariants and §8 decisions, `backend/docs/04-adatbazis.md`, `backend/docs/decisions/`, the service under `backend/services/commerce/src/main/`, the test harness under `backend/services/commerce/src/test/`, `backend/services/commerce/scripts/smoke.sh` | service behaviour: domains, security, errors, data and migrations, configuration | `mibolt-commerce-backend` | mostly full; 16 of 22 decisions by title only; 1 of 11 changesets in full; the admin package code not read | CORS configuration, `WebMvcConfig`, the run order of `DemoAccessBootstrap`, JUnit 5.11.4 versus 6.0.3 on the test classpath, `variantSlug` uniqueness in the migrations, the admin package internals, the test counts recorded in decision 0011 |
| `backend/services/commerce/build.gradle:141-218` | unit, integration and JaCoCo gates | `mibolt-verification` | full | — |
| `backend/mise.toml`, `backend/services/commerce/Dockerfile`, `backend/settings.gradle`, `backend/gradle/wrapper/`, the plugin and dependency blocks at `backend/services/commerce/build.gradle:1-37`, `backend/docs/06-uzembe-helyezes.md` | area tasks, image, Gradle wiring, dependency declarations, manual server deployment | `mibolt-workspace-ops` | full, except the deployment document | the resolved dependency graph (there is no lockfile); `backend/docs/06-uzembe-helyezes.md` not read in full |

## Deploy, CI and tools

| Area | Responsibility | Owner | Depth | Unknowns |
|---|---|---|---|---|
| `deploy/compose.yaml`, `deploy/compose.sh`, `deploy/stack.sh`, `deploy/.env.example`, `deploy/helm/mi-bolt/`, `deploy/candidate/`, `deploy/tests/` | the container stack, the per-worktree stack, the Helm chart, candidate build and release | `mibolt-workspace-ops` | documents and compose full | the Helm templates, `deploy/helm/mi-bolt/values.schema.json`, the Python bodies under `deploy/candidate/` and `deploy/tests/`, `deploy/stack.sh` beyond its header |
| `.github/components.yml`, `.github/workflows/` | CI pipeline and path filters | `mibolt-workspace-ops` for the content; `mibolt-verification` maps jobs to local commands | 7 of 11 workflow files full | `.github/workflows/smoke.yml` beyond its first job; `.github/workflows/preview-smoke.yml`, `.github/workflows/close-bolt-preview.yml` and `.github/workflows/stable-smoke.yml` read for their triggers only |
| `tools/mise.toml`, `tools/package.json`, `tools/dev-server/`, `tools/install-spring-tools-mcp.sh` | the tools workspace wiring and dev tooling | `mibolt-workspace-ops` | full / partial | — |
| `tools/agent-memory/`, `tools/agent-memory.ts` | the shared-memory CLI | excluded: `.claude/CLAUDE.md` ("Shared memory") owns it | sampled | — |

## Harness and excluded areas

| Area | Responsibility | Owner | Depth | Unknowns |
|---|---|---|---|---|
| `.claude/CLAUDE.md`, `.claude/rules/` | the agents' operating rules | excluded: rules, not the product; loaded at launch, pointed at and never copied | full | — |
| `.claude/agents/`, `.claude/hooks/`, `.claude/shared-memory/`, `.claude/retrospectives/`, the skills under `.claude/skills/` that are not MiBolt's | the agent harness | excluded: not the product | names only | — |
| `.claude/skills/playwright-tests/` | the end-to-end workflow skill | existing skill, a routing target | partial | — |
| `.mcp.json` | the MCP server registry | excluded | names only | — |
| `.idea/` | IDE settings | excluded | — | — |
| the `mibolt-*` skills under `.claude/skills/` | whether their citations still resolve | this skill, through `.claude/skills/mibolt-project-map/scripts/check-skill-references.mjs` | — | whether an anchored line still says what a skill claims, which a reader judges |
