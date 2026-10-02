---
name: mibolt-workspace-ops
description: "Changing or running MiBolt workspace wiring: root and area mise tasks, run modes, the Compose stack, ports and environment variables, Dockerfiles and nginx, CI workflows and path filters, Helm chart, tools/dev-server. Load it before answering or changing any of these, however small, or when the stack or a workflow will not start. Not for failing tests or coverage floors."
---

# MiBolt workspace ops

A path starting with `references/` is relative to this skill's directory, a
path starting with a MiBolt skill name, such as
`mibolt-project-map/scripts/check-skill-references.mjs`, is relative to the
directory that holds the MiBolt skills, and every other path is relative to
the repository root. Commands run from the repository root, in the form
"Where commands run" below gives each area's commands, except a command that
names a path starting with a MiBolt skill name: it runs, as written, from the
directory that holds the MiBolt skills, because from the repository root that
path finds nothing.

## Scope and hand-offs

**Inside:** the root `mise.toml` and the four area files (`frontend/mise.toml`,
`backend/mise.toml`, `tools/mise.toml`, `contracts/mise.toml`) as one task
graph; `frontend/package.json` and `tools/package.json` with their scripts,
the Node start wrapper included, and `frontend/package-lock.json`,
`tools/package-lock.json` and `tools/tsconfig.json`, all as files; the build
and serve configurations in `frontend/angular.json`, their `budgets` and
`fileReplacements` included, the `frontend/proxy*.json` files and
`frontend/.postcssrc.json`; `backend/gradlew`, `backend/gradlew.bat`,
`backend/gradle/wrapper/` and
`backend/services/commerce/gradle/wrapper/gradle-wrapper.properties` as
files, the last a tracked symlink to the properties file in
`backend/gradle/wrapper/` (commit 30985558); everything under `deploy/`;
`frontend/Dockerfile` and `frontend/.dockerignore`,
`backend/services/commerce/Dockerfile` and
`backend/services/commerce/Dockerfile.dockerignore`; `frontend/nginx/`,
`frontend/tests/web-image/` and `frontend/tests/scripts/`; `.github/`;
`tools/dev-server/`, `frontend/scripts/serve-static.mjs` and
`frontend/scripts/proxy-timeout.mjs`;
`backend/docs/06-uzembe-helyezes.md`, which builds and runs the backend image
by hand; `.editorconfig`, `.gitattributes`, `.gitignore`,
`backend/.gitattributes` and `backend/.gitignore` as files.

**Outside, and where it goes:**

- Which checks a change needs, what each one writes, why a check or a
  coverage floor fails, and which local command reproduces a CI job: consult
  `mibolt-verification` when a wiring change here is made or a check fails.
- The contract, a failing `api:generate` or `api:drift`, the generated clients
  and the catalogue data are out of scope here: `mibolt-cross-package-changes`
  owns them. The wiring of those root tasks is here.
- Application code is out of scope: `mibolt-shop-frontend`,
  `mibolt-admin-frontend` and `mibolt-commerce-backend` own it.
- Playwright projects, specs and their web servers are out of scope: they are
  the end-to-end suite's own configuration, in `frontend/playwright.config.ts`
  and `frontend/e2e/`.
- The formatting rules that follow from `.editorconfig` are out of scope:
  `mibolt-frontend-code-standards` and `mibolt-backend-code-standards` own
  them.
- `backend/settings.gradle` and the plugin, toolchain and dependency blocks at
  `backend/services/commerce/build.gradle` ("plugins";
  `backend/services/commerce/build.gradle`, "toolchain";
  `backend/services/commerce/build.gradle`, "dependencies") are out of scope:
  `mibolt-commerce-backend` owns them.
- Dependency upgrades are out of scope for this skill, though the manifests
  and the lockfiles named above are in it as files.

## What the wiring is

- **One task graph over five `mise.toml` files.** `[monorepo] config_roots`
  (`mise.toml`, "config_roots") loads `frontend`, `backend`, `tools` and `contracts` as
  config roots, whose tasks are addressed as `//frontend:build` and so on.
  `mise tasks` lists the 17 root tasks, each with a `description`;
  `mise tasks --all` adds the 23 area tasks, which carry none
  (https://mise.jdx.dev/tasks/monorepo.html). A task runs in its own config
  root by default (https://mise.jdx.dev/tasks/task-configuration.html, "dir"),
  so area tasks run inside their area and root tasks at the root.
- **Pins.** The root pins Node and Java (`mise.toml`, "[tools]");
  `contracts/mise.toml` ("[tools]") pins uv, vacuum, check-jsonschema and PlantUML for
  its own `check` task. A config root's tools apply to that root's tasks
  (https://mise.jdx.dev/tasks/monorepo.html), so no root task inherits the
  contracts' uv, and nothing pins `helm`.
- **Run modes.** `mise run storefront`, `mise run admin`, `mise run payment`
  and `mise run frontend` serve apps with `ng serve` on the in-page MSW mock
  (4200, 4220, 4210). `mise run db`, `mise run backend:docker` and
  `mise run stack` start containers through `deploy/compose.sh`;
  `mise run backend` adds a native Gradle `bootRun`; `mise run dev` and
  `mise run dev:docker` serve the three apps in their `local-backend`
  configuration against the backend on 8080, with PostgreSQL on 55433.
  A container mode stops and names what to do instead where no Docker answers:
  serve the apps on their mock, and verify backend work with the backend tests
  (`deploy/compose.sh`).
  Run `docker info` before choosing a run mode: choose a container mode only where
  it answers, and where it fails, go straight to the mock and the backend tests.
  `mise run stop` stops every container and keeps the volume.
  `README.md` ("Ports") lists the ports, 4400 and 4410 for Playwright included.
  [references/run-modes.md](references/run-modes.md) has the wiring behind
  each mode.
- **Two images, built through Compose.** `mi-bolt-web` puts the three
  production builds behind NGINX; `mi-bolt-commerce` is the backend. Both read
  named build contexts that a plain `docker build` of their directory does not
  supply; `deploy/compose.yaml` supplies them, and CI builds from that file
  (`.github/workflows/candidate.yml`, "Build both images from the Compose definition").
  `backend/docs/06-uzembe-helyezes.md` ("3. Kép építése és kiadása"), in Hungarian, builds the backend
  image by hand instead, passing its contexts to `docker build` with
  `--build-context`.
- **CI.** `.github/workflows/ci.yml` filters the change with
  `.github/components.yml` and calls up to five reusable workflows, then
  `ci-ok`. On the same pull-request and `main` push events, beside CI rather
  than after it, `.github/workflows/candidate.yml` builds the images
  (`.github/workflows/candidate.yml`, "pull_request:"); the publish, preview-smoke,
  stable-smoke and close-preview workflows run from the default branch. Only
  `.github/workflows/contracts.yml` goes through mise; the other workflows call
  npm, Gradle, `deploy/compose.sh`, uv, Docker and Python directly, and none
  runs a root task.
- **Deploy.** `deploy/helm/mi-bolt/` is the chart for the preview and stable
  environments, which Flux deploys from outside this repository
  (`deploy/helm/mi-bolt/README.md`, "deployment is performed by Flux"); `deploy/candidate/` builds and
  publishes what it installs.
- **Dev tooling.** `deploy/stack.sh` gives a linked worktree a Compose stack of
  its own; `tools/dev-server/dev-server.sh` starts and stops one process on one
  port; `frontend/scripts/serve-static.mjs` serves a production build.
- **`api:drift` checks the frontend clients only** (`mise.toml`, "Fail when the committed frontend API clients differ from the contract"). The
  backend stubs are generated into the Gradle build directory on every build
  (`backend/services/commerce/build.gradle`, "openApiGenerate") and no file of them is tracked.
- **`tools/` is an npm workspace root** with `catalog-import` as its member
  (`tools/package.json`, "workspaces"); its `lint` task is the typecheck and its `build`
  task only prints a line (`tools/mise.toml`, "[tasks.lint]"; `tools/mise.toml`, "[tasks.build]").

## Where to start

| Task | Start at | Example to copy |
|---|---|---|
| a root task | `mise.toml` | `verify` (`mise.toml`, "[tasks.verify]") for a task made of other tasks; `db` (`mise.toml`, "[tasks.db]") for one that runs a command |
| an area task | the area's `mise.toml` | `frontend/mise.toml` ("[tasks.build]"), a `run` list |
| a run mode, a port | `README.md` ("Start the apps: which mode when"), then `mise.toml` ("[tasks.frontend]") | `stack` (`mise.toml`, "[tasks.stack]") |
| a Compose service, a volume, an env var | `deploy/compose.yaml`, `deploy/.env.example` | `deploy/compose.sh` for how every Compose call is made |
| a second stack | `deploy/stack.sh` ("Usage: deploy/stack.sh") | `.github/workflows/smoke.yml` ("COMPOSE_PROJECT_NAME: mi-bolt-smoke-ci") |
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
   (https://mise.jdx.dev/tasks/task-configuration.html, "depends"), or, when
   they must not overlap, as `{ task = … }` entries of a `run` list, which
   mise runs one after another, the way `verify` does. A step that
   has no task of its own goes under `run` and runs from the root, the way
   `stop` runs `deploy/compose.sh down` (`mise.toml`, "[tasks.stop]"). A task
   that runs the contract checks and the frontend contract suite, for
   example, can depend on `//contracts:check`, which
   `mise run //contracts:check` runs alone, and run
   `npm --prefix frontend run test:contract`. That dependency is the OpenAPI
   lint, the sample validation and the PlantUML check together
   (`contracts/mise.toml`, "[tasks.check]"). For the lint alone, move the `vacuum` line
   into a task of its own in `contracts/mise.toml`, list that task under
   `check`'s `depends`, and depend on it from the root, because `vacuum` is
   pinned in that file and nowhere else (see "Pins" above).
3. Name it for what it acts on, prefixed by its owner, the way
   `mise run contracts:check` and `mise run api:drift` are named ("Naming"
   below).
4. Give it a `description`: `mise tasks` prints it, and the two command tables
   repeat it word for word.
5. Add the same row to `README.md` ("Command reference") and to `docs/monorepo.md` ("Root commands").
   Both tables list the other 16 root tasks; `mise run deploy:check`
   (`mise.toml`, "Lint and inspect the MiBolt Helm app chart") is in neither.
6. When the workspace as a whole should pass it, add it to `verify`'s `run` list
   (`mise.toml`, "[tasks.verify]"). What a `verify` run writes, and that a run can leave a
   tracked file outside the change modified, is in
   `mibolt-verification/references/commands.md` ("What a check writes or
   starts").
7. CI never runs a root task, so a check that CI should run also needs a step
   in its workflow; [references/ci-cd.md](references/ci-cd.md) has the shape.
   The edit itself still runs component workflows in CI, because every
   `mise.toml` sits inside at least one component's paths in
   `.github/components.yml`, the root one in four of the five;
   `mibolt-verification` maps a changed path to the components it starts and
   the checks to run locally.

Done when `mise tasks` shows the task with its description, both tables carry
the row, and the checks `mibolt-verification` names for the change pass.

### Wire a check into CI or change a path filter

1. Put the step in the component's reusable workflow, in the shape its other
   jobs have, and keep the matching area task in step with it
   (`frontend/mise.toml`, "[tasks.build]" and `.github/workflows/frontend.yml`, "Production build"
   list the same eight build steps).
2. For a path filter, edit `.github/components.yml`. A change to the `frontend`
   or `backend` list fails `Candidate Build` unless
   `deploy/candidate/inputs.py` ("EXPECTED_FILTERS") and
   `deploy/tests/test-candidate.py` ("def setUp") change with it. Even then the
   `Publish Candidate` workflow fails for that pull request until the change is
   on `main`, because it hashes with the default branch's `inputs.py`
   (`deploy/candidate/publish.py`, "from inputs import", `deploy/candidate/publish.py`, "expected = hashes(source)").
3. Update the table at `docs/monorepo.md` ("Which CI branch runs for which change"), and `frontend/README.md` ("finds a changed path under")
   when the `frontend` list changed.

A new component, a `workflow_run`, `schedule` or `pull_request_target`
workflow, or a trigger that does not fire: read
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
  its own project, volume and ports, and `deploy/stack.sh ports` prints them.
  To stop that stack and keep its data, `deploy/stack.sh stop` stops its
  containers and `deploy/stack.sh down` removes them with their network; both
  keep the volume and the slot (`deploy/stack.sh`, "cmd_stop", `deploy/stack.sh`, "cmd_down").
  `deploy/stack.sh reset --yes` deletes that worktree's volume and frees the
  slot (`deploy/stack.sh`, "cmd_reset"); run it before the worktree is removed.
- **From the main checkout**, where `deploy/stack.sh` refuses to run: export
  `COMPOSE_PROJECT_NAME`, `MIBOLT_POSTGRES_VOLUME` and the three port
  variables (`deploy/.env.example`, "A second stack beside the developer's one"), on ports that neither the table at
  `README.md` ("Ports") nor the slot ranges at `deploy/stack.sh` ("Slot ledger") use, plus
  `MIBOLT_PAYMENT_ORIGIN` and `MIBOLT_SHOP_ORIGIN` set to
  `http://localhost:<web-port>`, then run
  `deploy/compose.sh up -d --build --wait`, the arguments `mise run stack`
  passes (`mise.toml`, "[tasks.stack]"). The wrapper refuses a second project on the
  default volume. Stop it with `deploy/compose.sh down` in that same
  environment, adding `-v` to delete its volume; `mise run stop` without those
  variables stops the default `mi-bolt-local` project instead
  (`deploy/compose.yaml`, "name: mi-bolt-local").

[references/run-modes.md](references/run-modes.md) has the slot arithmetic and
the variables.

### Diagnose a mode, the stack or a workflow that does not start

Read the state before changing anything: `deploy/compose.sh ps` for the
containers and `deploy/compose.sh logs --no-color --tail 300` for their output
(the form `.github/workflows/smoke.yml` ("Stack logs") uses); the wrapper passes every
argument to Compose. Then match the symptom in the table at the end of
[references/run-modes.md](references/run-modes.md) or
[references/ci-cd.md](references/ci-cd.md).

## Rules that apply here

### Where commands run

Run every command from the repository root, in the form its area takes:

- a root task as `mise run` and its name, such as `mise run stack`; `mise tasks`
  lists them with their descriptions. The area tasks behind them, among them
  `setup`, `lint`, `test` and `build` in each of `frontend/`, `backend/` and
  `tools/` and `check` in `contracts/`, are listed by `mise tasks --all` and
  run by their full name, such as `mise run //frontend:build`;
- a script of the Angular workspace as `npm --prefix frontend run` and its
  name, such as `npm --prefix frontend run test:contract`, and one of `tools/`
  the same way, such as `npm --prefix tools run typecheck`;
- a backend Gradle task through the wrapper, with `backend` as the project
  directory and the task under `:services:commerce:`, such as
  `backend/gradlew -p backend :services:commerce:build`;
- one of the repository's own scripts by its path, such as `deploy/compose.sh`,
  `deploy/stack.sh` or `tools/dev-server/dev-server.sh`.

The one exception is a package binary run with `npx` against the Angular
workspace, such as `npx eslint` or `npx prettier`, which runs from `frontend/`.
npx finds its project by walking up from the directory it runs in to the first
one holding a `package.json` or a `node_modules`
(https://docs.npmjs.com/cli/v11/configuring-npm/folders), and the repository
root has no `package.json`, so run there it misses the `node_modules` under
`frontend/` and runs a copy from outside the workspace, one that npx installs
into npm's cache when it has none
(https://docs.npmjs.com/cli/v11/commands/npx), which need not be the version
the workspace pins. The package manager is npm (`frontend/package.json`, "packageManager");
there is no `pnpm`.

A task, npm script or Gradle task that `mise tasks --all`, the "scripts" block
of `frontend/package.json` or `tools/package.json`, or the Gradle build does
not define does not exist here, however familiar the name looks. Read the list
rather than recalling a name: one remembered from another project fails here
on its first run.

### Python tools

Run a Python tool through uv, pinned in the `mise.toml` of the area that uses
it, the way `contracts/mise.toml` ("[tools]") does: `uv` under `[tools]`, the tool
beside it as `"pypi:<name>" = "<version>"`, and `pypi.uvx = true` under
`[settings]`, which has mise install the tool with that uv rather than with
pipx (https://mise.jdx.dev/dev-tools/backends/pipx.html), so it runs at the
same version locally and in CI. Run a one-off tool that no `mise.toml` pins as
`uvx <name>@<version>`, with an exact version
(https://docs.astral.sh/uv/guides/tools/). Install nothing Python with `pip`,
`pipx` or a global or system Python, whose version is whatever that machine
has; where a tool cannot run through uv, ask the user before installing it any
other way.

The deploy checks run through uv with no uv pinned at the root:
`mise run deploy:check` runs
`uv run --no-project --with PyYAML==6.0.2 python deploy/tests/check-chart.py`
(`mise.toml`, "Lint and inspect the MiBolt Helm app chart"), and
`.github/workflows/candidate.yml` ("Check candidate provenance and app chart";
`.github/workflows/candidate.yml`, "Test the worktree stack script") runs all
six `deploy/tests/*.py` checks the same way, `test-stack.py` without PyYAML.

### Naming

Name a script, a script directory, an npm script or a mise task after the
thing it acts on rather than after the technique it uses, and give anything
that belongs to one tool or area that owner's prefix: `contracts:check`,
`deploy:check` and `api:drift` among the root tasks, `fixtures:catalog:check`
among the scripts of `frontend/package.json`, `deploy/candidate/` and
`tools/dev-server/` among the directories. The test is whether a reader who
comes back two days later can tell what the name does without opening the
file.

### No machine-specific paths

Keep every committed file free of paths that exist on one machine only: no
home directory, no `~`, no temp directory, no `file:` URL pointing at a local
checkout. Derive a location at run time or write it repository-relative:
`deploy/compose.sh` ("BASH_SOURCE") and `deploy/stack.sh` ("REPO_ROOT") find their own directory
through `BASH_SOURCE`, `frontend/scripts/serve-static.mjs` ("repoRoot") finds the
repository root from `import.meta.url`, and `deploy/stack.sh` ("SLOTS_DIR=") keeps its
slot ledger under `XDG_STATE_HOME`, falling back to `HOME`. Prose names such a
location generically, as "the user's state directory". A path written for one
machine fails on every other, CI included.

### Wiring conventions

- **Start an Angular dev server through the `start*` npm scripts, never
  `npx ng serve`,** because they carry the Node flag that avoids the V8 abort
  and `npx ng serve` does not (`frontend/package.json`, "--no-turbo-fast-api-calls",
  `frontend/README.md`, "Lazy deopt after a fast API call").
- **Call Compose through `deploy/compose.sh`,** because the volume guard and
  the `.env` creation live there (`deploy/compose.sh`, "must set MIBOLT_POSTGRES_VOLUME", `deploy/compose.sh`, "created deploy/.env").
- **Leave the default volume alone unless the user asks for a reset.** `stop`
  keeps it (`mise.toml`, "[tasks.stop]"), `.github/workflows/smoke.yml` runs `down -v`
  only on a project of its own, and `deploy/stack.sh` refuses the
  `mi-bolt-local` project (`deploy/stack.sh`, "guard_not_default_project"); removing it removes the
  developer's data. The reset is `deploy/compose.sh down -v`, with no project
  or volume variable exported, and then a fresh start
  (`backend/README.md`, "To reload after a content change"). `mibolt-commerce-backend` sends it here for a
  local database that halts on an edited changeset, and it is also what makes
  a changed catalogue or `MIBOLT_DEMO_*` value take effect. Where one of those
  cases calls for it and the user has not asked for a reset, ask the user
  first, because it deletes every local row (`backend/README.md`, "with it every local row").
  Under `mise run backend` and `mise run dev` a changed `MIBOLT_DEMO_*` value
  also has to be exported in the shell the task is run from, because the
  `.env` `deploy/compose.sh` creates reaches the containers only
  ([references/run-modes.md](references/run-modes.md), "Environment
  variables").
- **Pin images by digest,** as every base image in both Dockerfiles and the
  PostgreSQL image in `deploy/compose.yaml` ("image: postgres") are. An image's published tag is
  a hash of tracked files (`deploy/candidate/README.md`, "Image tags use"), so only a
  digest written into a tracked file makes a new base image produce a new tag.
- **Keep YAML on LF:** `.gitattributes` ("*.yaml text eol=lf"), because the builds compare bytes.

## What a change here can reach

| Change | Also update, or expect |
|---|---|
| a root task added, renamed or removed | `README.md` ("Command reference"), `docs/monorepo.md` ("Root commands"); `verify` when it is a gate; the workflow step when CI should run it |
| an area task | the root task that names it as `//area:task`; the CI step that runs the same command |
| a `start*` script | `frontend/mise.toml` ("start:storefront"); Playwright's own `ng serve` command at `frontend/playwright.config.ts` ("ngServeCommand"), which is end-to-end configuration outside this skill |
| a dev-server port or proxy | `frontend/angular.json`, `frontend/proxy*.json`, the ports table at `README.md` ("Ports"), the payment URL defaults at `backend/README.md` ("MIBOLT_PAYMENT_REDIRECT_URL_PREFIX") |
| a Compose port, service or variable | `deploy/.env.example`, `README.md` ("reads three environment variables to move the"), `backend/README.md` ("Environment variables the service reads"), the slot state `deploy/stack.sh` ("write_state") writes, `.github/workflows/smoke.yml` ("COMPOSE_PROJECT_NAME: mi-bolt-smoke-ci"), `.github/workflows/backend.yml` ("MIBOLT_ADMIN_INITIAL_PASSWORD: ci-smoke-admin-password") and `.github/workflows/backend.yml` ("MIBOLT_DB_URL: jdbc:postgresql"), the chart |
| a Compose `build:` block | `deploy/candidate/publish.py` ("expected_builds") on `main` first, `.github/workflows/candidate.yml` ("Build both images from the Compose definition"), `deploy/tests/test-candidate.py` |
| a Dockerfile or NGINX file | `frontend/tests/web-image/` for an NGINX or `robots.txt` rule; expect a new image tag, because the input hash changes |
| the `frontend` or `backend` list in `.github/components.yml` | `deploy/candidate/inputs.py` ("EXPECTED_FILTERS") and `deploy/tests/test-candidate.py` ("def setUp") in the same change, `docs/monorepo.md` ("Which CI branch runs for which change"), and `frontend/README.md` ("finds a changed path under") for the `frontend` list |
| any other list in `.github/components.yml` | `docs/monorepo.md` ("Which CI branch runs for which change") |
| a `workflow_run`, `schedule` or `pull_request_target` workflow, or a script in `deploy/candidate/` | the `deploy/tests/*.py` check that imports the script, where there is one. Those workflows run the default branch's copy of themselves and of the scripts they call, `deploy/candidate/publish.py` and the `deploy/candidate/inputs.py` it imports included (`deploy/candidate/publish.py`, "from inputs import"), so a change there takes effect only once it is on `main`; `.github/workflows/candidate.yml` runs the pull request's own `deploy/candidate/inputs.py` and `deploy/candidate/build_metadata.py` (`.github/workflows/candidate.yml`, "Compute tracked build inputs", `.github/workflows/candidate.yml`, "Record build inputs and archive checksums") |
| the chart | `deploy/helm/mi-bolt/values.schema.json`, `deploy/tests/check-chart.py`, the Secret key list at `deploy/helm/mi-bolt/README.md` ("That Secret must contain") |

## How to verify

- **A task change:** `mise tasks` lists a root task with its description, and
  `mise tasks --all` lists an area task. Both are read-only.
- **A chart change:** `mise run deploy:check`. It needs `helm` and `uv` on the
  PATH, and the root `mise.toml` pins neither; CI installs Helm v4.2.2
  (`.github/workflows/candidate.yml`, "azure/setup-helm").
- **An NGINX or static-server change:**
  `npm --prefix frontend run test:contract`, which collects
  `frontend/tests/web-image/` and `frontend/tests/scripts/` through
  `frontend/vitest.contract.config.ts` ("include"). Those specs read the NGINX files
  and `frontend/Dockerfile` as text and test
  `frontend/scripts/proxy-timeout.mjs`; no spec runs
  `frontend/scripts/serve-static.mjs` itself, which the Playwright suite
  serves the built apps with in CI (`frontend/playwright.config.ts`, "In CI, Playwright runs against the built app").
- **A Dockerfile change:** beyond the `robots.txt` line
  `frontend/tests/web-image/nginx-robots.spec.ts` reads, only building the
  image through Compose exercises it: `mise run stack` locally, and the
  `smoke` and `Candidate Build` workflows in CI
  (`.github/workflows/smoke.yml`, "Start the stack from this commit",
  `.github/workflows/candidate.yml`, "Build both images from the Compose definition").
- **A `tools/dev-server/` change:** `mise run //tools:lint` and
  `mise run //tools:test`; Vitest's default `include` collects
  `tools/dev-server/dev-server.test.ts` (https://vitest.dev/config/include).
- **A `deploy/stack.sh` or `deploy/candidate/*.py` change:** the matching
  `deploy/tests/*.py` check, run with the command
  `.github/workflows/candidate.yml` ("Check candidate provenance and app chart";
  `.github/workflows/candidate.yml`, "Test the worktree stack script") gives it;
  `deploy/candidate/build_metadata.py` has none.
- **A workflow change** runs only on GitHub; nothing local executes a workflow.
- **A change a browser can reach** is verified in a real browser, on the mode
  that serves the changed app: `mibolt-verification` ("Browser pass") says
  what that pass consists of.

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
for the chart; `backend/docs/04-adatbazis.md` ("Egy git worktree-nek saját stackje van"), in Hungarian, for the
worktree stack; `backend/docs/06-uzembe-helyezes.md`, in Hungarian, for
building and running the backend image by hand, which states that no hosting
platform has been chosen (`backend/docs/06-uzembe-helyezes.md`, "kiválasztott hoszting platformja nincs").

## Keep this skill current

This skill goes stale when any of these change: the five `mise.toml` files; the
"scripts" blocks of `frontend/package.json` and `tools/package.json`; the
`serve` and `build` targets in `frontend/angular.json` and the
`frontend/proxy*.json` files; anything under `deploy/` or `.github/`; the two Dockerfiles,
`frontend/.dockerignore`, `frontend/nginx/`, `frontend/tests/web-image/` and
`frontend/tests/scripts/`; `tools/dev-server/`,
`frontend/scripts/serve-static.mjs`, `frontend/scripts/proxy-timeout.mjs` and
`frontend/playwright.config.ts` ("ngServeCommand"); `.gitattributes` and `.gitignore`; the
ports and command tables in `README.md` and `docs/monorepo.md`, the variable
table at `backend/README.md` ("Environment variables the service reads"), the CI prose at
`frontend/README.md` ("🧪 CI") and `backend/docs/06-uzembe-helyezes.md`. When you
edit one of those, or any other file this skill or its references cite,
reread each section of that file they cite against the claim beside it: a
citation names its target (a heading, task, function, key or distinctive
phrase) and never gives a line number, and the checker below only confirms
that the name still occurs somewhere in the file; a name that is gone fails.
Where this skill names the edited file without a section name, or covers it
only through a directory, as it covers
`deploy/helm/mi-bolt/templates/ingress.yaml`, reread what this skill and its
references say about that file and about each directory above it.

Check the cited paths, section names and commands with
`node mibolt-project-map/scripts/check-skill-references.mjs mibolt-workspace-ops`,
run from the directory that holds the MiBolt skills. Run the checker again
after an edit to `mibolt-verification`, whose "Browser pass" and "What a check
writes or starts" sections this skill cites by name: its check (e) fails such a
citation only once the name occurs nowhere in the skill or file it names, so
also reread each section against the sentence here that cites it.
