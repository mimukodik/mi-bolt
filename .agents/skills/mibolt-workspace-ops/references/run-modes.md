# Local run modes

Every path is relative to the repository root, except `SKILL.md`, which is
this skill's own file.

## Contents

- [The modes](#the-modes)
- [How a frontend mode reaches `ng serve`](#how-a-frontend-mode-reaches-ng-serve)
- [How a container mode reaches Compose](#how-a-container-mode-reaches-compose)
- [Environment variables](#environment-variables)
- [A second stack beside the default one](#a-second-stack-beside-the-default-one)
- [Serving a built app or a dev server on a port of your own](#serving-a-built-app-or-a-dev-server-on-a-port-of-your-own)
- [When a mode does not start](#when-a-mode-does-not-start)

## The modes

`SKILL.md` ("Run modes") says which modes serve the apps on the in-page MSW
mock, which start containers, and that `mise run stop` keeps the volume;
`README.md` ("Start the apps: which mode when") gives each mode with when to
pick it. This table is the wiring behind them, with each mode's ports and how
to stop it.

| Command | Defined at | Runs | Ports | Stop |
|---|---|---|---|---|
| `mise run storefront` | `mise.toml` ("[tasks.storefront]"), `frontend/mise.toml` ("start:storefront") | `ng serve storefront`, `development` configuration | 4200 | Ctrl+C |
| `mise run admin` | `mise.toml` ("[tasks.admin]"), `frontend/mise.toml` ("start:admin") | `ng serve admin`, `development` configuration | 4220 | Ctrl+C |
| `mise run payment` | `mise.toml` ("[tasks.payment]"), `frontend/mise.toml` ("start:payment") | `ng serve demo-payment`, `development` configuration; `frontend/projects/demo-payment/src/main.ts` starts its mock while `isDevMode()` is true | 4210 | Ctrl+C |
| `mise run frontend` | `mise.toml` ("[tasks.frontend]") | the three above together | 4200, 4210, 4220 | Ctrl+C |
| `mise run db` | `mise.toml` ("[tasks.db]") | `deploy/compose.sh up -d --wait postgres` | 55433 | `mise run stop` |
| `mise run backend` | `mise.toml` ("[tasks.backend]"), `backend/mise.toml` ("[tasks.run]") | `db`, then Gradle `bootRun` in the foreground | 8080, 55433 | Ctrl+C, then `mise run stop` |
| `mise run backend:docker` | `mise.toml` ("The backend in its container (the mi-bolt-commerce image)") | `deploy/compose.sh up -d --build --wait postgres commerce` | 8080, 55433 | `mise run stop` |
| `mise run dev` | `mise.toml` ("[tasks.dev]") | the three `start:*:local-backend` area tasks and, beside them, `mise run backend` | 4200, 4210, 4220, 8080, 55433 | Ctrl+C, then `mise run stop` |
| `mise run dev:docker` | `mise.toml` ("The three apps against the backend container") | the three `start:*:local-backend` area tasks and, beside them, `mise run backend:docker` | 4200, 4210, 4220, 8080, 55433 | Ctrl+C, then `mise run stop` |
| `mise run stack` | `mise.toml` ("[tasks.stack]") | every Compose service, built, with the payment redirect and return pointed at the web origin | 4200, 8080, 55433 | `mise run stop` |
| `mise run stop` | `mise.toml` ("[tasks.stop]") | `deploy/compose.sh down` | — | — |

**`depends` entries run in parallel.** mise runs whatever it can in parallel up
to `--jobs` (setting `jobs`, variable `MISE_JOBS`), which is what lets
`frontend` hold several long-running servers at once
(https://mise.jdx.dev/tasks/task-configuration.html, "depends";
https://mise.jdx.dev/cli/run.html). `backend` lists `db` under `depends` and
then runs `mise run //backend:run` itself, and `dev` and `dev:docker` run the
hidden `docker:check` (`deploy/compose.sh check`) first and start their
servers together only once it passes.

## How a frontend mode reaches `ng serve`

**The chain is root task, area task, npm script, Node.** `mise run storefront`
depends on `//frontend:start:storefront` (`mise.toml`, "[tasks.storefront]"), which runs
`npm start` (`frontend/mise.toml`, "start:storefront"), whose script at
`frontend/package.json` ("scripts") reads
`"start": "node --no-turbo-fast-api-calls node_modules/@angular/cli/bin/ng.js serve storefront"`;
npm runs a script from its package's root, so that `node_modules` is the one
under `frontend/`
(https://docs.npmjs.com/cli/v11/using-npm/scripts, "Working Directory for
Scripts"). The six `start*` scripts at `frontend/package.json` ("--no-turbo-fast-api-calls") all carry
that Node flag; `frontend/README.md` ("the dev server aborted under e2e load") records why (a V8 abort on Node
26.10.0 under load, and `NODE_OPTIONS` refuses the flag). Start a dev server
through those scripts, never `npx ng serve`.

**Ports and base paths come from `frontend/angular.json`.** `demo-payment`
serves on 4210 under `/demo-fizetes` (`frontend/angular.json`, "4210") and
`admin` on 4220 under `/admin` (`frontend/angular.json`, "4220"). The
storefront's `serve` target sets no `port` (`frontend/angular.json`, "proxy.conf.json");
the ports table at `README.md` ("Ports") lists it on 4200.

**The `local-backend` configuration is what `dev` and `dev:docker` serve.** It
swaps in `environment.local-backend.ts` for the storefront
(`frontend/angular.json`, "projects/storefront/src/environments/environment.local-backend.ts") and the admin
(`frontend/angular.json`, "projects/admin/src/environments/environment.local-backend.ts"), so the in-page MSW mock stays off, and
points their dev-server proxy at `frontend/proxy.local-backend.conf.json`
(`/api` to port 8080). The payment app's `local-backend` serves its
`production` build (`frontend/angular.json`, "demo-payment:build:production"), where its mock never starts,
and every `demo-payment` configuration proxies `/api` to 8080 through
`frontend/proxy.payment.conf.json`. The storefront's default `serve` uses
`frontend/proxy.conf.json`, which forwards `/demo-fizetes` to 4210.

## How a container mode reaches Compose

**Every container mode goes through `deploy/compose.sh`, never `docker compose`
directly.** The wrapper:

- refuses, exit 1, a `COMPOSE_PROJECT_NAME` other than `mi-bolt-local` that
  keeps the default PostgreSQL volume, so two servers never share one data
  directory (`deploy/compose.sh`, "must set MIBOLT_POSTGRES_VOLUME");
- creates the gitignored `.env` beside the Compose file from
  `deploy/.env.example` on first use (`deploy/compose.sh`, "created deploy/.env",
  `.gitignore`, "/deploy/.env");
- exits 127 when no Docker answers, before running Compose at all, naming
  the alternatives `SKILL.md` ("Run modes") gives (`deploy/compose.sh`);
- runs the `docker compose` plugin when it answers, otherwise the standalone
  `docker-compose`, with every argument passed through, and exits 127 when
  neither exists (`deploy/compose.sh`).

Compose reads that `.env` from the directory of the first `-f` file, and a
variable already set in the shell wins over it
(https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/).

**`deploy/compose.yaml` holds three services and one volume.** `postgres`
(digest-pinned image, `pg_isready` health check, `deploy/compose.yaml`, "pg_isready -U"),
`commerce` (the `mi-bolt-commerce` image, healthy once
`/api/v1/actuator/health/readiness` answers, `deploy/compose.yaml`, "/api/v1/actuator/health/readiness") and
`web` (the `mi-bolt-web` image, started after `commerce` is healthy,
`deploy/compose.yaml`, "image: mi-bolt-web"); the volume is named by `MIBOLT_POSTGRES_VOLUME`
(`deploy/compose.yaml`, "MIBOLT_POSTGRES_VOLUME:-mi-bolt-postgres-data"). The Compose project is `mi-bolt-local`
(`deploy/compose.yaml`, "name: mi-bolt-local"). `--wait` waits for services to be running or healthy
and implies detached mode
(https://docs.docker.com/reference/cli/docker/compose/up/).

**`stack` is the only mode that moves the payment URLs.** Its `run` line sets
`MIBOLT_PAYMENT_ORIGIN` and `MIBOLT_SHOP_ORIGIN` to the web origin
(`mise.toml`, "[tasks.stack]"), because the web container serves the payment app too;
`deploy/compose.yaml` ("MIBOLT_PAYMENT_REDIRECT_URL_PREFIX") derives the backend's redirect and return prefixes
from them, defaulting to the dev servers' 4210 and 4200 for
`mise run backend:docker` and `mise run dev:docker`.

## Environment variables

Names and purposes only. The defaults live in the files named, and
`deploy/.env.example` is the list a developer edits. The `.env`
`deploy/compose.sh` creates from it reaches the containers only. In
`mise run backend` and `mise run dev` the backend is a plain `bootRun`
(`backend/mise.toml`, "[tasks.run]"), so each variable the table lists as read by the
backend comes from the shell the task is run from, or else from the default
the backend carries for it (`deploy/.env.example`, "The backend started natively"). Export a native-mode
override in that shell before the task runs.

| Variable | Read by | Purpose |
|---|---|---|
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | `deploy/compose.yaml` ("environment: POSTGRES_DB:"), `deploy/compose.yaml` ("MIBOLT_DB_URL:") | the database, its user and its password; the password is required and comes from the `.env` `deploy/compose.sh` creates |
| `MIBOLT_POSTGRES_PORT`, `MIBOLT_BACKEND_PORT`, `MIBOLT_WEB_PORT` | `deploy/compose.yaml` ("MIBOLT_POSTGRES_PORT:-55433"), `deploy/compose.yaml` ("MIBOLT_BACKEND_PORT:-8080"), `deploy/compose.yaml` ("MIBOLT_WEB_PORT:-4200") | host ports of the three services (`README.md`, "reads three environment variables to move the") |
| `MIBOLT_POSTGRES_VOLUME` | `deploy/compose.yaml` ("MIBOLT_POSTGRES_VOLUME:-mi-bolt-postgres-data"), `deploy/compose.sh` ("MIBOLT_POSTGRES_VOLUME:-mi-bolt-postgres-data") | the PostgreSQL volume's name |
| `COMPOSE_PROJECT_NAME` | Compose, `deploy/compose.sh` ("COMPOSE_PROJECT_NAME:-mi-bolt-local") | overrides the `mi-bolt-local` project name (https://docs.docker.com/compose/how-tos/project-name/) |
| `MIBOLT_PAYMENT_ORIGIN`, `MIBOLT_SHOP_ORIGIN` | `deploy/compose.yaml` ("MIBOLT_PAYMENT_REDIRECT_URL_PREFIX") | origins the backend's payment redirect and return prefixes are built from |
| `MIBOLT_DB_URL`, `MIBOLT_DB_USER`, `MIBOLT_DB_PASSWORD` | the backend; Compose sets them at `deploy/compose.yaml` ("MIBOLT_DB_URL:") | the backend's database connection |
| `MIBOLT_ADMIN_INITIAL_PASSWORD` | the backend | the password of the admin account the backend bootstraps; `backend/README.md` ("a generated password is printed once at WARN") says what happens when it is empty |
| `MIBOLT_DEMO_USERNAME`, `MIBOLT_DEMO_PASSWORD` | the backend | the demo-gate user, read only while the `demo_user` table is empty (`backend/README.md`, "MIBOLT_DEMO_USERNAME") |
| `MIBOLT_CATALOG_PATH` | the backend | where the catalogue is loaded from; the image sets it (`backend/services/commerce/Dockerfile`, "ENV MIBOLT_CATALOG_PATH") |
| `BACKEND_ORIGIN` | the web image's NGINX | where `/api/` is proxied; Compose points it at `commerce` (`deploy/compose.yaml`, "BACKEND_ORIGIN") |

`backend/README.md` ("Environment variables the service reads") owns the full list of what the backend reads.

## A second stack beside the default one

**From a linked worktree, use `deploy/stack.sh`.** `SKILL.md` ("Run a second
stack beside the default one") gives the commands that claim a slot, print
its ports, stop the stack and free the slot. Its usage is at
`deploy/stack.sh` ("Usage: deploy/stack.sh"). A slot is one of 20 in
a machine-wide ledger kept in the user's state directory
(`MIBOLT_STACK_SLOTS_DIR` overrides it, `deploy/stack.sh`, "MIBOLT_STACK_SLOTS_DIR"); its
three ports are web 4600, backend 8100
and PostgreSQL 55500, each plus the slot number (`deploy/stack.sh`, "Slot ledger").
The claim is remembered in a gitignored state file beside the Compose file
(`.gitignore`, "/deploy/.worktree-stack.env"), and the payment origins point at its own web port
(`deploy/stack.sh`, "write_state() {"). `status` also prints the claim, and `health`
checks its PostgreSQL. Without `deploy/stack.sh reset --yes` the container, the volume
and the port outlive the worktree (`backend/docs/04-adatbazis.md`, "Egy git worktree-nek saját stackje van", in
Hungarian). Pass `--build` when the stack has to run this checkout's code: both
image names are fixed (`deploy/compose.yaml`, "image: mi-bolt-commerce", `deploy/compose.yaml`, "image: mi-bolt-web"), and
without `--build` Compose first looks for an image of that name in the registry
or the local cache and builds only when it finds none
(https://docs.docker.com/reference/compose-file/build/, "Using build and
image").

**From the main checkout**, `deploy/stack.sh` exits 2
(`deploy/stack.sh`, "require_worktree() {"). `SKILL.md` ("Run a second stack beside the default
one") gives the variables to export, the `deploy/compose.sh` arguments, and
how to stop that stack without stopping the default `mi-bolt-local` one.
`.github/workflows/smoke.yml` ("COMPOSE_PROJECT_NAME: mi-bolt-smoke-ci") sets the project, the volume and the
origins the same way in CI, where the default ports are free.

## Serving a built app or a dev server on a port of your own

**`frontend/scripts/serve-static.mjs` serves a production build.** It listens
on `HOST`, `127.0.0.1` by default, and `PORT`, 4200 by default, and reads
`MI_BOLT_API_PROXY`, `MI_BOLT_API_PROXY_TIMEOUT_MS`,
`MI_BOLT_PAYMENT_STATIC_DIR` and `MI_BOLT_PAYMENT_ONLY`, which its header
describes (`frontend/scripts/serve-static.mjs`, "// Environment:"), and
`MI_BOLT_E2E_STATIC_DIR`, the directory it serves, `dist/storefront/browser`
under `frontend/` by default (`frontend/scripts/serve-static.mjs`, "MI_BOLT_E2E_STATIC_DIR").
`frontend/README.md` ("through two static hosts") gives the two invocations for the shop and the payment
app. `frontend/scripts/proxy-timeout.mjs` parses the timeout, and
`frontend/tests/scripts/proxy-timeout.spec.ts` tests it.

**`tools/dev-server/dev-server.sh` starts, stops and reports one process on one
port.** Usage is at `tools/dev-server/dev-server.sh` ("usage()"):
`start <port> -- <command>`, `stop <port>`, `status <port>`. It records a pid
plus the process start time, so it never stops a process it did not start
(`tools/dev-server/dev-server.sh`, "owned_pid() {"). `start` exits 3 when it
already manages the port, 4 when another process holds it, 5 when the command
dies before listening and 6 when it does not listen within
`DEV_SERVER_START_TIMEOUT` seconds; `stop` exits 2 with no pid file and 7 when
the port is still taken afterwards. `DEV_SERVER_STATE_DIR` moves its pid and
log files. `tools/dev-server/dev-server.test.ts` covers it.

## When a mode does not start

| Symptom | Cause | Where |
|---|---|---|
| mise refuses to parse a config file | the tree is not trusted yet | `mise trust --all`, `README.md` ("mise refuses to parse a config file") |
| Compose stops on `POSTGRES_PASSWORD` | Compose ran without `deploy/compose.sh`, so no `.env` exists | `deploy/compose.yaml` ("POSTGRES_PASSWORD:?copy deploy/.env.example"), `deploy/compose.sh` ("created deploy/.env") |
| `compose.sh: project … must set MIBOLT_POSTGRES_VOLUME` | a second project on the default volume | `deploy/compose.sh` ("must set MIBOLT_POSTGRES_VOLUME") |
| `compose.sh: neither 'docker compose' nor 'docker-compose' is installed`, exit 127 | no Compose | `deploy/compose.sh` |
| `compose.sh: no Docker answers here`, exit 127 | no `docker` command, or no Docker daemon answers | `deploy/compose.sh` |
| `stack.sh: this is the main checkout…` or `HEAD is detached`, exit 2 | wrong checkout for `deploy/stack.sh` | `deploy/stack.sh` ("require_worktree() {") |
| `stack.sh: no free slot among 20` | every slot claimed | `deploy/stack.sh slots`, then `deploy/stack.sh prune --yes` for worktrees that no longer exist |
| `up --wait` fails on `commerce` | readiness answers only after the catalogue loader and the admin bootstrap have run (`backend/services/commerce/src/main/resources/application.properties`, "Readiness probe for the Compose health check"); the health check allows a 20-second start period and 30 retries 5 seconds apart | `deploy/compose.yaml` ("actuator/health/readiness"); read `deploy/compose.sh logs commerce` |
| a port is already bound | another mode, a second stack or a leftover static server holds it | the ports table at `README.md` ("Ports"); `tools/dev-server/dev-server.sh status <port>` for a server it started |
| the payment step redirects to 4210 under the full stack | Compose ran without the origin variables `mise run stack` sets | `mise.toml` ("[tasks.stack]") |
| a changed `MIBOLT_DEMO_*` value has no effect | the demo user is created only while its table is empty, and `stop` keeps the volume; in `mise run backend` and `mise run dev`, also a value edited in the `.env` beside the Compose file, which never reaches `bootRun` | `backend/README.md` ("MIBOLT_DEMO_USERNAME"); for the native backend, "Environment variables" above |
| `docker build frontend/` fails on `catalog` | the image needs the named `catalog` context, which a plain `docker build` does not supply; build through Compose | `frontend/Dockerfile` ("The demo catalogue comes in as the named build context") |
| the dev server aborts with "Lazy deopt after a fast API call" | `ng serve` started without the `start*` scripts | `frontend/README.md` ("Lazy deopt after a fast API call") |
| PostgreSQL still runs after Ctrl+C in `backend` or `dev` | Ctrl+C stops only the foreground processes | `mise run stop` (`README.md`, "Stop the backend with Ctrl+C") |
