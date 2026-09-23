# 0013 — PostgreSQL boot-and-smoke job in CI

## Situation

docs/02 §7.0 keeps every test on H2 in PostgreSQL mode, and until T11 nothing
booted the application against PostgreSQL. Changeset 0005 declared
`idempotency_record.response_body` as `clob`, which PostgreSQL creates as
`text`, while the entity's `@Lob String` expects `oid` since Hibernate 5.6.2;
H2 creates a `CLOB` and matched. Four units merged with green tests and CI
while `./gradlew bootRun` against the local container failed schema
validation. Changeset 0006 fixed the column; this record closes the gap that
let it through.

## Decision

- `.github/workflows/pr-check.yml` gains a `postgres-smoke` job: a
  `postgres:16` service container (`mi_bolt` / `mi_bolt_local` / `mi_bolt`,
  port 5432), `./gradlew bootJar`, the jar started with
  `MIBOLT_DB_URL=jdbc:postgresql://localhost:5432/mi_bolt` on the empty
  database, a wait on `GET /api/v1/products`, then `bash scripts/smoke.sh`.
  The application log is uploaded on failure.
- `scripts/smoke.sh` is the end-to-end pass: catalogue, media, related,
  session cookie and ETag, cart, stale `If-Match` (412), unknown member
  (400), checkout options, cash-on-delivery checkout and order, idempotent
  replay with a byte-identical body, receipt, emptied cart, card checkout,
  payment intent, outcome, card order. It exits 1 on the first unexpected
  status and runs against any backend through `BASE`.
- docs/02 §7.0 names this job as its one exception: it is not a test, the
  Gradle test tasks still never reach a Docker database.

## Consequences

- A schema shape that H2 accepts and PostgreSQL rejects fails the pull
  request instead of the first real boot.
- The job starts once the unit tests, the integration tests and PMD are green
  and runs beside the coverage gate, so a pull request that does not compile
  fails once, in the test jobs, and spends no runner time on the smoke; the
  four existing jobs are unchanged.
- The job runs on an empty database, so it also proves the catalogue loader
  on PostgreSQL on every pull request.

## Date and status

2026-09-20 — Valid. User decision on MIM-205 after the T11 finding.
