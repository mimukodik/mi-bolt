# Local run modes

Every path is relative to the repository root. Starting and stopping any mode
below is the orchestrator's, never a spawned agent's:
`.claude/rules/session-lifecycle.md` ("Tools and startup") owns that rule and
`.claude/rules/parallel-spawns.md` ("What a batch shares") explains why a port
and the database are shared.

## Contents

- [The modes](#the-modes)
- [How a frontend mode reaches `ng serve`](#how-a-frontend-mode-reaches-ng-serve)
- [How a container mode reaches Compose](#how-a-container-mode-reaches-compose)
- [Environment variables](#environment-variables)
- [A second stack beside the default one](#a-second-stack-beside-the-default-one)
- [Serving a built app or a dev server on a port of your own](#serving-a-built-app-or-a-dev-server-on-a-port-of-your-own)
- [When a mode does not start](#when-a-mode-does-not-start)

## The modes

`README.md:81-227` gives each mode with when to pick it; this table is the
wiring behind them.

| Command | Defined at | Starts | Ports | Stop |
|---|---|---|---|---|
| `mise run storefront` | `mise.toml:19-21`, `frontend/mise.toml:29-30` | `ng serve storefront`, `development` configuration, in-page MSW | 4200 | Ctrl+C |
| `mise run admin` | `mise.toml:23-25`, `frontend/mise.toml:35-36` | `ng serve admin`, `development` configuration, in-page MSW | 4220 | Ctrl+C |
| `mise run payment` | `mise.toml:27-29`, `frontend/mise.toml:41-42` | `ng serve demo-payment`, `development` configuration; `frontend/projects/demo-payment/src/main.ts` starts its mock while `isDevMode()` is true | 4210 | Ctrl+C |
| `mise run frontend` | `mise.toml:15-17` | the three above together | 4200, 4210, 4220 | Ctrl+C |
| `mise run db` | `mise.toml:31-33` | `deploy/compose.sh up -d --wait postgres` | 55433 | `mise run stop` |
| `mise run backend` | `mise.toml:35-38`, `backend/mise.toml:15-16` | `db`, then Gradle `bootRun` in the foreground | 8080, 55433 | Ctrl+C, then `mise run stop` |
| `mise run backend:docker` | `mise.toml:40-42` | `deploy/compose.sh up -d --build --wait postgres commerce` | 8080, 55433 | `mise run stop` |
| `mise run dev` | `mise.toml:44-46` | the three `start:*:local-backend` area tasks and, beside them, `mise run backend` | 4200, 4210, 4220, 8080, 55433 | Ctrl+C, then `mise run stop` |
| `mise run dev:docker` | `mise.toml:48-50` | the three `start:*:local-backend` area tasks and, beside them, `mise run backend:docker` | 4200, 4210, 4220, 8080, 55433 | Ctrl+C, then `mise run stop` |
| `mise run stack` | `mise.toml:52-56` | every Compose service, built, with the payment redirect and return pointed at the web origin | 4200, 8080, 55433 | `mise run stop` |
| `mise run stop` | `mise.toml:58-60` | `deploy/compose.sh down`; the PostgreSQL volume keeps its data | — | — |

**`depends` entries run in parallel.** mise runs whatever it can in parallel up
to `--jobs` (setting `jobs`, variable `MISE_JOBS`), which is what lets
`frontend`, `dev` and `dev:docker` hold several long-running servers at once
(https://mise.jdx.dev/tasks/task-configuration.html, "depends";
https://mise.jdx.dev/cli/run.html). `backend` is the exception in shape: it
lists `db` under `depends` and then runs `mise run //backend:run` itself.

## How a frontend mode reaches `ng serve`

**The chain is root task, area task, npm script, Node.** `mise run storefront`
depends on `//frontend:start:storefront` (`mise.toml:19-21`), which runs
`npm start` (`frontend/mise.toml:29-30`), whose script at
`frontend/package.json:6` reads
`"start": "node --no-turbo-fast-api-calls node_modules/@angular/cli/bin/ng.js serve storefront"`;
npm runs a script from its package's root, so that `node_modules` is the one
under `frontend/`
(https://docs.npmjs.com/cli/v11/using-npm/scripts, "Working Directory for
Scripts"). The six `start*` scripts at `frontend/package.json:6-11` all carry
that Node flag; `frontend/README.md:30` records why (a V8 abort on Node
26.10.0 under load, and `NODE_OPTIONS` refuses the flag). Start a dev server
through those scripts, never `npx ng serve`.

**Ports and base paths come from `frontend/angular.json`.** `demo-payment`
serves on 4210 under `/demo-fizetes` (`frontend/angular.json:194-207`) and
`admin` on 4220 under `/admin` (`frontend/angular.json:338-357`). The
storefront's `serve` target sets no `port` (`frontend/angular.json:93-108`);
the ports table at `README.md:229-239` lists it on 4200.

**The `local-backend` configuration is what `dev` and `dev:docker` serve.** It
swaps in `environment.local-backend.ts` for the storefront
(`frontend/angular.json:79-89`) and the admin
(`frontend/angular.json:319-329`), so the in-page MSW mock stays off, and
points their dev-server proxy at `frontend/proxy.local-backend.conf.json`
(`/api` to port 8080). The payment app's `local-backend` serves its
`production` build (`frontend/angular.json:205`), where its mock never starts,
and every `demo-payment` configuration proxies `/api` to 8080 through
`frontend/proxy.payment.conf.json`. The storefront's default `serve` uses
`frontend/proxy.conf.json`, which forwards `/demo-fizetes` to 4210.

## How a container mode reaches Compose

**Every container mode goes through `deploy/compose.sh`, never `docker compose`
directly.** The wrapper:

- refuses, exit 1, a `COMPOSE_PROJECT_NAME` other than `mi-bolt-local` that
  keeps the default PostgreSQL volume, so two servers never share one data
  directory (`deploy/compose.sh:10-17`);
- creates the gitignored `.env` beside the Compose file from
  `deploy/.env.example` on first use (`deploy/compose.sh:19-22`,
  `.gitignore:321`);
- runs the `docker compose` plugin when it answers, otherwise the standalone
  `docker-compose`, with every argument passed through, and exits 127 when
  neither exists (`deploy/compose.sh:24-30`).

Compose reads that `.env` from the directory of the first `-f` file, and a
variable already set in the shell wins over it
(https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/).

**`deploy/compose.yaml` holds three services and one volume.** `postgres`
(digest-pinned image, `pg_isready` health check, `deploy/compose.yaml:9-26`),
`commerce` (the `mi-bolt-commerce` image, healthy once
`/api/v1/actuator/health/readiness` answers, `deploy/compose.yaml:28-56`) and
`web` (the `mi-bolt-web` image, started after `commerce` is healthy,
`deploy/compose.yaml:58-71`); the volume is named by `MIBOLT_POSTGRES_VOLUME`
(`deploy/compose.yaml:73-75`). The Compose project is `mi-bolt-local`
(`deploy/compose.yaml:6`). `--wait` waits for services to be running or healthy
and implies detached mode
(https://docs.docker.com/reference/cli/docker/compose/up/).

**`stack` is the only mode that moves the payment URLs.** Its `run` line sets
`MIBOLT_PAYMENT_ORIGIN` and `MIBOLT_SHOP_ORIGIN` to the web origin
(`mise.toml:52-56`), because the web container serves the payment app too;
`deploy/compose.yaml:44-45` derives the backend's redirect and return prefixes
from them, defaulting to the dev servers' 4210 and 4200 for
`mise run backend:docker` and `mise run dev:docker`.

## Environment variables

Names and purposes only. The defaults live in the files named, and
`deploy/.env.example` is the list a developer edits.

| Variable | Read by | Purpose |
|---|---|---|
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | `deploy/compose.yaml:12-15`, `deploy/compose.yaml:41-43` | the database, its user and its password; the password is required and comes from the `.env` `deploy/compose.sh` creates |
| `MIBOLT_POSTGRES_PORT`, `MIBOLT_BACKEND_PORT`, `MIBOLT_WEB_PORT` | `deploy/compose.yaml:18`, `deploy/compose.yaml:50`, `deploy/compose.yaml:71` | host ports of the three services (`README.md:241-243`) |
| `MIBOLT_POSTGRES_VOLUME` | `deploy/compose.yaml:75`, `deploy/compose.sh:13` | the PostgreSQL volume's name |
| `COMPOSE_PROJECT_NAME` | Compose, `deploy/compose.sh:12` | overrides the `mi-bolt-local` project name (https://docs.docker.com/compose/how-tos/project-name/) |
| `MIBOLT_PAYMENT_ORIGIN`, `MIBOLT_SHOP_ORIGIN` | `deploy/compose.yaml:44-45` | origins the backend's payment redirect and return prefixes are built from |
| `MIBOLT_DB_URL`, `MIBOLT_DB_USER`, `MIBOLT_DB_PASSWORD` | the backend; Compose sets them at `deploy/compose.yaml:41-43` | the backend's database connection |
| `MIBOLT_ADMIN_INITIAL_PASSWORD` | the backend | the password of the admin account the backend bootstraps; `backend/README.md:26` says what happens when it is empty |
| `MIBOLT_DEMO_USERNAME`, `MIBOLT_DEMO_PASSWORD` | the backend | the demo-gate user, read only while the `demo_user` table is empty (`backend/README.md:27-28`) |
| `MIBOLT_CATALOG_PATH` | the backend | where the catalogue is loaded from; the image sets it (`backend/services/commerce/Dockerfile:29`) |
| `BACKEND_ORIGIN` | the web image's NGINX | where `/api/` is proxied; Compose points it at `commerce` (`deploy/compose.yaml:68-69`) |

`backend/README.md:19-31` owns the full list of what the backend reads.

## A second stack beside the default one

**From a linked worktree, use `deploy/stack.sh`.** Its usage is at
`deploy/stack.sh:9-26`. `deploy/stack.sh up --build` claims one of 20 slots in
a machine-wide ledger kept in the user's state directory
(`MIBOLT_STACK_SLOTS_DIR` overrides it, `deploy/stack.sh:44`), gives the
worktree its own project name, volume and three ports (web 4600, backend 8100
and PostgreSQL 55500, each plus the slot number, `deploy/stack.sh:36-42`),
remembers them in a gitignored state file beside the Compose file
(`.gitignore:322`), and points the payment origins at its own web port
(`deploy/stack.sh:367-383`). `ports` and `status` print the claim, `health`
checks its PostgreSQL, and `stop` and `down` keep the volume. Run
`deploy/stack.sh reset --yes` before removing the worktree: it deletes that
worktree's volume and frees the slot, and without it the container, the volume
and the port outlive the worktree (`backend/docs/04-adatbazis.md:62-66`, in
Hungarian). Pass `--build` when the stack has to run this checkout's code: both
image names are fixed (`deploy/compose.yaml:29`, `deploy/compose.yaml:59`), and
without `--build` Compose first looks for an image of that name in the registry
or the local cache and builds only when it finds none
(https://docs.docker.com/reference/compose-file/build/, "Using build and
image").

**From the main checkout, `deploy/stack.sh` refuses** (exit 2,
`deploy/stack.sh:72-87`). SKILL.md ("Run a second stack beside the default
one") gives the variables to export, the `deploy/compose.sh` arguments, and
how to stop that stack without stopping the default `mi-bolt-local` one.
`.github/workflows/smoke.yml:19-25` sets the project, the volume and the
origins the same way in CI, where the default ports are free.

## Serving a built app or a dev server on a port of your own

**`frontend/scripts/serve-static.mjs` serves a production build.** It listens
on `HOST`, `127.0.0.1` by default, and `PORT`, 4200 by default, and reads
`MI_BOLT_API_PROXY`, `MI_BOLT_API_PROXY_TIMEOUT_MS`,
`MI_BOLT_PAYMENT_STATIC_DIR` and `MI_BOLT_PAYMENT_ONLY`, which its header
describes (`frontend/scripts/serve-static.mjs:24-50`), and
`MI_BOLT_E2E_STATIC_DIR`, the directory it serves, `dist/storefront/browser`
under `frontend/` by default (`frontend/scripts/serve-static.mjs:63-67`).
`frontend/README.md:22` gives the two invocations for the shop and the payment
app. `frontend/scripts/proxy-timeout.mjs` parses the timeout, and
`frontend/tests/scripts/proxy-timeout.spec.ts` tests it.

**`tools/dev-server/dev-server.sh` starts, stops and reports one process on one
port.** Usage is at `tools/dev-server/dev-server.sh:10-16`:
`start <port> -- <command>`, `stop <port>`, `status <port>`. It records a pid
plus the process start time, so it never stops a process it did not start
(`owned_pid`, `tools/dev-server/dev-server.sh:41-53`). `start` exits 3 when it
already manages the port, 4 when another process holds it, 5 when the command
dies before listening and 6 when it does not listen within
`DEV_SERVER_START_TIMEOUT` seconds; `stop` exits 2 with no pid file and 7 when
the port is still taken afterwards. `DEV_SERVER_STATE_DIR` moves its pid and
log files. `tools/dev-server/dev-server.test.ts` covers it.

## When a mode does not start

| Symptom | Cause | Where |
|---|---|---|
| mise refuses to parse a config file | the tree is not trusted yet | `mise trust --all`, `README.md:31-39` |
| Compose stops on `POSTGRES_PASSWORD` | Compose ran without `deploy/compose.sh`, so no `.env` exists | `deploy/compose.yaml:15`, `deploy/compose.sh:19-22` |
| `compose.sh: project … must set MIBOLT_POSTGRES_VOLUME` | a second project on the default volume | `deploy/compose.sh:10-17` |
| `compose.sh: neither 'docker compose' nor 'docker-compose' is installed`, exit 127 | no Compose | `deploy/compose.sh:24-30` |
| `stack.sh: this is the main checkout…` or `HEAD is detached`, exit 2 | wrong checkout for `deploy/stack.sh` | `deploy/stack.sh:72-87` |
| `stack.sh: no free slot among 20` | every slot claimed | `deploy/stack.sh slots`, then `deploy/stack.sh prune --yes` for worktrees that no longer exist |
| `up --wait` fails on `commerce` | readiness answers only after the catalogue loader and the admin bootstrap have run (`backend/services/commerce/src/main/resources/application.properties:67-68`); the health check allows a 20-second start period and 30 retries 5 seconds apart | `deploy/compose.yaml:51-56`; read `deploy/compose.sh logs commerce` |
| a port is already bound | another mode, a second stack or a leftover static server holds it | the ports table at `README.md:229-239`; `tools/dev-server/dev-server.sh status <port>` for a server it started |
| the payment step redirects to 4210 under the full stack | Compose ran without the origin variables `mise run stack` sets | `mise.toml:52-56` |
| a changed `MIBOLT_DEMO_*` value has no effect | the demo user is created only while its table is empty, and `stop` keeps the volume | `backend/README.md:27-28` |
| `docker build frontend/` fails on `catalog` | the image needs the named `catalog` context, which a plain `docker build` does not supply; build through Compose | `frontend/Dockerfile:3-6` |
| the dev server aborts with "Lazy deopt after a fast API call" | `ng serve` started without the `start*` scripts | `frontend/README.md:30` |
| PostgreSQL still runs after Ctrl+C in `backend` or `dev` | Ctrl+C stops only the foreground processes | `mise run stop` (`README.md:156-159`) |
