# Commands

Read this before running a command you have not run in this checkout. Each
row names where the command is defined, what it needs beyond the checkout,
and one or more side-effect classes. Invoke every command from the repository
root unless its row says otherwise. Which commands a given diff needs is in
this skill's command matrix reference, and the outputs these commands share
are described in `SKILL.md` ("What a check writes or starts").

## Contents

- [Side-effect classes](#side-effect-classes)
- [Discovery](#discovery)
- [The changed-paths script](#the-changed-paths-script)
- [Frontend](#frontend)
- [Backend](#backend)
- [Contract, tools, deploy](#contract-tools-deploy)
- [Umbrella and setup](#umbrella-and-setup)
- [End-to-end and run modes](#end-to-end-and-run-modes)

## Side-effect classes

- **read-only**: writes no tracked file and no output a later check reads; a
  tool's own cache, such as the results cache Vitest keeps under
  `node_modules/.vite/vitest/`, does not count;
- **writes local artefacts**: writes ignored output (`coverage/`, `dist/`,
  Gradle's `build/`, `node_modules/`), which the next run overwrites;
- **rewrites tracked files**: can change tracked files in the tree;
- **starts processes or ports**: starts a server, a container or a listener;
- **needs a missing tool**: needs a tool that no `mise.toml` installs.

## Discovery

| Command | Defined in | Needs | Class |
|---|---|---|---|
| `uv run --no-project --python 3.12 --with PyYAML==6.0.2 python scripts/checks-for-changed-paths.py`, from any directory in the checkout with the path given from there | this skill's script | uv on PATH; a git checkout | read-only |
| `mise tasks --all` | mise; lists the tasks of all five `mise.toml` files | mise | read-only |

## The changed-paths script

`SKILL.md` ("From a diff to green checks", step 1) says what it is for; its
header in `scripts/checks-for-changed-paths.py` is the full usage text.

- **Options.** `--base <ref>` sets the base of the branch diff, `origin/main`
  by default. `--paths <p> ...` replaces the paths read from git; write each
  as git prints it: repository-relative, with no leading `/` or `./` and no
  `.`, `..` or empty segment. `--json` prints the same data as one object
  (`changed_paths`, `stale_remote_ref_note`, `triggered`, `not_triggered`,
  `frontend_files_for_eslint`, `frontend_files_for_prettier`,
  `frontend_files_for_neither`).
- **Exit codes.** 0 on success, including when nothing is triggered; 2 on a
  usage or parse error, such as `path must be repo-relative: <p>`,
  `<ref> not found locally; pass --base <ref>` or
  `could not parse <file>: <reason>`.
- **The `frontend/` file lists.** ESLint gets `.ts`, `.js`, `.mjs`, `.cjs` and
  `.html`; Prettier gets those and `.json`, `.md`, `.css`, `.scss`, `.yaml`,
  `.yml` and `.prettierrc`. A file neither takes, such as an image,
  `Dockerfile`, `mise.toml` or an nginx file, goes in the third list.
  `[CI-only expression]` marks a `run:` line holding `${{ }}` or a
  `$GITHUB_*` variable.

An excerpt of a real run with `--paths contracts/commerce/openapi.yaml`,
shortened at `…`:

```text
changed paths (1)
  - contracts/commerce/openapi.yaml

component frontend <- 1 path(s) (first match: contracts/**)
  workflow frontend.yml
  job "lint" (dir frontend, needs none)
    run: npm ci
    run: npm run lint
      package.json script "lint": ng lint
  …
component contracts <- 1 path(s) (first match: contracts/**)
  workflow contracts.yml
  job "check" (dir ., needs none)
    run: mise -C contracts install
    run: mise -C contracts run check
  …
not triggered: tools

frontend files for npx eslint (run from frontend/):
  (none)
frontend files for npx prettier --check (run from frontend/):
  (none)
frontend files neither command takes:
  (none)
```

## Frontend

The npm scripts and `mise` tasks run in `frontend/`. They need `node_modules`
in `frontend/` (installed by `mise run setup`) and the Node version pinned at
`mise.toml:12`.

| Command | Defined in | Needs | Class |
|---|---|---|---|
| `npx eslint <files>`, invoked from `frontend/` | `eslint` in `frontend/package.json:68`; the form is `SKILL.md` ("Gates before a commit") | — | read-only |
| `npx prettier --check <files>`, invoked from `frontend/` | `prettier` in `frontend/package.json:80`; the form is `SKILL.md` ("Gates before a commit") | — | read-only |
| `npm --prefix frontend run lint` | `frontend/package.json:28` | — | read-only |
| `npm --prefix frontend run format:check` | `frontend/package.json:30` | — | read-only |
| `mise run //frontend:lint` (both of the above) | `frontend/mise.toml:5-6` | — | read-only |
| `npm --prefix frontend run test -- --no-watch` | `frontend/package.json:22` | — | writes local artefacts |
| `npm --prefix frontend run test -- <project> --include <path> --no-coverage --no-watch` | `frontend/package.json:22` plus builder flags | — | read-only |
| `npm --prefix frontend run test:contract` | `frontend/package.json:23` | — | read-only |
| `mise run //frontend:test` (unit, then contract) | `frontend/mise.toml:8-9` | — | writes local artefacts |
| `npm --prefix frontend run build` | `frontend/package.json:12` | — | writes local artefacts |
| `npm --prefix frontend run build:check` | `frontend/package.json:20` | — | writes local artefacts |
| `npm --prefix frontend run build:payment` | `frontend/package.json:13` | — | writes local artefacts |
| `npm --prefix frontend run build:admin` | `frontend/package.json:14` | — | writes local artefacts |
| `npm --prefix frontend run check:storefront-dist` | `frontend/package.json:18` | the storefront's production build | read-only |
| `npm --prefix frontend run check:payment-dist` | `frontend/package.json:19` | demo-payment's production build | read-only |
| `npm --prefix frontend run check:admin-dist` | `frontend/package.json:17` | the admin's production build | read-only |
| `npm --prefix frontend run check:payment-boot` | `frontend/package.json:15` | port 4299 free | starts processes or ports |
| `npm --prefix frontend run check:admin-boot` | `frontend/package.json:16` | port 4299 free | starts processes or ports |
| `mise run //frontend:build` (all eight build steps, in CI's order) | `frontend/mise.toml:11-21` | port 4299 free | writes local artefacts; starts processes or ports |
| `mise run api:drift` | `mise.toml:80-82`, then `frontend/package.json:32` | — | rewrites tracked files |
| `mise run api:generate`, a change step owned by `mibolt-cross-package-changes` | `mise.toml:76-78` | Java 21 for the backend half | rewrites tracked files; writes local artefacts |
| `npm --prefix frontend run fixtures:catalog:check` (manual only) | `frontend/package.json:34` | — | read-only |
| `node frontend/scripts/check-budgets.mjs` (manual only) | the script; no npm script | the storefront's production build | read-only |

## Backend

Gradle builds `backend/`. It needs Java 21 (`mise.toml:13`) and no database.

| Command | Defined in | Needs | Class |
|---|---|---|---|
| `backend/gradlew -p backend :services:commerce:build` | Gradle build; the form is `SKILL.md` ("Gates before a commit") | — | writes local artefacts |
| `mise run //backend:build` (`//backend:test` first) | `backend/mise.toml:11-13` | — | writes local artefacts |
| `mise run //backend:test` (`test`, then `integrationTest`) | `backend/mise.toml:8-9` | — | writes local artefacts |
| `backend/gradlew -p backend :services:commerce:test --tests <pattern>` | Gradle `test` task | — | writes local artefacts |
| `backend/gradlew -p backend :services:commerce:integrationTest --tests <pattern>` | `backend/services/commerce/build.gradle:148-158` | — | writes local artefacts |
| `mise run //backend:lint` (PMD, main and test) | `backend/mise.toml:5-6` | — | writes local artefacts |
| `bash backend/services/commerce/scripts/smoke.sh` | the script | a running backend at `BASE`, default `http://localhost:8080/api/v1`; `MIBOLT_DEMO_PASSWORD` when that backend does not use the script's default demo password (`backend/services/commerce/scripts/smoke.sh:9`); curl; python3 | read-only in the repository; writes to that backend's database |

## Contract, tools, deploy

| Command | Defined in | Needs | Class |
|---|---|---|---|
| `mise run contracts:check` (vacuum lint, samples, PlantUML; runs in `contracts/`) | `mise.toml:84-86`, then `contracts/mise.toml:14-19` | the tools pinned at `contracts/mise.toml:5-9` | read-only |
| `mise run //tools:lint` (typecheck; runs in `tools/`) | `tools/mise.toml:5-6` | `node_modules` in `tools/` | read-only |
| `mise run //tools:test` (Vitest; runs in `tools/`) | `tools/mise.toml:8-9` | `node_modules` in `tools/` | starts processes or ports: `tools/dev-server/dev-server.test.ts` starts short-lived servers on free ports and stops them |
| `mise run deploy:check` (renders and checks the Helm chart) | `mise.toml:100-102` | uv; `helm` on PATH | needs a missing tool |

## Umbrella and setup

| Command | Defined in | Needs | Class |
|---|---|---|---|
| `mise run verify` | `mise.toml:67-74` | everything `mise run setup` installs; Java 21; the tools pinned in `contracts/mise.toml`; port 4299 free | writes local artefacts; rewrites tracked files; starts processes or ports |
| `mise run setup` | `mise.toml:62-65` | network access | writes local artefacts, the `node_modules/` of `frontend/` and `tools/` among them |

## End-to-end and run modes

Listed so their classes are known. The end-to-end suite is outside this
skill, and the run modes serve the apps rather than check them.

| Command | Defined in | Needs | Class |
|---|---|---|---|
| `npm --prefix frontend run e2e`, `npm --prefix frontend run e2e:all`, `npm --prefix frontend run e2e:smoke` | `frontend/package.json:24-26` | browsers from `e2e:install` (`frontend/package.json:27`); for `e2e:smoke`, a backend on 8080 | starts processes or ports (4400, or 4410 for smoke; `frontend/playwright.config.ts:11-18`); writes local artefacts |
| `mise run storefront`, `mise run backend`, `mise run stack`, `mise run stop` and the other run modes | `mise.toml` | Docker for every mode that starts PostgreSQL | starts processes or ports |
