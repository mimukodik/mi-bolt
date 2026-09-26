---
name: mibolt-project-map
description: "Orientation map of the MiBolt monorepo: the Angular storefront, admin and demo-payment apps and shared libraries under frontend/, the Spring Boot commerce backend, the OpenAPI contract, catalogue data, tools, deploy and CI. Use when it is unclear where something lives or which area owns a screen, route, endpoint or file, when choosing which MiBolt skill fits a task, or when checking that the MiBolt skills still match the repository. Not for making the change itself."
---

# MiBolt project map

Every path here is relative to the repository root, and every command runs
from there.

## Scope and hand-offs

**Inside:** where each part of the repository lives and what it is for, which
skill owns it, how the parts connect, which document to trust for an area, and
whether the MiBolt skills' citations still resolve.

**Outside, and where it goes:**

- Making a change, in any area: the skill the routing table below names. Load
  that skill directly; no MiBolt skill needs this map loaded before it.
- End-to-end specs under `frontend/e2e/` and the plans under `frontend/specs/`:
  `playwright-tests`.
- Committing: `git-commit`. Running a whole task through spawns, gates, commit
  and pull request: `task-execute-workflow`. Writing to Linear:
  `linear-conventions`.
- Generic Angular API guidance: `angular-developer`. The local conventions in
  the MiBolt skills and in `CLAUDE.md` win over it, and a framework fact is
  looked up the way `.claude/rules/framework-facts.md` says.

## Areas, stack and connections

**Layout.** Each area splits further; the coverage register has a row for
every tracked sub-area.

| Path | What it holds | Owner |
|---|---|---|
| `frontend/projects/storefront/` | the shop: catalogue, product page, cart, five-step checkout, demo-access gate | `mibolt-shop-frontend` |
| `frontend/projects/demo-payment/` | the simulated card-payment page the checkout hands off to | `mibolt-shop-frontend` |
| `frontend/projects/shop-mocks/` | the in-page MSW mock backend of the storefront and the payment app | `mibolt-shop-frontend` |
| `frontend/projects/admin/` | the back office, with its own generated client and its own MSW mocks | `mibolt-admin-frontend` |
| `frontend/projects/shop-api/`, `frontend/projects/core-api/` | the generated shop SDK; the API-root, demo-session and splash helpers the apps share | `mibolt-cross-package-changes` |
| `frontend/tests/` | the Node contract suite, the MSW harness, the image checks | split three ways; see the coverage register |
| `frontend/e2e/`, `frontend/specs/` | the Playwright suite and its plans | `playwright-tests` |
| `backend/services/commerce/` | the one Spring Boot service; its requirements live in `backend/docs/` | `mibolt-commerce-backend` |
| `contracts/commerce/` | the OpenAPI contract, samples, sequence diagrams, `contracts/commerce/kommunikacio.md` | `mibolt-cross-package-changes` |
| `data/catalog/` | the tracked catalogue: JSON, schema, images | `mibolt-cross-package-changes` |
| `mise.toml`, `deploy/`, `.github/` | root tasks, compose stack, Helm chart, candidate release, CI | `mibolt-workspace-ops` |
| `tools/` | the catalogue importer, the dev-server helper, the agent-memory CLI | per sub-directory; see the coverage register |
| `.claude/` | agent rules, skills, hooks | not product code; its rules load at launch |

**Stack.** Declared versions come from the manifests cited. The lockfile
column is `frontend/package-lock.json`; the backend has no lockfile, and what
`backend/services/commerce/build.gradle` leaves unpinned resolves through
Spring Boot's dependency management. The local column is what one machine had
on 2026-09-26: re-measure it before relying on it.

| Part | Declared | Lockfile | Local |
|---|---|---|---|
| Node | 26.10.0 (`mise.toml:12`); engines `^22.22.3 \|\| ^24.15.0 \|\| ^26.0.0` (`frontend/package.json:39`) | — | 26.10.0 |
| npm | `npm@11.17.0` (`frontend/package.json:37`) | — | 11.19.1 |
| Java | `temurin-21.0.12+101.0.LTS` (`mise.toml:13`); toolchain 21 (`backend/services/commerce/build.gradle:15`) | — | Temurin 21.0.12.1 |
| Angular core | `^22.1.0` (`frontend/package.json:45`) | 22.1.6 | 22.1.6 |
| Angular CLI and build | `^22.1.8` (`frontend/package.json:56-57`) | 22.1.8 | 22.1.8 |
| TypeScript | `~6.0.2` (`frontend/package.json:82`) | 6.0.3 | 6.0.3 |
| Vitest | `^4.0.8` (`frontend/package.json:84`) | 4.1.11 | 4.1.11 |
| MSW | `^2.15.0` (`frontend/package.json:76`) | 2.15.0 | 2.15.0 |
| Playwright | `1.63.0` (`frontend/package.json:62`) | 1.63.0 | 1.63.0 |
| ESLint | `^10.9.1` (`frontend/package.json:68`) | 10.10.0 | 10.10.0 |
| ng-openapi-gen | `^1.0.5` (`frontend/package.json:77`) | 1.0.5 | 1.0.5 |
| Spring Boot | 4.1.1 (`backend/services/commerce/build.gradle:3`) | — | — |
| OpenAPI Generator (backend) | 7.25.0 (`backend/services/commerce/build.gradle:5`) | — | — |
| PMD | 7.24.0 (`backend/services/commerce/build.gradle:221`) | — | — |
| Gradle wrapper | 9.7.1 (`backend/gradle/wrapper/gradle-wrapper.properties:3`) | — | — |
| PostgreSQL | `postgres:16.15-alpine3.24`, digest-pinned (`deploy/compose.yaml:10`) | — | — |
| uv, for the contract tools | 0.12.17 (`contracts/mise.toml:6`) | — | 0.8.15 on the plain PATH; `mise run` uses the pinned one |

**How the parts connect.**

- **One contract, three generated clients.** `contracts/commerce/openapi.yaml`
  generates the shop SDK into `frontend/projects/shop-api/src/generated/`
  (`frontend/ng-openapi-gen.json`, which excludes the four admin tags), the
  admin client into `frontend/projects/admin/src/app/api/generated/`
  (`frontend/ng-openapi-gen.admin.json`, which includes only those tags), and
  the backend's Spring interfaces into the service's gitignored `build/`
  directory (`backend/services/commerce/build.gradle:89-114`).
  `mise run api:generate` regenerates all three.
- **Three path aliases** (`frontend/tsconfig.json:17-21`): `@mi-bolt/api/*` is
  the shop SDK, `@mi-bolt/core-api/*` is `frontend/projects/core-api/src/`,
  and `@mi-bolt/mocks/*` is `frontend/projects/shop-mocks/src/`. The admin app
  uses its own client and mocks instead; the lint rule that keeps it off the
  shop SDK and mocks is `mibolt-frontend-code-standards`'s.
- **The catalogue feeds five places:** the backend's startup seeding
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogLoader.java:54`);
  `frontend/scripts/build-catalog-fixture.mjs`, which writes
  `frontend/docs/api/fixtures/catalog.json` for the shop mocks
  (`frontend/projects/shop-mocks/src/browser.ts:32`); the admin mock seed
  (`frontend/projects/admin/src/mocks/seed.ts:1`); both image builds
  (`deploy/compose.yaml:35`, `deploy/compose.yaml:63`); and the candidate
  template fingerprint (`deploy/candidate/README.md:60`).
- **Ports** (`README.md:229-239`): 4200 storefront, 4210 demo payment, 4220
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
| an endpoint's implementation, a business rule, fee or threshold, an error code in the service, a Liquibase migration, catalogue seeding, backend configuration | `mibolt-commerce-backend` |
| `contracts/commerce/openapi.yaml`, a new or changed endpoint, field, enum or error code, `mise run api:generate`, a red `mise run api:drift`, `frontend/projects/core-api/`, the contract tests, `data/catalog/` | `mibolt-cross-package-changes` |
| which checks a change needs, a red CI job, the coverage floors, a focused test run, whether a browser pass is required | `mibolt-verification` |
| a mise task, run mode, port or environment variable, compose, a Dockerfile, nginx, a workflow or path filter, the Helm chart, `tools/dev-server/`, a second stack beside the first | `mibolt-workspace-ops` |
| writing or repairing a Playwright spec | `playwright-tests` |
| an Angular API question no MiBolt skill answers | `angular-developer` |
| making a commit | `git-commit` |
| running a whole task end to end | `task-execute-workflow` |

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
   a symbol, spelled as the repository spells it
   (`.claude/rules/code-standards.md`, "Grep the identifier as the repository
   spells it").
3. Load only the skills the task matches, in the order above.

**Example: the free-shipping threshold shown at checkout.** The value is
backend configuration, `mibolt.checkout.free-shipping-threshold-huf` at
`backend/services/commerce/src/main/resources/application.properties:50`,
applied at
`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/checkout/CheckoutService.java:228`
and served by `GET /checkout/options` (`contracts/commerce/openapi.yaml:558`):
that is `mibolt-commerce-backend`'s. The storefront shows whatever options
come back and never invents a free-shipping default
(`frontend/projects/storefront/src/app/features/checkout/delivery-step.ts:58-61`),
while the shop mocks keep their own copy of the value
(`frontend/projects/shop-mocks/src/checkout/checkout-store.ts:64`): both are
`mibolt-shop-frontend`'s. Changing the value means changing both copies;
changing the response shape goes to `mibolt-cross-package-changes`.

## Code rules

This skill carries none. Consult `mibolt-frontend-code-standards` when
writing or reviewing TypeScript, templates or styles under `frontend/`, and
`mibolt-backend-code-standards` when writing or reviewing Java or Gradle code
under `backend/`. The workspace rules in `.claude/rules/code-standards.md` and
the Angular conventions in `CLAUDE.md` are loaded at launch.

## What a change can reach

A change to `contracts/commerce/openapi.yaml`, a generated client,
`frontend/projects/core-api/`, the contract tests or `data/catalog/` reaches
more than one consumer. Consult `mibolt-cross-package-changes` when a change
touches any of them, then the skill of each consumer it reaches. The
generated clients are regenerated, never edited by hand.

## Checks

Which checks a change needs, with their commands, prerequisites and side
effects, is `mibolt-verification`'s. A change that reaches a rendered surface
also gets the real-browser pass in `.claude/rules/browser-verification.md`. To
list the tasks that exist, run `mise tasks --all`: it is read-only and prints
the root and area tasks.

## References

- [references/coverage-register.md](references/coverage-register.md): every
  tracked area with its responsibility, its owner or the reason it has none,
  how deeply it was mapped, and what is unknown. **Read when** a path matches
  nothing in the layout table, when the routing table does not settle who owns
  something, before calling an area fully understood, or when updating any
  MiBolt skill.
- [references/docs-index.md](references/docs-index.md): the authoritative
  document for each area, its language, and where it no longer matches the
  code. **Read when** the answer is in a document rather than in code, or
  before quoting a document as a description of the current apps.

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
- a document added, moved or rewritten: the docs index.

**Run the citation check after editing any MiBolt skill, and after moving or
rewriting a file one cites**, because a cited path, anchor or command goes
stale silently when the repository moves. The check is
`.claude/skills/mibolt-project-map/scripts/check-skill-references.mjs`. It
runs from anywhere inside the checkout, finds the repository root through git,
and is read-only: it runs `git rev-parse --show-toplevel`, `git ls-files` and
`mise tasks --all --json`, and writes nothing. It needs git, Node (the
`mise.toml` pin) and, unless `--no-mise` is given, mise on the PATH.

```bash
node .claude/skills/mibolt-project-map/scripts/check-skill-references.mjs [--show-anchors] [--no-mise] [<skill-dir> ...]
```

- With no directory it checks every `mibolt-*` directory under
  `.claude/skills/`. A directory it is given must be one of those and hold
  `SKILL.md`; anything else ends with `not a skill directory: <arg>`.
- `--show-anchors` also prints the current text of every line an anchor
  points at, up to ten lines per range, and never changes the exit code.
- `--no-mise` skips mise and reports every `mise run` token UNVERIFIED.

In `SKILL.md` and `references/*.md` it checks that relative links, backticked
repository paths with their line anchors, globs, `mise run` tasks, npm scripts
and script paths resolve, and it fails any line holding a home-directory path,
a temp-directory path or a file URL; the script's header comment states each
check exactly. A Gradle task, written in the form
`backend/gradlew -p backend :services:commerce:build`, is found only when
`backend/services/commerce/build.gradle` registers it, `backend/mise.toml`
runs it or `.github/workflows/backend.yml` calls it, and is reported
UNVERIFIED otherwise; UNVERIFIED is not a pass.

It prints one line per finding, in the form
`FAIL|UNVERIFIED <skill-relative-file>:<line> <kind> <token> — <reason>`, then
one summary line per skill. It exits 0 when nothing failed, 1 on any FAIL,
and 2 on a usage or prerequisite error: an unknown option, a directory that is
not a MiBolt skill, a working directory outside a git checkout, or mise
missing without `--no-mise`. Excerpts of two runs on this skill, on
2026-09-26; the counts and line numbers move with every edit:

```text
$ node .claude/skills/mibolt-project-map/scripts/check-skill-references.mjs --show-anchors .claude/skills/mibolt-project-map
...
ANCHOR SKILL.md:158 backend/services/commerce/src/main/resources/application.properties:50 -> backend/services/commerce/src/main/resources/application.properties
  50: mibolt.checkout.free-shipping-threshold-huf=30000
...
mibolt-project-map: 341 checked, 0 FAIL, 0 UNVERIFIED

$ node .claude/skills/mibolt-project-map/scripts/check-skill-references.mjs --no-mise .claude/skills/mibolt-project-map
UNVERIFIED SKILL.md:86 mise mise run api:generate — mise task check skipped (--no-mise)
...
mibolt-project-map: 341 checked, 0 FAIL, 8 UNVERIFIED
```

**Write citations the checker can read.**

- Name a task as `mise run deploy:check`, never as the bare task name in
  backticks: a bare name whose first part is a top-level directory, such as
  `backend`, `contracts` or `deploy`, is read as a path and fails.
- Keep placeholders and ellipses out of backticked paths and commands: a path
  holding a `<name>` placeholder is checked as a literal path, the word after
  `node`, or after `python` in a `uv run` line, is taken as a script path, and
  a placeholder task or script name as a real one. Put a template in a fenced
  code block instead: the path and command checks read only backticked
  tokens, while the hygiene check reads every line.
- Backtick only a path that exists in a fresh checkout. A gitignored output,
  such as the service's `build/` directory or a tool's cache, exists only
  after a run, so name it in plain text; a glob matches tracked files only, so
  it cannot stand for an untracked file or a directory.
- The checker cannot tell whether an anchored line still says what the skill
  claims. Run it with `--show-anchors` after a change to a cited file, and
  read the printed lines against the sentences that cite them.

**Where the set lives.** The MiBolt skills are project skills under
`.claude/skills/`, which Claude Code loads
(https://code.claude.com/docs/en/skills). Codex scans `.agents/skills`
directories, and its documentation names no `.claude/skills` location
(https://learn.chatgpt.com/docs/build-skills, redirected from
https://developers.openai.com/codex/skills/), so Codex does not see this set.
Keep the one copy here, with no duplicate and no symlink, so there is nothing
to drift. Each skill's `agents/openai.yaml` comes from the skill-creator's
initialisation step and has no reader in this location; when a skill's
description changes, regenerate that file with the `skill-creator` skill's
`generate_openai_yaml.py`.
