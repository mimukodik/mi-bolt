# Data, migrations and seeding

Persistence, the Liquibase changelog, the changelog check script, and the
startup runners that load the catalogue. The database container, its port and
how to reset it belong to `mibolt-workspace-ops`; the catalogue data under
`data/catalog` and its generator belong to `mibolt-cross-package-changes`.

## Contents

- [Persistence](#persistence)
- [The changelog](#the-changelog)
- [Forward-only, and why nothing else catches a violation](#forward-only-and-why-nothing-else-catches-a-violation)
- [The changelog check script](#the-changelog-check-script)
- [Schema validation at start, and H2 against PostgreSQL](#schema-validation-at-start-and-h2-against-postgresql)
- [Catalogue seeding and the startup runners](#catalogue-seeding-and-the-startup-runners)

## Persistence

- JPA entities and Spring Data repository interfaces sit in the domain
  package that owns them, beside its service; no repository has a
  hand-written implementation class.
- A query that must be atomic is one conditional statement, not
  read-check-write: `decrementStock` updates only while `stock >= :quantity`
  and returns the row count
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/ProductVariantRepository.java:19-21`);
  a 0 becomes `OUT_OF_STOCK` in
  `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrderService.java:186-193`.
  Its `clearAutomatically` detaches every entity loaded before it, which is
  why `place` loads the session, cart and draft only afterwards (`:182-185`).
- `spring.jpa.open-in-view=false`
  (`backend/services/commerce/src/main/resources/application.properties:11`):
  load what a response needs inside the service's transaction, the way
  `findByIdWithDetails` fetch-joins product, colour and image
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/ProductVariantRepository.java:12-17`).
- The shop's cart and checkout draft share one version counter, the
  session's `state_version`
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/session/ShopSession.java:30`);
  admin products carry their own JPA `version` column, added in
  `backend/services/commerce/src/main/resources/db/changelog/changes/0008-product-admin-columns.yaml:12-20`.
- Money columns are `bigint` named `*_huf`, for example
  `backend/services/commerce/src/main/resources/db/changelog/changes/0002-catalog.yaml:211-212`.
  Which Java types hold them is a `mibolt-backend-code-standards` rule.

## The changelog

- Spring Boot runs Liquibase at startup and before the tests, reading
  `db/changelog/db.changelog-master.yaml` from the classpath by default
  (https://docs.spring.io/spring-boot/how-to/data-initialization.html).
  Here that is
  `backend/services/commerce/src/main/resources/db/changelog/db.changelog-master.yaml:1-23`,
  eleven `include` entries in number order, one file per changeset under
  `backend/services/commerce/src/main/resources/db/changelog/changes/`.
- Observed pattern, checked by the script below: the file is
  `NNNN-kebab-topic.yaml`, the changeset `id` equals the file stem, and
  `author` is `mi-bolt` in every file.
- Observed pattern: every changeset opens with a `comment:` that names the
  requirement section and rule numbers it serves
  (`backend/services/commerce/src/main/resources/db/changelog/changes/0003-cart.yaml:5-10`).
- Observed pattern: constraints and indexes are named with `uq_`, `ck_`,
  `fk_` and `ix_` prefixes, and code recognises a violation by that name:
  `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/PaymentIntentReuse.java:16-20`
  matches `uq_shop_order_payment_intent`, case-insensitively because H2
  upper-cases the name.
- Column types and change types are the portable ones both PostgreSQL and H2
  accept; PostgreSQL-only syntax gets its own `dbms`-scoped changeset
  (`backend/docs/decisions/0002-liquibase-changelog-and-portable-constraints.md:13-16`
  and `:49-51`). No changeset uses `dbms` today. The one raw `sql` change is
  the stock check constraint
  (`backend/services/commerce/src/main/resources/db/changelog/changes/0005-orders.yaml:344-346`).
- Seed data is never a changeset: the catalogue is loaded by a re-runnable
  runner (`backend/docs/04-adatbazis.md:122-124`).

## Forward-only, and why nothing else catches a violation

The rule: a changeset that has run is never rewritten; a new one is added
instead (`backend/docs/04-adatbazis.md:115-116`). The model to copy is
`backend/services/commerce/src/main/resources/db/changelog/changes/0006-idempotency-response-body.yaml:5-13`,
which changed a column type that `0005-orders.yaml` had declared wrongly by
adding a changeset, not by editing 0005.

Liquibase compares a changeset's checksum only against the row an earlier run
left in `DATABASECHANGELOG`; a changeset that database has never run is simply
run and recorded
(https://docs.liquibase.com/oss/user-guide-4-33/what-is-a-changeset-checksum,
https://docs.liquibase.com/concepts/changelogs/changeset-checksums.html,
https://support.liquibase.com/hc/en-us/articles/29383059554331-How-to-resolve-checksum-errors).
Every database the checks use starts empty, so an edited applied changeset
passes all of them:

- the tests' in-memory H2
  (`backend/services/commerce/src/test/resources/application-test.properties:1-4`);
- CI's `postgres-smoke` job, which boots the jar on an empty PostgreSQL
  (`.github/workflows/backend.yml:187`);
- a pull request preview, which gets a fresh, empty database per head
  (`deploy/candidate/README.md:137-139`).

The stable deployment keeps its database and applies new migrations to it
(`deploy/candidate/README.md:80-84`), so an edited changeset first fails there,
after the merge. `check-liquibase-changelog.py --base` is the check that
catches it before then.

The script treats a changeset as applied when it exists at the merge base of
`--base` and `HEAD`, so one this branch added may still be edited before the
merge. A local PostgreSQL that already ran it halts on the changed checksum
until it is reset; resetting it is `mibolt-workspace-ops`.

## The changelog check script

`.claude/skills/mibolt-commerce-backend/scripts/check-liquibase-changelog.py`,
read-only: it reads the changelog YAML and runs only `git rev-parse` and
`git diff --name-status`. Run it from the repository root of the checkout to
check; it finds the root with `git rev-parse --show-toplevel` from the working
directory.

```bash
uv run --no-project --python 3.12 --with PyYAML==6.0.2 python \
  .claude/skills/mibolt-commerce-backend/scripts/check-liquibase-changelog.py \
  --base origin/main
```

- `--base <git-ref>` is optional. Pass the branch this work was cut from;
  `.claude/rules/code-standards.md` ("Pre-existing") says how to name it.
  It compares the working tree against the merge base of `<base>` and
  `HEAD` (`git diff --name-status --no-renames --merge-base <base>`), so
  committed, staged and unstaged edits count alike, a changeset this branch
  added stays new however often it is edited, and a renamed applied
  changeset counts as deleted.
- Prerequisites: uv on `PATH`, git 2.30 or later, Python 3.12 resolvable by
  uv, and PyYAML 6.0.2, which uv fetches from PyPI once if its cache lacks
  it.
- Exit codes: 0 no FAIL; 1 at least one FAIL; 2 a usage or prerequisite
  error on stderr: `unknown git ref: <ref>`;
  `cannot diff <ref> against the working tree: <git's message>` when git
  finds no merge base, as in a shallow clone; `not a git checkout`;
  `layout changed: <path> not found; update the script and the skill`; or
  `cannot parse backend/services/commerce/src/main/resources/db/changelog/db.changelog-master.yaml: <error>`.

It fails on: an include pointing at a missing file; a file under `changes/`
that is not included; a file included twice; includes out of ascending
number order; a duplicate number; a changeset file that is not valid YAML; a
changeset without `id` or `author`; and, with `--base`, a changeset that
existed at the merge base and has since been modified, renamed or deleted.
It warns, for observed patterns rather than documented rules, on: a file name
outside `NNNN-kebab.yaml`; a first `id` different from the file stem; more
than one `author`; a gap in the numbers. It then prints the next number and
the include block to append, and writes nothing.

A clean run, `--base HEAD`, on this repository:

```text
OK every master include resolves to a file
OK every file under changes/ is included
OK no file is included twice
OK master includes are in ascending number order
OK no changeset number is duplicated
OK every changeset has an id and an author
OK no applied changeset under changes/ was modified or deleted since HEAD
OK every file name matches the changeset naming pattern
OK every first changeset id matches its file stem
OK a single changeset author is in use
OK no gap in the changeset number sequence
next changeset: 0012
new file: backend/services/commerce/src/main/resources/db/changelog/changes/0012-<description>.yaml
append to db.changelog-master.yaml:
  - include:
      file: db/changelog/changes/0012-<description>.yaml
```

The two failures a migration most often produces, an edited applied changeset
and a new file left out of the master, look like this (exit 1):

```text
FAIL changes/0012-product-subtitle.yaml is not included in the master changelog
FAIL applied changeset modified: backend/services/commerce/src/main/resources/db/changelog/changes/0003-cart.yaml; add a new changeset instead (backend/docs/04-adatbazis.md §5)
```

For the first, append the printed include block. The second,
`applied changeset modified`, is also what the script prints for an applied
changeset that was deleted or renamed. Either way, put the file back by hand as
it was at the merge base, its content, name and place, since
`.claude/rules/session-lifecycle.md` ("Nothing is undone with git") rules out
a git restore; then add the intended schema change, if any, as a new
changeset.

## Schema validation at start, and H2 against PostgreSQL

- `spring.jpa.hibernate.ddl-auto=validate`
  (`backend/services/commerce/src/main/resources/application.properties:9-10`):
  Liquibase builds the schema and Hibernate then checks the entity mappings
  against it, so an entity change without its changeset stops the start
  (`backend/docs/decisions/0002-liquibase-changelog-and-portable-constraints.md:45-47`,
  `backend/docs/04-adatbazis.md:82-85`). The tests run the same changelog on
  H2, so the build catches that mismatch too (`backend/README.md:105-107`).
- H2 in PostgreSQL mode is not PostgreSQL
  (`backend/docs/02-backend.md:315-324`). The case on record: a `clob` column
  matched `@Lob` on H2 and refused to start on PostgreSQL while every test
  stayed green; `0006-idempotency-response-body.yaml` repaired it
  (`backend/docs/02-backend.md:305-313`). Write constraints portably so H2
  enforces them too; where that is impossible, the test mocks the repository,
  the constraint is checked by hand on PostgreSQL, and the requirement doc
  marks it (`backend/docs/02-backend.md:320-324`).

## Catalogue seeding and the startup runners

Three `ApplicationRunner`s run in `@Order` order after Liquibase, and Spring
Boot reports readiness only after every runner has returned
(https://docs.spring.io/spring-boot/reference/features/spring-application.html;
`backend/services/commerce/src/main/resources/application.properties:67-69`):

| Order | Runner | What it does |
|---|---|---|
| 0 | `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogLoader.java:36-37` | Loads `catalog.json` and `images/` from `mibolt.catalog.path` when the product table is empty (`:74-82`). A `CatalogValidator` violation stops the start; the rows are then persisted in one `TransactionTemplate` (`:101-110`), so nothing is half-written, and a unique-key collision there is read as another instance having loaded first and skipped. |
| 1 | `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/admin/user/AdminBootstrap.java:27-28` | Creates the first admin when `admin_user` is empty (`backend/docs/decisions/0016-admin-accounts-bootstrap-and-password-policy.md`). |
| 2 | `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/demo/DemoAccessBootstrap.java:28-29` | Creates the demo user when `demo_user` is empty (`backend/docs/decisions/0022-demo-access-gate.md`). |

- `mibolt.catalog.path` defaults to the repository's `data/catalog` seen from
  `backend/services/commerce/`
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/CatalogLoader.java:54`),
  is overridden by `MIBOLT_CATALOG_PATH` (`backend/README.md:31`), and points
  at the three-product fixture `backend/services/commerce/src/test/resources/catalog`
  in tests (`backend/services/commerce/src/test/resources/application-test.properties:10`).
- Images are stored in the database and served by `GET /media/{imageId}`
  (`backend/README.md:65-69`), under an id derived from their content
  (`backend/docs/02-backend.md:257-260`).
- The loader runs once per empty database, so changed catalogue data shows only
  after the database is emptied and the service booted again
  (`backend/README.md:81-88`).
- A new runner takes the next free `@Order`;
  `backend/services/commerce/src/test/java/com/example/mi_bolt_backend/ReadinessBeforeRunnersTest.java:78`
  checks that every production runner stays ordered before its readiness
  probe.
