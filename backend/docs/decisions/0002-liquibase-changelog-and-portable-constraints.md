# 0002 — Liquibase changelog and portable constraints

## Situation

T2 needs the foundation the schema lives on: a versioned changelog that runs on
startup, a single changeset that creates the first table the contract actually
needs (`shop_session`), and a fail-fast on a stale database (docs/04 §3 and §5).
Tests run against H2 in PostgreSQL mode (decision 0003), so the changelog must
use column types and Liquibase change types that both Postgres and H2 accept.

## Options

1. **Liquibase YAML changelog with portable types.** One master file that
   includes numbered change sets; each set declares its changes with the
   cross-dialect portable types (`varchar`, `bigint`, `integer`, `boolean`,
   `timestamp with time zone`).
2. **Per-dialect changesets guarded by `dbms`.** Carry two forms of every
   constraint, with `dbms: "postgresql"` and `dbms: "h2"` guards so each
   database only sees its own syntax.
3. **Hibernate-managed schema (`ddl-auto=update`).** The docs forbid it
   (docs/04 §3): the schema is the migration source, not the entity
   annotations, and the app must refuse to start on a stale schema.

## Decision

Take option 1 with one initial changeset (`0001-shop-session`) for the only
table the contract needs today.

- The starter is `org.springframework.boot:spring-boot-starter-liquibase`; the
  underlying `liquibase-core` is 5.0.3 (Spring Boot 4.1.1 manages the version).
  The starter pulls the `spring-boot-liquibase` auto-configuration module;
  adding `liquibase-core` alone does not wire it.
- Default changelog path is `classpath:/db/changelog/db.changelog-master.yaml`
  (Spring Boot reference: https://docs.spring.io/spring-boot/how-to/data-initialization.html).
- The first changeset (`0001-shop-session`) creates `shop_session` with:
  `id BIGINT identity PK`, `token_hash VARCHAR(64) UNIQUE NOT NULL`,
  `state_version BIGINT NOT NULL DEFAULT 1`, `created_at`, `last_seen_at`,
  `expires_at` (all `TIMESTAMP WITH TIME ZONE NOT NULL`).
- `token_hash` stores the SHA-256 hex digest of the cookie value; the raw
  token is never written to disk.
- `state_version` starts at 1 and is the single counter the cart and the
  checkout draft will share (docs/02 §5); defaulting to 1 in the database
  means a freshly-issued session is immediately usable without an extra
  in-memory seeding step.
- `ddl-auto=validate` stays in place. The startup Liquibase run creates the
  table; Hibernate then validates the entity mappings agree. A mismatch
  prevents the app from starting, per docs/04 §3.

The contract defects that need PostgreSQL-only syntax (for example a partial
unique index over `(cart_id, variant_id)` for T5) will get their own
`dbms`-scoped changeset when they land, recorded here at that point.

## Consequences

**Wins.**
- Empty-to-running is one command: `./gradlew bootRun` (or `./gradlew
  integrationTest` for the H2 profile). The changelog is the schema.
- A second developer, a fresh container, or a CI runner all see the same
  schema on startup.
- The validation step catches the "I changed an entity and forgot the
  changelog" failure mode without the operator needing to read the JPA
  log to figure out which column.

**Costs.**
- H2 does not implement every Liquibase change type (e.g. some forms of
  `addUniqueConstraint` with `forIndexName`). When T5 introduces that
  constraint, the changeset will need a `dbms: "postgresql"` guard and a
  no-op `dbms: "h2"` changeset.
- The single-changeset first migration cannot be squashed into a future
  changeset; a developer who wants to start from a fresh schema cannot
  remove `0001-shop-session.yaml` from the include list without breaking
  every existing environment. That is the intended cost.

## Date and status

2026-09-19 — Valid.

## Sources

- https://docs.spring.io/spring-boot/how-to/data-initialization.html —
  default changelog path and `spring-boot-liquibase` auto-configuration.
- https://docs.spring.io/spring-boot/reference/features/sql.html — JPA +
  Liquibase interaction and the `ddl-auto=validate` interaction.
- https://docs.liquibase.com/start/tutorials/yaml-changelog.html — YAML
  changelog reference.
