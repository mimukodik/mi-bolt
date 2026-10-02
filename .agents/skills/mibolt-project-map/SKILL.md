---
name: mibolt-project-map
description: "MiBolt monorepo orientation: what an app, library or directory is for and what consumes it, where a cross-area value is set, which MiBolt skill a file, route or task belongs to. Load it before answering a question that spans areas, names none, or comes from a newcomer. Not for changing code, or finding it inside a named app."
---

# MiBolt project map

A path that starts with scripts/, references/, assets/ or agents/, or is
`SKILL.md`, is relative to this skill's directory; one that starts with a
MiBolt skill name is relative to the directory that holds the MiBolt skills;
every other path is relative to the repository root. Every command runs from
the repository root, except the citation check, whose section says where it
runs.

## Scope and hand-offs

**Inside:** where each part of the repository lives and what it is for, which
skill owns it, how the parts connect, which document to trust for an area, and
whether the MiBolt skills' citations still resolve.

**Outside, and where it goes:**

- Making a change, in any area: the skill the routing table below names. Load
  that skill directly; no MiBolt skill needs this map loaded before it.
- End-to-end specs under `frontend/e2e/` and the plans under `frontend/specs/`:
  outside the MiBolt skills.
- Generic Angular guidance: outside the MiBolt skills. They record what this
  repository enforces and does; how Angular and the rest of the frontend
  toolchain behave is read from their documentation, as
  `mibolt-frontend-code-standards` ("Framework questions") says.

## Areas, stack and connections

**Layout.** Each area splits further; the coverage register has a row for
every tracked sub-area of the project.

| Path | What it holds | Owner |
|---|---|---|
| `frontend/projects/storefront/` | the shop: catalogue, product page, cart, five-step checkout, demo-access gate | `mibolt-shop-frontend` |
| `frontend/projects/demo-payment/` | the simulated card-payment page the checkout hands off to | `mibolt-shop-frontend` |
| `frontend/projects/shop-mocks/` | the in-page MSW mock backend of the storefront and the payment app | `mibolt-shop-frontend` |
| `frontend/projects/admin/` | the back office, with its own generated client and its own MSW mocks | `mibolt-admin-frontend` |
| `frontend/projects/shop-api/`, `frontend/projects/core-api/` | the generated shop SDK; the API-root, demo-session and splash helpers the apps share | `mibolt-cross-package-changes` |
| `frontend/tests/` | the Node contract suite, the MSW harness, the image checks | split three ways; see the coverage register |
| `frontend/e2e/`, `frontend/specs/` | the Playwright suite and its plans | the specs and plans are outside the MiBolt skills; see the coverage register |
| `backend/services/commerce/` | the one Spring Boot service; its requirements live in `backend/docs/` | `mibolt-commerce-backend` |
| `contracts/commerce/` | the OpenAPI contract, samples, sequence diagrams, `contracts/commerce/kommunikacio.md` | `mibolt-cross-package-changes` |
| `data/catalog/` | the tracked catalogue: JSON, schema, images | `mibolt-cross-package-changes` |
| `mise.toml`, `deploy/`, `.github/` | root tasks, compose stack, Helm chart, candidate release, CI | `mibolt-workspace-ops` |
| `tools/` | the catalogue importer, the dev-server helper | per sub-directory; see the coverage register |

**Stack.** Declared versions come from the manifests cited. The lockfile
column is `frontend/package-lock.json`; the backend has no lockfile, and what
`backend/services/commerce/build.gradle` leaves unpinned resolves through
Spring Boot's dependency management. The local column is what one machine had
on 2026-09-26: re-measure it before relying on it.

| Part | Declared | Lockfile | Local |
|---|---|---|---|
| Node | 26.10.0 (`mise.toml`, "[tools]"); engines `^22.22.3 \|\| ^24.15.0 \|\| ^26.0.0` (`frontend/package.json`, "engines") | — | 26.10.0 |
| npm | `npm@11.17.0` (`frontend/package.json`, "packageManager") | — | 11.19.1 |
| Java | `temurin-21.0.12+101.0.LTS` (`mise.toml`, "[tools]"); toolchain 21 (`backend/services/commerce/build.gradle`, "languageVersion") | — | Temurin 21.0.12.1 |
| Angular core | `^22.1.0` (`frontend/package.json`, "@angular/core") | 22.1.6 | 22.1.6 |
| Angular CLI and build | `^22.1.8` (`frontend/package.json`, "@angular/build"; `frontend/package.json`, "@angular/cli") | 22.1.8 | 22.1.8 |
| TypeScript | `~6.0.2` (`frontend/package.json`, "typescript") | 6.0.3 | 6.0.3 |
| Vitest | `^4.0.8` (`frontend/package.json`, "vitest") | 4.1.11 | 4.1.11 |
| MSW | `^2.15.0` (`frontend/package.json`, "msw") | 2.15.0 | 2.15.0 |
| Playwright | `1.63.0` (`frontend/package.json`, "@playwright/test") | 1.63.0 | 1.63.0 |
| ESLint | `^10.9.1` (`frontend/package.json`, "eslint") | 10.10.0 | 10.10.0 |
| ng-openapi-gen | `^1.0.5` (`frontend/package.json`, "ng-openapi-gen") | 1.0.5 | 1.0.5 |
| Spring Boot | 4.1.1 (`backend/services/commerce/build.gradle`, "id 'org.springframework.boot'") | — | — |
| OpenAPI Generator (backend) | 7.25.0 (`backend/services/commerce/build.gradle`, "id 'org.openapi.generator'") | — | — |
| PMD | 7.24.0 (`backend/services/commerce/build.gradle`, "toolVersion") | — | — |
| Gradle wrapper | 9.7.1 (`backend/gradle/wrapper/gradle-wrapper.properties`, "distributionUrl") | — | — |
| PostgreSQL | `postgres:16.15-alpine3.24`, digest-pinned (`deploy/compose.yaml`, "image: postgres") | — | — |
| uv, for the contract tools | 0.12.17 (`contracts/mise.toml`, "[tools]") | — | 0.12.17 for the tasks in `contracts/`, which run with that directory's pin; 0.8.15 at the repository root, where `mise.toml` ("[tools]") pins no uv |

**How the parts connect.**

- **One contract, three generated clients.** `contracts/commerce/openapi.yaml`
  generates the shop SDK into `frontend/projects/shop-api/src/generated/`
  (`frontend/ng-openapi-gen.json`, which excludes the four admin tags), the
  admin client into `frontend/projects/admin/src/app/api/generated/`
  (`frontend/ng-openapi-gen.admin.json`, which includes only those tags), and
  the backend's Spring interfaces into the service's gitignored `build/`
  directory (`backend/services/commerce/build.gradle`, "openApiGenerate").
  `mise run api:generate` regenerates all three.
- **Three path aliases** (`frontend/tsconfig.json`, "paths"): `@mi-bolt/api/*` is
  the shop SDK, `@mi-bolt/core-api/*` is `frontend/projects/core-api/src/`,
  and `@mi-bolt/mocks/*` is `frontend/projects/shop-mocks/src/`, which the
  storefront and the demo-payment app start in the browser
  (`frontend/projects/storefront/src/core/bootstrap-demo.ts`, "@mi-bolt/mocks/browser",
  `frontend/projects/demo-payment/src/main.ts`, "@mi-bolt/mocks/browser"), which the storefront's
  unit specs import, and whose handlers the Node contract suite imports by
  relative path
  (`frontend/tests/contract/operation-matrix.spec.ts`, "Side-effect imports"). The admin app
  uses its own client and mocks instead, the client in
  `frontend/projects/admin/src/app/api/generated/`
  (`frontend/projects/admin/src/app/app.config.ts`, "provideApiConfiguration") and the mocks in
  `frontend/projects/admin/src/mocks/`, which it starts in the browser
  (`frontend/projects/admin/src/main.ts`, "startAdminMocks"); the lint rule that keeps it off
  the shop SDK and mocks is `mibolt-frontend-code-standards`'s.
- **The catalogue feeds these places:** the backend's startup seeding, which
  loads only into an empty product table
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogLoader.java`, "productRepository.count()"),
  so a changed catalogue needs the database emptied first;
  `frontend/scripts/build-catalog-fixture.mjs`, which writes
  `frontend/docs/api/fixtures/catalog.json` for the shop mocks
  (`frontend/projects/shop-mocks/src/browser.ts`, "catalogFixture"); the contract suite,
  which checks that fixture's product count against it
  (`frontend/tests/contract/schema.spec.ts`, "CATALOG_SOURCE_PATH"); the admin mock seed
  (`frontend/projects/admin/src/mocks/seed.ts`, "catalogSource"); both image builds
  (`deploy/compose.yaml`, "catalog: ../data/catalog"); the candidate
  template fingerprint (`deploy/candidate/README.md`, "templateFingerprint"); and
  `frontend/projects/storefront/public/media/`, a byte-identical tracked copy
  of `data/catalog/images/` that nothing in the repository regenerates, which
  the shop mocks fetch
  (`frontend/projects/shop-mocks/src/catalog/catalog.handlers.ts`, "defaultMediaLoader") and the
  admin development build also serves (`frontend/angular.json`, "media/**").
- **Ports** (`README.md`, "Ports"): 4200 storefront, 4210 demo payment, 4220
  admin, 8080 backend under `/api/v1`, 55433 PostgreSQL, 4400 and 4410 the
  Playwright web servers. The dev servers run the apps on in-page MSW;
  `mise run dev` puts them on the real backend; `mise run stack` serves all
  three from one web container on 4200, at `/`, `/admin/` and `/demo-fizetes/`.
  Run modes and environment variables are `mibolt-workspace-ops`'s.
- **Routes are Hungarian.** Storefront
  (`frontend/projects/storefront/src/app/app.routes.ts`): `/telefonok` is the
  catalogue, `/telefonok/:slug` a product, `/kosar` redirects to
  `/penztar/kosar`, `/belepes` is the demo sign-in; the checkout steps under
  `/penztar` are `kosar`, `adatok`, `szallitas`, `ellenorzes` and
  `siker/:orderId`
  (`frontend/projects/storefront/src/app/features/checkout/checkout.routes.ts`).
  Demo payment: `/demo-fizetes/:paymentIntentId`. Admin, under `/admin/`
  (`frontend/projects/admin/src/app/app.routes.ts`): `/bejelentkezes`,
  `/attekintes`, `/termekek`, `/adminok`.

## Route a task to a skill

| The task is about | Load |
|---|---|
| a storefront page, a catalogue filter, a product-page field, the cart, a checkout step, the demo-access gate, the demo payment page, shop mock data or fault scenarios, storefront styling and yettel tokens | `mibolt-shop-frontend` |
| an admin screen, the product form, the product list filters, admin users, media upload, the admin session, the admin's own mocks | `mibolt-admin-frontend` |
| an ESLint, Prettier or typecheck error under `frontend/`, whether a cast is allowed, `strict-boolean-expressions`, TypeScript naming or type guards | `mibolt-frontend-code-standards` |
| a PMD finding, or Java style, layering, logging or null handling under `backend/` | `mibolt-backend-code-standards` |
| an endpoint's implementation, a business rule, fee or threshold, an error code in the service, a Liquibase migration, the startup catalogue loader, backend configuration | `mibolt-commerce-backend` |
| `contracts/commerce/openapi.yaml`, a new or changed endpoint, field, enum or error code, `mise run api:generate`, a red `mise run api:drift`, `frontend/projects/core-api/`, the contract tests, `data/catalog/` | `mibolt-cross-package-changes` |
| which checks a change needs, a red CI job other than an end-to-end one, the coverage floors, a focused test run, whether a browser pass is required | `mibolt-verification` |
| a mise task, run mode, port or environment variable, compose, a Dockerfile, nginx, a workflow or path filter, the Helm chart, `tools/dev-server/`, a second stack beside the first | `mibolt-workspace-ops` |

A task that spans areas takes the skills in the order its change flows:

- **A new endpoint, or a field, enum or error code across the stack:**
  `mibolt-cross-package-changes` for the contract and the regeneration, then
  `mibolt-commerce-backend` for the implementation, then
  `mibolt-shop-frontend` or `mibolt-admin-frontend` for whichever consumer the
  change touches.
- **Area work that hits a lint, PMD or type error, or a pattern question:**
  the area skill, then the standards skill of that stack.
- **Any change, before it is called done:** `mibolt-verification`.

## Locate, pick the skill, verify

1. Place the path or phrase in the layout table or the routing table. When
   neither places it, read the coverage register.
2. Confirm the location in the repository before relying on this map:
   `git ls-files <dir>` for what exists, `git grep -n <identifier>` for who uses
   a symbol. Run every spelling the repository uses before concluding a name
   has no hits: hyphens in file names, prose, CSS and `data-testid` values,
   camelCase or PascalCase in symbols. Under `frontend/`, `add-to-cart` and
   `AddToCart` find different files.
3. Load only the skills the task matches, in the order above.

**Example: the free-shipping threshold shown at checkout.** The value is
backend configuration, `mibolt.checkout.free-shipping-threshold-huf` at
`backend/services/commerce/src/main/resources/application.properties`
("mibolt.checkout.free-shipping-threshold-huf"),
applied at
`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/checkout/CheckoutService.java`
("buildOptions")
to the delivery fees `GET /checkout/options` returns
(`contracts/commerce/openapi.yaml`, "getCheckoutOptions"): that is `mibolt-commerce-backend`'s.
The response carries each option's resulting fee, never the threshold itself
(`contracts/commerce/openapi.yaml`, "DeliveryOption"). The storefront shows whatever
options come back and never invents a free-shipping default
(`frontend/projects/storefront/src/app/features/checkout/delivery-step.ts`, "T21-AC05"),
while the shop mocks keep their own copy of the value
(`frontend/projects/shop-mocks/src/checkout/checkout-store.ts`, "FREE_SHIPPING_THRESHOLD_HUF"): both are
`mibolt-shop-frontend`'s. Changing the value is `mibolt-commerce-backend`'s
("A fee, threshold or other configuration value"), which names the copies
outside the backend, the shop mocks' among them, and gives the `git grep`
that finds the ones it does not name.
Showing the threshold itself on the checkout page changes the response shape:
`mibolt-cross-package-changes` for the contract and the regenerated clients,
then `mibolt-commerce-backend`, then `mibolt-shop-frontend` for the page and
the mocks.

## Code rules

This skill carries none. Consult `mibolt-frontend-code-standards` when
writing or reviewing TypeScript, templates or styles under `frontend/`, the
Angular conventions included, and `mibolt-backend-code-standards` when writing
or reviewing Java or Gradle code under `backend/`. The rules that hold in every
area are each stated once:

- the name of a script or a script directory: `mibolt-workspace-ops`
  ("Naming");
- a path written into a committed file: `mibolt-workspace-ops` ("No
  machine-specific paths");
- running a Python tool: `mibolt-workspace-ops` ("Python tools");
- removing a component, route, filter or feature:
  `mibolt-frontend-code-standards` ("Removed features");
- tests, coverage and the checks before a commit: `mibolt-verification`.

## What a change can reach

A change to `contracts/commerce/openapi.yaml`, a generated client,
`frontend/projects/core-api/`, the contract tests, `data/catalog/` or its image
copy in `frontend/projects/storefront/public/media/` reaches more than one
consumer. Consult `mibolt-cross-package-changes` when a change
touches any of them, then the skill of each consumer it reaches. The
generated clients are regenerated, never edited by hand.

## Checks

Which checks a change needs, with their commands, prerequisites and side
effects, is `mibolt-verification`'s. A change that reaches a rendered surface
is also verified in a real browser before it is called done,
`mibolt-verification` ("Browser pass"). To list the tasks that exist, run
`mise tasks --all`: it is read-only and prints the root and area tasks.

## References

- [references/coverage-register.md](references/coverage-register.md): every
  tracked area of the project with its responsibility, its owner or the reason
  it has none, how deeply it was mapped, and what is unknown. **Read when** a
  path matches nothing in the layout table, when the routing table does not
  settle who owns something, before calling an area fully understood, or when
  updating any MiBolt skill.
- [references/docs-index.md](references/docs-index.md): the authoritative
  document for each area, its language, and where it no longer matches the
  code. **Read when** the answer is in a document rather than in code, or
  before quoting a document as a description of the current apps.
- [references/citation-check.md](references/citation-check.md): the citation
  checker's options, output, exit codes, and the citation forms it can read.
  **Read when** editing any MiBolt skill, or when the check prints a FAIL or
  UNVERIFIED line.

## Keep this skill current

**Update the matching part when its source changes:**

- a top-level directory, a project in `frontend/angular.json` or a service in
  `backend/settings.gradle`: the layout table and the coverage register;
- a version in `mise.toml`, `frontend/package.json`,
  `frontend/package-lock.json`, `backend/services/commerce/build.gradle`,
  `backend/gradle/wrapper/gradle-wrapper.properties`, `contracts/mise.toml` or
  `deploy/compose.yaml`: the stack table;
- `frontend/tsconfig.json`, either `ng-openapi-gen` configuration, a reader of
  `data/catalog/`, the ports in `README.md` or a route file: "How the parts
  connect";
- a MiBolt skill added, renamed or given a new description: the routing table;
- a document added, moved or rewritten: the docs index;
- `scripts/check-skill-references.mjs`: its header comment and
  `references/citation-check.md`, with both runs quoted there re-measured.

**Run the citation check after editing any MiBolt skill, and after moving or
rewriting a file one cites**, because a cited path, section name or
command goes stale silently when the repository moves. The skills cite one
another by section name, so after editing any of them run the check with no
skill argument, which covers every MiBolt skill. Its check (e) fails a section
citation only once the quoted name occurs nowhere in the target, so a section
renamed while its old name survives elsewhere in the file, or rewritten under
the same name, still passes. After rewriting a file that a MiBolt skill cites
by section name, also reread each section cited from it;
`git grep -n -F '<edited file>' -- ':(glob)**/mibolt-*/**/*.md'` lists every
line of the MiBolt skills that names it by path, and with the skill's
`mibolt-<name>` in place of the file, every line that names that skill.

The check is `scripts/check-skill-references.mjs`. It is read-only, finds the
repository root itself and runs from anywhere inside the checkout. The
command below is written as run from this skill's directory; from anywhere
else, name the script by its path from there.

```bash
node scripts/check-skill-references.mjs [--no-mise] [<skill name> ...]
```

Its options, output format, exit codes, and the citation forms it can read
are in `references/citation-check.md`. A citation in this skill and its
references names its target, a heading, task, function, key or distinctive
phrase, and never gives a line number.
