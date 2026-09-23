# MiBolt Backend

Spring Boot 4.1.1 / Java 21 / Gradle 9.7.1 backend for the MiBolt demo
webshop. Contract-first: `api/openapi.yaml` is the single source of truth,
the generated interfaces land under `build/generated/openapi/`, and every
implementation lives in `src/main/java/com/example/mi_bolt_backend/`.
The API answers at `http://localhost:8080/api/v1`.

## Quick start

```bash
./scripts/local-database-docker.sh start   # PostgreSQL 16 in Docker, port 55433
./gradlew bootRun                          # Liquibase, then the catalogue loader
curl http://localhost:8080/api/v1/products
```

The first boot on an empty database imports `data/catalog` (48 products,
85 images); see "Catalogue".

## Requirements

- JDK 21 (`brew install openjdk@21`)
- Gradle wrapper (no system Gradle needed)
- Docker, for the local database and for "Run in Docker"
- For the tests: nothing else. H2 in PostgreSQL mode is on the test
  classpath, and no test may touch the Docker database (docs/02 §7.0)

## Database

`scripts/local-database-docker.sh` owns the local PostgreSQL container
(`mi-bolt-postgres`, compose project `mi-bolt-local`, network
`mi-bolt-local`, host port 55433). Use the script, never `docker` or `psql`
directly (docs/04-adatbazis.md).

| Command                                         | What it does                                                 |
| ----------------------------------------------- | ------------------------------------------------------------ |
| `./scripts/local-database-docker.sh start`      | Start the container and wait until it is ready (default)     |
| `./scripts/local-database-docker.sh stop`       | Stop it                                                      |
| `./scripts/local-database-docker.sh status`     | Container state, port mapping, volume                        |
| `./scripts/local-database-docker.sh reset --yes`| Destroy the data volume and start an empty database          |
| `./scripts/local-database-docker.sh logs -f`    | Follow the container log                                     |
| `./scripts/local-database-docker.sh --help`     | Every command                                                |

The application reads its connection from three environment variables,
with defaults that match the script:

| Variable             | Default                                        |
| -------------------- | ---------------------------------------------- |
| `MIBOLT_DB_URL`      | `jdbc:postgresql://localhost:55433/mi_bolt`    |
| `MIBOLT_DB_USER`     | `mi_bolt`                                      |
| `MIBOLT_DB_PASSWORD` | `mi_bolt_local`                                |

The schema is Liquibase: one change set per logical change under
`src/main/resources/db/changelog/changes/`, appended to
`db.changelog-master.yaml`. Hibernate runs with `ddl-auto=validate`, so an
entity that disagrees with the change sets stops the boot. H2 and PostgreSQL
share the portable types; the one place they differed (`clob` vs `@Lob`)
is recorded in docs/decisions/0012 and changeset 0006.

## Run

### Locally

```bash
./scripts/local-database-docker.sh start
./gradlew bootRun
```

### In Docker

The multi-stage `Dockerfile` builds the jar with the Gradle wrapper and
runs the Spring Boot layers on a JRE image; `docker-compose.yml` starts
only the backend. The database stays the container the script above
manages: the compose file joins its `mi-bolt-local` network and reaches it
as `mi-bolt-postgres:5432`, so start the database first.

```bash
./scripts/local-database-docker.sh start   # once; creates the network too
docker compose up --build                  # or: docker-compose up --build
docker compose down                        # stop and remove the backend container
```

`data/catalog` is mounted read-only into the container, so the loader
fills an empty database on the first boot exactly as `bootRun` does.
`MIBOLT_DB_URL`, `MIBOLT_DB_USER` and `MIBOLT_DB_PASSWORD` in the shell
override the compose defaults.

### The whole stack in one command

`scripts/demo-stack.sh` brings up the local PostgreSQL database, builds
and starts the backend, then clones, builds and serves the shop and the
payment app from [`mimukodik/mi-bolt`](https://github.com/mimukodik/mi-bolt)
`main` into a temp directory. One command from a clean machine to a
running shop, payment app and API.

```bash
./scripts/demo-stack.sh start     # database + backend + shop + payment app
./scripts/demo-stack.sh stop      # stop them in reverse order
./scripts/demo-stack.sh status    # up/down for each
```

When `start` finishes, it prints:

| URL                                     | What                                          |
| --------------------------------------- | --------------------------------------------- |
| `http://localhost:4200/`                | Shop (proxies `/api/*` to backend)            |
| `http://localhost:4210/demo-fizetes/`   | Payment app (its own origin)                  |
| `http://localhost:8080/api/v1`          | Backend API                                   |

`stop` shuts down the payment app, shop, backend processes started by
`start` and the database container; the database volume and the frontend
clone stay on disk. Use `./scripts/local-database-docker.sh reset --yes`
to wipe the database. Environment overrides:

| Variable                  | Default                                       |
| ------------------------- | --------------------------------------------- |
| `MIBOLT_FRONTEND_REPO`    | `https://github.com/mimukodik/mi-bolt.git`    |
| `MIBOLT_FRONTEND_REF`     | `main`                                        |
| `MIBOLT_FRONTEND_DIR`     | (unset; a fresh `mktemp` directory is used)   |
| `MIBOLT_BACKEND_PORT`     | `8080`                                        |
| `MIBOLT_FRONTEND_PORT`    | `4200`                                        |
| `MIBOLT_PAYMENT_PORT`     | `4210`                                        |
| `MIBOLT_SKIP_BUILD`       | `0` (set to `1` to reuse an existing bootJar) |

### Deploy

How the image is built, published and run on a server, with the
environment variables, the first-boot sequence and the upgrade and rollback
rules, is in `docs/06-uzembe-helyezes.md`.

## Catalogue

The catalogue is owned by the application. On startup `CatalogLoader`
checks `count(product)`; if it is zero, it reads `catalog.json` and the
`images/` directory at `mibolt.catalog.path`, validates everything, and
persists the rows inside one transaction, so a failure rolls back the
whole batch. Images are stored in the database and served by
`GET /media/{imageId}`.

| Property              | Default        | Purpose                                      |
| --------------------- | -------------- | -------------------------------------------- |
| `mibolt.catalog.path` | `data/catalog` | Directory holding `catalog.json` + `images/` |

The tests use `src/test/resources/catalog` instead. On success the loader
logs `catalogue loaded: N products, M variants, K images, F featured`; on
a populated table it logs `catalogue present, N products, loader skipped`.

To reload after a content change, reset the database, then boot again:

```bash
./scripts/local-database-docker.sh reset --yes
./gradlew bootRun              # or: docker compose up --build
```

`data/catalog` itself is produced by the import script in
`scripts/catalog-import` (docs/decisions/0005).

## Tests and quality gates

```bash
./gradlew test                 # 217 unit tests
./gradlew integrationTest      # 176 integration tests, shared Spring context
./gradlew pmdMain pmdTest      # PMD
./gradlew build                # everything above plus the coverage gates
bash scripts/smoke.sh          # end-to-end pass against a running backend (BASE=http://…/api/v1)
```

- **Test database:** H2 in PostgreSQL mode with the same Liquibase changelog
  as production, so a schema drift fails the build (docs/decisions/0003).
  Every test is mocked or in-memory; none may start or reach the Docker
  database (docs/02 §7.0).
- **Coverage:** JaCoCo line coverage ≥ 0.90 on the bundle and ≥ 0.80 on
  every class, the generated `api/**` classes and the application class
  excluded (docs/decisions/0004).
- **Lint:** PMD `rulesets/java/quickstart.xml` through the Gradle `pmd`
  plugin, inside `check`. `config/pmd/ruleset.xml` excludes
  `UseUtilityClass`, lets `MethodNamingConventions` accept the smoke marker
  form `f6_name`, adds a custom `NoFullyQualifiedNames` rule (import types,
  never inline a fully qualified name) and four extra rules
  (`SystemPrintln`, `AvoidReassigningParameters`,
  `AvoidUncheckedExceptionsInSignatures`, `AvoidThrowingRawExceptionTypes`);
  see docs/decisions/0009. Reports land under `build/reports/pmd/`.
- **CI:** `.github/workflows/pr-check.yml` runs unit tests, integration
  tests and PMD in parallel on every pull request and push to `main`; then,
  side by side, the coverage gate and build, which needs the two test jobs
  (docs/decisions/0006), and a PostgreSQL boot and smoke job, which needs
  all three and starts the jar on an empty `postgres:16` service container
  and runs `scripts/smoke.sh` (docs/decisions/0013).

## API

Every endpoint is under `/api/v1` and described in `api/openapi.yaml`.

| Area            | Endpoints                                                                                                                   | Decision |
| --------------- | --------------------------------------------------------------------------------------------------------------------------- | -------- |
| Catalogue       | `GET /products` (filters, facets, sort, paging), `GET /products/{slug}`, `GET /products/{slug}/related`, `GET /media/{imageId}` | 0007, 0008 |
| Cart            | `GET /cart`, `POST /cart/items`, `DELETE /cart/items`, `PATCH` and `DELETE /cart/items/{variantId}`; `ETag` / `If-Match` on the session state version | 0011 |
| Checkout        | `GET /checkout/options`, `GET /checkout`, `PATCH /checkout`                                                                  | 0010 |
| Payment, orders | `POST /payment-intents`, `GET /payment-intents/{id}`, `POST /payment-intents/{id}/outcome`, `POST /orders` (idempotent, `Idempotency-Key`), `GET /orders/{orderId}` | 0012 |

The session is a cookie (`mibolt_session`) issued by the first `GET /cart`.
Fees, thresholds and lifetimes are configuration under `mibolt.*` in
`src/main/resources/application.properties`.

## Project layout

| Path                                   | Content                                                     |
| -------------------------------------- | ----------------------------------------------------------- |
| `api/openapi.yaml`                     | The contract                                                |
| `src/main/java/...`                    | Implementation, one package per area                        |
| `src/main/resources/db/changelog/`     | Liquibase change sets                                       |
| `src/test/java/...`                    | Unit and integration tests (`@IntegrationTest` shared context) |
| `data/catalog/`                        | Fixture catalogue and images loaded on an empty database    |
| `docs/`                                | Specification (`00`–`05`) and `docs/decisions/` records      |
| `scripts/local-database-docker.sh`     | Local database manager                                      |
| `scripts/catalog-import/`              | TypeScript importer that produces `data/catalog`            |
| `Dockerfile`, `docker-compose.yml`     | Backend image and compose service                           |
| `docker-compose.local-database.yml`    | The database container the script manages                  |
| `.github/workflows/pr-check.yml`       | CI                                                          |

## Documentation

- `docs/00-attekintes.md` overview, `docs/01-kommunikacio.md` API
  conventions and errors, `docs/02-backend.md` backend rules,
  `docs/04-adatbazis.md` database rules, `docs/06-uzembe-helyezes.md`
  deployment.
- `docs/decisions/` holds one record per decision, 0001–0012, referenced
  from the tables above.
