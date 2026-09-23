# MiBolt Backend

Spring Boot 4.1.1 / Java 21 / Gradle 9.7.1 backend for the MiBolt demo
webshop. Contract-first: `contracts/commerce/openapi.yaml` is the single
source of truth, the generated interfaces land under
`services/commerce/build/generated/openapi/`, and every implementation
lives in `services/commerce/src/main/java/com/example/mi_bolt_backend/`.
The API answers at `http://localhost:8080/api/v1`.

Every command below runs from the repository root.

## Quick start

```bash
mise run backend                           # PostgreSQL 16 in its container (port 55433), then bootRun
curl http://localhost:8080/api/v1/products
```

The first boot on an empty database imports the repository's
`data/catalog` (48 products, 85 images); see "Catalogue".

## Requirements

- mise, which installs the pinned JDK 21 from the root `mise.toml`
- Gradle wrapper (no system Gradle needed)
- Docker, for the local database and for "Run in Docker"
- For the tests: nothing else. H2 in PostgreSQL mode is on the test
  classpath, and no test may touch the Docker database (docs/02 §7.0)

## Database

The local PostgreSQL is the `postgres` service of `deploy/compose.yaml`
(compose project `mi-bolt-local`, volume `mi-bolt-postgres-data`, host
port 55433). Use the mise tasks and `deploy/compose.sh`, never `docker` or
`psql` directly (docs/04-adatbazis.md).

| Command                          | What it does                                                   |
| -------------------------------- | -------------------------------------------------------------- |
| `mise run db`                    | Start PostgreSQL alone and wait until it is healthy            |
| `mise run stop`                  | Stop every container of the stack; the volume keeps its data   |
| `deploy/compose.sh ps`           | Container state and port mapping                               |
| `deploy/compose.sh logs -f postgres` | Follow the database log                                    |

The application reads its connection from three environment variables,
with defaults that match `deploy/.env.example`:

| Variable             | Default                                        |
| -------------------- | ---------------------------------------------- |
| `MIBOLT_DB_URL`      | `jdbc:postgresql://localhost:55433/mi_bolt`    |
| `MIBOLT_DB_USER`     | `mi_bolt`                                      |
| `MIBOLT_DB_PASSWORD` | `mi_bolt_local`                                |

The schema is Liquibase: one change set per logical change under
`services/commerce/src/main/resources/db/changelog/changes/`, appended to
`db.changelog-master.yaml`. Hibernate runs with `ddl-auto=validate`, so an
entity that disagrees with the change sets stops the boot. H2 and PostgreSQL
share the portable types; the one place they differed (`clob` vs `@Lob`)
is recorded in docs/decisions/0012 and changeset 0006.

## Run

### Locally

```bash
mise run backend               # the database, then Gradle bootRun on 8080
mise run dev                   # the same, plus the three frontend apps against it
```

### In Docker

`services/commerce/Dockerfile` builds the jar with the Gradle wrapper and
runs the Spring Boot layers on a JRE image. It is the `commerce` service of
`deploy/compose.yaml`, beside the database in the same Compose project.

```bash
mise run backend:docker        # the database and the mi-bolt-commerce container
mise run stack                 # the whole system in containers, the web image included
mise run stop                  # stop every container; the database volume keeps its data
```

The image carries the repository's `data/catalog`, so the loader fills an
empty database on the first boot exactly as `bootRun` does.
`MIBOLT_DB_URL`, `MIBOLT_DB_USER` and `MIBOLT_DB_PASSWORD` in the shell
override the compose defaults.

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

| Property              | Default                 | Purpose                                                              |
| --------------------- | ----------------------- | -------------------------------------------------------------------- |
| `mibolt.catalog.path` | `../../../data/catalog` | Directory holding `catalog.json` + `images/`: the repository's `data/catalog`, relative to `services/commerce/` |

The tests use `services/commerce/src/test/resources/catalog` instead. On
success the loader logs `catalogue loaded: N products, M variants, K images,
F featured`; on a populated table it logs `catalogue present, N products,
loader skipped`.

To reload after a content change, empty the database, then boot again.
`deploy/compose.sh down -v` deletes the `mi-bolt-postgres-data` volume and
with it every local row:

```bash
deploy/compose.sh down -v
mise run backend               # or: mise run backend:docker
```

`data/catalog` itself is produced by the import script in
`tools/catalog-import` (docs/decisions/0005).

## Tests and quality gates

```bash
backend/gradlew -p backend :services:commerce:test             # 217 unit tests
backend/gradlew -p backend :services:commerce:integrationTest  # 176 integration tests, shared Spring context
backend/gradlew -p backend :services:commerce:pmdMain :services:commerce:pmdTest   # PMD
backend/gradlew -p backend :services:commerce:build            # everything above plus the coverage gates
bash backend/services/commerce/scripts/smoke.sh                # end-to-end pass against a running backend (BASE=http://…/api/v1)
mise run verify                                                # every workspace's lint, test and build, and the contract checks
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
  see docs/decisions/0009. Reports land under
  `services/commerce/build/reports/pmd/`.
- **CI:** `.github/workflows/backend.yml`, called by `.github/workflows/ci.yml`
  when a pull request or a push to `main` changes a backend input path
  (`.github/components.yml`), runs unit tests, integration tests and PMD in
  parallel; then, side by side, the coverage gate and build, which needs the
  two test jobs (docs/decisions/0006), and a PostgreSQL boot and smoke job,
  which needs all three and starts the jar on an empty `postgres:16`
  service container and runs `services/commerce/scripts/smoke.sh`
  (docs/decisions/0013).

## API

Every endpoint is under `/api/v1` and described in
`contracts/commerce/openapi.yaml`.

| Area            | Endpoints                                                                                                                   | Decision |
| --------------- | --------------------------------------------------------------------------------------------------------------------------- | -------- |
| Catalogue       | `GET /products` (filters, facets, sort, paging), `GET /products/{slug}`, `GET /products/{slug}/related`, `GET /media/{imageId}` | 0007, 0008 |
| Cart            | `GET /cart`, `POST /cart/items`, `DELETE /cart/items`, `PATCH` and `DELETE /cart/items/{variantId}`; `ETag` / `If-Match` on the session state version | 0011 |
| Checkout        | `GET /checkout/options`, `GET /checkout`, `PATCH /checkout`                                                                  | 0010 |
| Payment, orders | `POST /payment-intents`, `GET /payment-intents/{id}`, `POST /payment-intents/{id}/outcome`, `POST /orders` (idempotent, `Idempotency-Key`), `GET /orders/{orderId}` | 0012 |

The session is a cookie (`mibolt_session`) issued by the first `GET /cart`.
Fees, thresholds and lifetimes are configuration under `mibolt.*` in
`services/commerce/src/main/resources/application.properties`.

## Project layout

Paths are relative to `backend/` unless they start at the repository root.

| Path                                           | Content                                                     |
| ---------------------------------------------- | ----------------------------------------------------------- |
| `contracts/commerce/openapi.yaml` (root)       | The contract                                                |
| `services/commerce/src/main/java/...`          | Implementation, one package per area                        |
| `services/commerce/src/main/resources/db/changelog/` | Liquibase change sets                                 |
| `services/commerce/src/test/java/...`          | Unit and integration tests (`@IntegrationTest` shared context) |
| `data/catalog/` (root)                         | Fixture catalogue and images loaded on an empty database    |
| `docs/`                                        | Backend rules (`02`, `04`, `06`) and `docs/decisions/` records |
| `tools/catalog-import/` (root)                 | TypeScript importer that produces `data/catalog`            |
| `services/commerce/Dockerfile`                 | Backend image                                               |
| `deploy/compose.yaml` (root)                   | The database, backend and web containers                    |
| `.github/workflows/backend.yml` (root)         | Backend CI, called by `ci.yml`                              |

## Documentation

- `contracts/commerce/kommunikacio.md` (root) API conventions and errors,
  `docs/02-backend.md` backend rules, `docs/04-adatbazis.md` database
  rules, `docs/06-uzembe-helyezes.md` deployment.
- `docs/decisions/` holds one record per decision, 0001–0021, referenced
  from the tables above.
