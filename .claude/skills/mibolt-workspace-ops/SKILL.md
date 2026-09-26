---
name: mibolt-workspace-ops
description: "Operating and changing the MiBolt workspace itself: root and per-area mise tasks, local run modes (storefront, admin and payment on MSW, db, backend, dev, stack, stop) with ports and environment variables, deploy/compose.yaml and compose.sh, the Dockerfiles and nginx config, GitHub Actions workflows and path filters, the Helm chart and tools/dev-server. Use for adding or changing a mise task, CI job or filter, compose service, port or env var, or diagnosing why the stack or a workflow does not start. Not for application code."
---

# MiBolt workspace ops

Every path here is relative to the repository root, and every command runs from
there; `.claude/rules/session-lifecycle.md` ("Tools and startup") says where
each workspace's own commands run.

## Scope and hand-offs

**Inside:** the root `mise.toml` and the four area files (`frontend/mise.toml`,
`backend/mise.toml`, `tools/mise.toml`, `contracts/mise.toml`) as one task
graph; `frontend/package.json` as a file, its scripts and the Node start
wrapper; the build and serve configurations in `frontend/angular.json` and the
`frontend/proxy*.json` files; everything under `deploy/`;
`frontend/Dockerfile`, `backend/services/commerce/Dockerfile`,
`frontend/nginx/` and `frontend/tests/web-image/`; `.github/`;
`tools/dev-server/`, `tools/install-spring-tools-mcp.sh`,
`frontend/scripts/serve-static.mjs` and `frontend/scripts/proxy-timeout.mjs`;
`.editorconfig` and `.gitattributes` as files.

**Outside, and where it goes:**

- Which checks a change needs, what each one writes, and which local command
  reproduces a CI job: consult `mibolt-verification` when a wiring change here
  is made.
- The contract, a failing `api:generate` or `api:drift`, the generated clients
  and the catalogue data are out of scope here: `mibolt-cross-package-changes`
  owns them. The wiring of those root tasks is here.
- Application code is out of scope: `mibolt-shop-frontend`,
  `mibolt-admin-frontend` and `mibolt-commerce-backend` own it.
- Playwright projects, specs and their web servers are out of scope:
  `playwright-tests` owns them.
- The formatting rules that follow from `.editorconfig` are out of scope:
  `mibolt-frontend-code-standards` and `mibolt-backend-code-standards` own
  them.
- `.claude/**` is out of scope even where a root task runs it (`claude:memory`,
  `claude:hooks:test`, `claude:hooks:typecheck`): `.claude/CLAUDE.md` and the
  rule files it indexes own it.
- Dependency upgrades and lockfile changes are out of scope for this skill;
  `.claude/rules/parallel-spawns.md` ("What a batch shares") treats the
  dependency files as one agent's at a time.

## What the wiring is

- **One task graph over five `mise.toml` files.** `[monorepo] config_roots`
  (`mise.toml:8-9`) loads `frontend`, `backend`, `tools` and `contracts` as
  config roots, whose tasks are addressed as `//frontend:build` and so on.
  `mise tasks` lists the 20 root tasks, each with a `description`;
  `mise tasks --all` adds the 23 area tasks, which carry none
  (https://mise.jdx.dev/tasks/monorepo.html). A task runs in its own config
  root by default (https://mise.jdx.dev/tasks/task-configuration.html, "dir"),
  so area tasks run inside their area and root tasks at the root.
- **Pins.** The root pins Node and Java (`mise.toml:11-13`);
  `contracts/mise.toml:5-12` pins uv, vacuum, check-jsonschema and PlantUML for
  its own `check` task. A config root's tools apply to that root's tasks
  (https://mise.jdx.dev/tasks/monorepo.html), so no root task inherits the
  contracts' uv, and nothing pins `helm`.
- **Run modes.** `storefront`, `admin`, `payment` and `frontend` serve apps
  with `ng serve` on the in-page MSW mock (4200, 4220, 4210). `db`,
  `backend:docker` and `stack` start containers through `deploy/compose.sh`;
  `backend` adds a native Gradle `bootRun`; `dev` and `dev:docker` serve the
  three apps in their `local-backend` configuration against the backend on
  8080, with PostgreSQL on 55433. `stop` stops every container and keeps the
  volume. `README.md:229-239` lists the ports, 4400 and 4410 for Playwright
  included.
- **Two images, built only through Compose.** `mi-bolt-web` puts the three
  production builds behind NGINX; `mi-bolt-commerce` is the backend. Both read
  named build contexts only `deploy/compose.yaml` supplies.
- **CI.** `.github/workflows/ci.yml` filters the change with
  `.github/components.yml` and calls up to five reusable workflows, then
  `ci-ok`. After it, `.github/workflows/candidate.yml` builds the images, and
  the publish, preview-smoke, stable-smoke and close-preview workflows run from
  the default branch. Only `.github/workflows/contracts.yml` goes through mise;
  the rest call npm and Gradle directly.
- **Deploy.** `deploy/helm/mi-bolt/` is the chart for the preview and stable
  environments, which Flux deploys from outside this repository
  (`deploy/helm/mi-bolt/README.md:29`); `deploy/candidate/` builds and
  publishes what it installs.
- **Dev tooling.** `deploy/stack.sh` gives a linked worktree a Compose stack of
  its own; `tools/dev-server/dev-server.sh` starts and stops one process on one
  port; `frontend/scripts/serve-static.mjs` serves a production build;
  `tools/install-spring-tools-mcp.sh` downloads the Spring Tools language
  server for the `spring-tools` MCP server (`README.md:67-79`).
- **`api:drift` checks the frontend clients only** (`mise.toml:80-82`). The
  backend stubs are generated into the Gradle build directory on every build
  (`backend/services/commerce/build.gradle:92`) and no file of them is tracked.
- **`tools/` is an npm workspace root** with `catalog-import` as its member
  (`tools/package.json:5`); its `lint` task is the typecheck and its `build`
  task only prints a line (`tools/mise.toml:5-12`).

## Where to start

| Task | Start at | Example to copy |
|---|---|---|
| a root task | `mise.toml` | `verify` (`mise.toml:67-74`) for a task made of other tasks; `db` (`mise.toml:31-33`) for one that runs a command |
| an area task | the area's `mise.toml` | `frontend/mise.toml:11-21`, a `run` list |
| a run mode, a port | `README.md:81-243`, then `mise.toml:15-60` | `stack` (`mise.toml:52-56`) |
| a Compose service, a volume, an env var | `deploy/compose.yaml`, `deploy/.env.example` | `deploy/compose.sh` for how every Compose call is made |
| a second stack | `deploy/stack.sh:9-26` | `.github/workflows/smoke.yml:19-25` |
| an image or NGINX | `frontend/Dockerfile`, `backend/services/commerce/Dockerfile`, `frontend/nginx/default.conf.template` | `frontend/tests/web-image/nginx-api-gzip.spec.ts` |
| a CI filter or job | `.github/components.yml`, `.github/workflows/ci.yml` | `.github/workflows/tools.yml`, one job in the shape the others share |
| the chart | `deploy/helm/mi-bolt/README.md`, `deploy/tests/check-chart.py` | — |
| candidate publication | `deploy/candidate/README.md` | — |

## Typical work

### Add or change a root mise task

1. Read `mise tasks --all` first and reuse an existing task through its
   `//area:task` name rather than repeating its command.
2. Pick the shape. When every step is already a task, list them under
   `depends`, which mise runs in parallel
   (https://mise.jdx.dev/tasks/task-configuration.html, "depends"). A step that
   has no task of its own goes under `run` and runs from the root, the way
   `claude:memory` runs `npm --prefix tools run` (`mise.toml:88-90`). A task
   that runs the contract lint and the frontend contract suite, for example,
   can depend on `contracts:check` and run
   `npm --prefix frontend run test:contract`.
3. Name it for what it acts on, prefixed by its owner, as `contracts:check` and
   `api:drift` are (`.claude/rules/code-standards.md:26`).
4. Give it a `description`: `mise tasks` prints it, and the two command tables
   repeat it word for word.
5. Add the same row to `README.md:352-372` and to `docs/monorepo.md:30-50`.
   Both tables list the other 19 root tasks; `deploy:check`
   (`mise.toml:100-102`) is in neither.
6. When the workspace as a whole should pass it, add it to `verify`'s `depends`
   (`mise.toml:67-74`).
7. CI never runs a root task, so a check that CI should run also needs a step
   in its workflow; [references/ci-cd.md](references/ci-cd.md) has the shape.

Done when `mise tasks` shows the task with its description, both tables carry
the row, and the checks `mibolt-verification` names for the change pass.

### Wire a check into CI or change a path filter

1. Put the step in the component's reusable workflow, in the shape its other
   jobs have, and keep the matching area task in step with it
   (`frontend/mise.toml:11-21` and `.github/workflows/frontend.yml:122-134`
   list the same eight build steps).
2. For a path filter, edit `.github/components.yml`. A change to the `frontend`
   or `backend` list fails `Candidate Build` unless
   `deploy/candidate/inputs.py:15-20` and
   `deploy/tests/test-candidate.py:34-40` change with it.
3. Update the table at `docs/monorepo.md:62-68`, and `frontend/README.md:89`
   when the `frontend` list changed.

A new component, a post-merge workflow, or a trigger that does not fire: read
[references/ci-cd.md](references/ci-cd.md).

### Add or change a Compose service, a port or an environment variable

1. Edit `deploy/compose.yaml`, with an overridable default as `${VAR:-…}` and a
   required value as `${VAR:?…}`
   (https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/),
   and document an override in `deploy/.env.example`.
2. Follow the change outward with the table under "What a change here can
   reach" below: the docs, `deploy/stack.sh`, the CI workflows, and the chart.
3. A change to a service's `build:` block also changes what the candidate
   publisher accepts; read [references/deploy.md](references/deploy.md) first.

### Run a second stack beside the default one

- **From a linked worktree:** `deploy/stack.sh up --build` claims a slot with
  its own project, volume and ports; `deploy/stack.sh ports` prints them, and
  `deploy/stack.sh reset --yes` deletes that worktree's volume and frees the
  slot before the worktree is removed.
- **From the main checkout**, where `deploy/stack.sh` refuses to run: set
  `COMPOSE_PROJECT_NAME`, `MIBOLT_POSTGRES_VOLUME`, the three port variables,
  `MIBOLT_PAYMENT_ORIGIN` and `MIBOLT_SHOP_ORIGIN`, and call
  `deploy/compose.sh`, whose guard refuses a second project on the default
  volume.

Starting either is the orchestrator's step, as with every mode.
[references/run-modes.md](references/run-modes.md) has the slot arithmetic and
the variables.

### Diagnose a mode, the stack or a workflow that does not start

Read the state before changing anything: `deploy/compose.sh ps` for the
containers and `deploy/compose.sh logs --no-color --tail 300` for their output
(the form `.github/workflows/smoke.yml:88` uses); the wrapper passes every
argument to Compose. Then match the symptom in the table at the end of
[references/run-modes.md](references/run-modes.md) or
[references/ci-cd.md](references/ci-cd.md).

## Rules that apply here

- **Name a task or a script for what it acts on, prefixed by its owner:**
  `.claude/rules/code-standards.md:26`.
- **Run a Python tool through uv, pinned in the area's `mise.toml`:**
  `.claude/rules/code-standards.md:35`. The deploy checks run as
  `uv run --no-project --with PyYAML==6.0.2 python …` (`mise.toml:100-102`,
  `.github/workflows/candidate.yml:32-40`), with no uv pinned at the root.
- **No machine-specific path in a committed file:**
  `.claude/rules/code-standards.md:21`. The scripts here find their location at
  run time, as `deploy/compose.sh:8` and `deploy/stack.sh:29-30` do.
- **Servers, containers and the database are the orchestrator's:**
  `.claude/rules/session-lifecycle.md` ("Tools and startup").
  `deploy/stack.sh up` starts containers and claims ports the same way the root
  modes do.
- **Ports and the dependency files are shared across agents:**
  `.claude/rules/parallel-spawns.md` ("What a batch shares").
- **Start an Angular dev server through the `start*` npm scripts, never
  `npx ng serve`,** because only they carry the Node flag that avoids the V8
  abort (`frontend/package.json:6-11`, `frontend/README.md:30`).
- **Call Compose through `deploy/compose.sh`,** because the volume guard and
  the `.env` creation live there (`deploy/compose.sh:10-22`).
- **Leave the default volume alone.** `stop` keeps it (`mise.toml:58-60`),
  `.github/workflows/smoke.yml` runs `down -v` only on a project of its own,
  and `deploy/stack.sh` refuses the `mi-bolt-local` project
  (`deploy/stack.sh:126-131`); removing it removes the developer's data.
- **Pin images by digest,** as every base image in both Dockerfiles and the
  PostgreSQL image in `deploy/compose.yaml:10` are. An image's published tag is
  a hash of tracked files (`deploy/candidate/README.md:27-29`), so only a
  digest written into a tracked file makes a new base image produce a new tag.
- **Keep YAML on LF:** `.gitattributes:2-3`, because the builds compare bytes.

## What a change here can reach

| Change | Also update, or expect |
|---|---|
| a root task added, renamed or removed | `README.md:352-372`, `docs/monorepo.md:30-50`; `verify` when it is a gate; the workflow step when CI should run it |
| an area task | the root task that names it as `//area:task`; the CI step that runs the same command |
| a `start*` script | `frontend/mise.toml:29-45`; Playwright's own `ng serve` command at `frontend/playwright.config.ts:26`, which `playwright-tests` owns |
| a dev-server port or proxy | `frontend/angular.json`, `frontend/proxy*.json`, the ports table at `README.md:229-239`, the payment URL defaults at `backend/README.md:29-30` |
| a Compose port, service or variable | `deploy/.env.example`, `README.md:241-243`, `backend/README.md:19-31`, the slot state `deploy/stack.sh:367-383` writes, `.github/workflows/smoke.yml:19-25`, `.github/workflows/backend.yml:183-185` and `.github/workflows/backend.yml:221-222`, the chart |
| a Compose `build:` block | `deploy/candidate/publish.py:169-184` on `main` first, `.github/workflows/candidate.yml:51-60`, `deploy/tests/test-candidate.py` |
| a Dockerfile or NGINX file | `frontend/tests/web-image/` for an NGINX or `robots.txt` rule; expect a new image tag, because the input hash changes |
| `.github/components.yml` | `deploy/candidate/inputs.py:15-20`, `deploy/tests/test-candidate.py:34-40`, `docs/monorepo.md:62-68`, `frontend/README.md:89` |
| a post-merge workflow or `deploy/candidate/*.py` | nothing else, but it takes effect only once it is on `main` |
| the chart | `deploy/helm/mi-bolt/values.schema.json`, `deploy/tests/check-chart.py`, the Secret key list at `deploy/helm/mi-bolt/README.md:12-16` |

## How to verify

- **A task change:** `mise tasks` lists a root task with its description, and
  `mise tasks --all` lists an area task. Both are read-only.
- **A chart change:** `mise run deploy:check`. It needs `helm` and `uv` on the
  PATH, and the root `mise.toml` pins neither; CI installs Helm v4.2.2
  (`.github/workflows/candidate.yml:29-31`).
- **An NGINX, Dockerfile or static-server change:**
  `npm --prefix frontend run test:contract`, which collects
  `frontend/tests/web-image/` and `frontend/tests/scripts/` through
  `frontend/vitest.contract.config.ts:18`.
- **A `tools/dev-server/` change:** `mise run //tools:lint` and
  `mise run //tools:test`; Vitest's default `include` collects
  `tools/dev-server/dev-server.test.ts` (https://vitest.dev/config/include).
- **A `deploy/stack.sh` or `deploy/candidate/*.py` change:** the matching
  `deploy/tests/*.py` check, run with the command
  `.github/workflows/candidate.yml:32-40` gives it.
- **A workflow change** runs only on GitHub; nothing local executes a workflow.
- **A mode or the stack running** is the orchestrator's to start and stop, and
  a change a browser can reach is verified in a real browser under
  `.claude/rules/browser-verification.md`.

Consult `mibolt-verification` when the change is ready, for the full set of
checks its paths call for.

## Detailed material

- [references/run-modes.md](references/run-modes.md): read when starting,
  stopping or diagnosing a local mode or a second stack, or when adding a port
  or an environment variable.
- [references/ci-cd.md](references/ci-cd.md): read when editing anything under
  `.github/`, or when a workflow does not run or does not publish.
- [references/deploy.md](references/deploy.md): read when changing an image,
  the NGINX configuration, a Compose `build:` block or the Helm chart.

The repository's own sources: `README.md` for the modes, ports and command
table; `docs/monorepo.md` for the folder map and the CI table;
`deploy/candidate/README.md` for publication; `deploy/helm/mi-bolt/README.md`
for the chart; `backend/docs/04-adatbazis.md:62-66`, in Hungarian, for the
worktree stack.

## Keep this skill current

This skill goes stale when any of these change: the five `mise.toml` files; the
`scripts` of `frontend/package.json` and `tools/package.json`; the `serve` and
`build` targets in `frontend/angular.json` and the `frontend/proxy*.json`
files; anything under `deploy/` or `.github/`; the two Dockerfiles and
`frontend/nginx/`; `tools/dev-server/`, `frontend/scripts/serve-static.mjs`;
the ports and command tables in `README.md` and `docs/monorepo.md`. When you
edit one of those, reread the lines this skill and its references cite from it.

Check the cited paths, anchors and commands with
`node .claude/skills/mibolt-project-map/scripts/check-skill-references.mjs .claude/skills/mibolt-workspace-ops`;
add `--show-anchors` to print each anchored line's current text, so a reader
can judge whether it still says what this skill claims.
