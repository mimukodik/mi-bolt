# 0003 — H2 in PostgreSQL mode for tests

## Situation

Docs/02 §7.0 forbids tests from reaching the Docker database container; they
must run on either a mock or an in-memory database. The same Liquibase
changelog that runs on the production Postgres container has to run in the
test classpath so `ddl-auto=validate` can confirm the JPA mappings agree.

## Options

1. **H2 in PostgreSQL mode, in-memory, with the same changelog.** Connection
   string `jdbc:h2:mem:mibolt;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1`.
2. **Testcontainers Postgres.** Spin up a real Postgres in the test JVM.
   Overlaps with the explicit ban on Docker in tests (docs/04 §1), and
   also conflicts with the rule that the app never depends on Docker
   being available.
3. **Mock all repositories.** Drops the changelog and the validation step;
   tests would not exercise the schema at all.

## Decision

Take option 1.

- Driver `com.h2database:h2` 2.4.240, declared `testRuntimeOnly`. Spring Boot
  4.1.1 manages the version.
- The test profile (`src/test/resources/application-test.properties`)
  overrides `spring.datasource.url`, `spring.datasource.username`,
  `spring.datasource.password` and `spring.datasource.driver-class-name`;
  every other property is inherited from `application.properties`.
- The same `db/changelog/db.changelog-master.yaml` runs at startup; the
  `liquibase-core` 5.0.3 default behaviour parses the YAML and applies
  every changeset in order. `ddl-auto=validate` then checks that the JPA
  entity mappings agree with what Liquibase created.
- `DB_CLOSE_DELAY=-1` keeps the in-memory database alive across the test
  JVM lifetime so connection-pool warm-up does not discard the schema
  between assertions.

## Consequences

**Wins.**
- The test that proves the schema is right is the schema itself: the
  changelog that runs in CI is the same file that runs on the operator's
  machine and on the production container.
- Tests run in seconds, with no Docker dependency. CI does not need a
  Docker daemon, and a developer without Docker installed can still run
  the suite locally.

**Costs.**
- H2 does not implement every Postgres-specific feature. Decisions about
  where the gap matters are recorded per changeset (decision 0002). The
  pattern is: write the portable form, add a `dbms: "postgresql"`-scoped
  changeset only when a feature cannot be expressed portably, and never
  try to bend the production schema to fit H2.
- Tests that exercise schema-level invariants the H2 dialect does not
  enforce are documented as such and are followed up with a smoke run
  against the real container (the orchestrator's responsibility in T2+).

## Date and status

2026-09-19 — Valid.

## Sources

- https://h2database.com/html/features.html — PostgreSQL compatibility mode
  flags and the connection-string knobs.
- https://docs.spring.io/spring-boot/reference/features/sql.html —
  H2 driver coordinates and the `spring-boot-starter-data-jpa-test`
  relationship with the running profile.
