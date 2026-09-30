# MiBolt monorepo

One repository for the MiBolt demo webshop: the Angular frontend, the
Spring Boot backend, the shared API contract, the catalogue data, the
deployment compose file, and the import/agent tooling. This page is the map;
`README.md` and `backend/README.md` carry the detail.

## Where everything lives

| Path                       | Holds                                                                                                                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/`                | The Angular workspace (Angular CLI 22), with its three apps under `frontend/projects/`: `storefront` (the shop), `admin` (the admin app) and `demo-payment` (the demo payment gateway). |
| `frontend/projects/<lib>/` | The shared libraries: `core-api` (API root, demo-session interceptor), `shop-api` (shop SDK) and `shop-mocks` (shop's MSW mock backend), each reached only via its `@mi-bolt/*` alias.  |
| `backend/`                 | The Gradle build, with the one service `backend/services/commerce/` (Spring Boot / Java, the `mi-bolt-commerce` image).                                                                 |
| `contracts/commerce/`      | The one OpenAPI contract (`openapi.yaml`), its `samples/`, its `sequences/` (PlantUML), and `kommunikacio.md`.                                                                          |
| `data/catalog/`            | The tracked product catalogue: `catalog.json`, `catalog.schema.json`, and the product `images/`.                                                                                        |
| `deploy/`                  | The container stack: `compose.yaml` and the `compose.sh` wrapper.                                                                                                                       |
| `tools/`                   | The import script and the dev-server helper that run outside the frontend and backend workspaces (`catalog-import/`, `dev-server/`).                                                    |
| `.github/`                 | The CI workflows and the `components.yml` path filters they read.                                                                                                                       |
| `mise.toml`                | The root command list; see "Root commands" below.                                                                                                                                       |
| `README.md`                | The monorepo's entry point: install, start modes, workflows, command reference.                                                                                                         |
| `frontend/README.md`       | The Angular workspace: projects, npm scripts, configurations, tests.                                                                                                                    |

## Root commands

Every task below runs from the repository root as `mise run <task>`.

| Task                     | Description                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| `frontend`               | The three apps with ng serve and the MSW mock: storefront 4200, payment 4210, admin 4220       |
| `storefront`             | The storefront alone with the MSW mock, on 4200                                                |
| `admin`                  | The admin alone with the MSW mock, on 4220                                                     |
| `payment`                | The demo payment app alone, on 4210                                                            |
| `db`                     | PostgreSQL alone, in its container on 55433                                                    |
| `backend`                | The backend natively (Gradle bootRun) on 8080, PostgreSQL in its container                     |
| `backend:docker`         | The backend in its container (the mi-bolt-commerce image) on 8080, PostgreSQL in its container |
| `dev`                    | The three apps against the native backend, PostgreSQL in its container                         |
| `dev:docker`             | The three apps against the backend container, PostgreSQL in its container                      |
| `stack`                  | The whole system in containers: web on 4200, backend on 8080, PostgreSQL on 55433              |
| `stop`                   | Stop every container of the stack; the database volume keeps its data                          |
| `setup`                  | Install every workspace's dependencies                                                         |
| `verify`                 | Lint, test and build every workspace, and check the contract                                   |
| `api:generate`           | Regenerate the frontend API clients and the backend server stubs from the contract             |
| `api:drift`              | Fail when the committed frontend API clients differ from the contract                          |
| `contracts:check`        | Lint the contract, validate the samples, check the sequence diagrams                           |

Each workspace's own tasks live in `frontend/mise.toml`, `backend/mise.toml`,
`tools/mise.toml` and `contracts/mise.toml`; the root tasks above call them.

## Which CI branch runs for which change

`.github/workflows/ci.yml` is the one entry point. Its `changes` job reads
`.github/components.yml` and runs each component's reusable workflow when a
changed path matches that component's filter; `ci-ok` then passes when every
needed branch succeeded or was skipped.

| Component   | Paths (`.github/components.yml`)                                                                       | Workflow it runs                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `frontend`  | `frontend/**`, `contracts/**`, `data/catalog/**`, `mise.toml`, `.github/**`, `tools/ci/**`             | `.github/workflows/frontend.yml` ("Frontend")                                                                    |
| `backend`   | `backend/**`, `contracts/**`, `data/catalog/**`, `mise.toml`, `.github/**`, `tools/ci/**`              | `.github/workflows/backend.yml` ("Backend")                                                                      |
| `contracts` | `contracts/**`                                                                                         | `.github/workflows/contracts.yml` ("Contracts")                                                                  |
| `tools`     | `tools/**`, `mise.toml`, `.github/**`                                                                  | `.github/workflows/tools.yml` ("Tools")                                                                          |
| `smoke`     | `frontend/**`, `backend/**`, `contracts/**`, `data/catalog/**`, `deploy/**`, `mise.toml`, `.github/**` | `.github/workflows/smoke.yml` ("Smoke"): the browser smoke specs against the compose stack built from the commit |

`ci.yml` runs on every pull request whatever its base, plus on every push to
`main`.

A change that matches no component (for example `docs/**`) runs only
`changes` and `ci-ok`, and `ci-ok` is green.
