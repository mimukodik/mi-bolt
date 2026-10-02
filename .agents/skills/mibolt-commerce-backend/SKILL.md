---
name: mibolt-commerce-backend
description: >-
  Changing the MiBolt Spring Boot backend, backend/services/commerce: cart,
  checkout, payment and order rules, fees and thresholds in
  application.properties, endpoint behaviour, ErrorCode and Problem JSON,
  If-Match checks, idempotency, sessions and admin security, Liquibase
  migrations and database columns. Load it before answering or changing
  anything there, however small. Not for the API contract, generated clients,
  or PMD and Java style.
---

# MiBolt commerce backend

The Spring Boot service under `backend/services/commerce/`. A path below that
starts with `scripts/` or `references/` is relative to this skill's directory,
one that starts with a MiBolt skill name is relative to the directory that
holds the MiBolt skills, and every other path is relative to the repository
root unless its sentence names the directory it sits in. Every command runs
from the repository root (`mibolt-workspace-ops`, "Where commands run")
unless its sentence names another directory, as each command here that runs
a MiBolt skill's script does. The requirement documents are Hungarian;
[references/invariants-index.md](references/invariants-index.md) is the
English index into them.

## 1. Scope and hand-offs

Inside: what the service does and how each subsystem is changed, including
its test harness, its decision records, `backend/settings.gradle`, and the
plugin, toolchain, repositories and dependencies blocks at
`backend/services/commerce/build.gradle` ("plugins {";
`backend/services/commerce/build.gradle`, "toolchain {";
`backend/services/commerce/build.gradle`, "repositories {";
`backend/services/commerce/build.gradle`, "dependencies {"), which section 2
describes.
Choosing or moving a plugin or dependency version is not inside, and no MiBolt
skill carries it (`mibolt-project-map/references/coverage-register.md`, "How
to read a row"). Outside, and where each case goes:

- **The contract and everything generated from it**:
  `contracts/commerce/openapi.yaml`, its samples,
  `contracts/commerce/kommunikacio.md`, the frontend clients, the
  `ProblemCode` fan-out, and the catalogue data under `data/catalog`. These
  belong to `mibolt-cross-package-changes`. A backend task that needs a new
  endpoint, field, enum value or error code starts there and comes back here.
- **Rules over how Java is written**: PMD, the layering statement, naming,
  error-text language, nulls, logging, formatting, test-code rules and the
  `backend/docs/02-backend.md` §9 list. Its price-and-stock exception (decision
  0020) and the decision-record workflow are described here. Consult
  `mibolt-backend-code-standards` on a PMD or compile error, or on a question
  about a Java pattern.
- **The gates**: coverage floors, the full build, CI jobs and when a browser
  pass applies. Consult `mibolt-verification` before calling a change done.
- **Running and shipping**: the Dockerfile, compose, the database container
  and its ports, workflow files, Helm and `mise` tasks. These belong to
  `mibolt-workspace-ops`.
- **The frontends**: the storefront, the payment app and the shop mocks are
  `mibolt-shop-frontend`; the admin app and its mocks are
  `mibolt-admin-frontend`.

## 2. The service

**Stack.** Spring Boot, a Java 21 toolchain and OpenAPI Generator, at the versions the plugins block declares
(`backend/services/commerce/build.gradle`, "plugins {"); the webmvc, JPA, Liquibase,
validation, security and actuator starters, PostgreSQL at run time and H2 in
tests, all from Maven Central (`backend/services/commerce/build.gradle`, "mavenCentral()"). Jackson is version 3, package `tools.jackson`
(`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrdersController.java`, "import tools.jackson.databind.ObjectMapper").
One Gradle subproject, `services:commerce` (`backend/settings.gradle`, "include 'services:commerce'"). The
API answers on port 8080 under `/api/v1` (`backend/README.md`, "The service answers on port 8080").

**Packages**, under `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/`:

| Package | Holds |
|---|---|
| `admin` | `catalog`: admin product reads and writes, media upload; `security`: the two filter chains, CSRF, the live-admin check; `user`: sign-in, admin users, first-admin bootstrap, password policy |
| `cart` | the cart and its lines, reconciliation, the shared version check |
| `catalog` | the catalogue read model, facets and sort, media serving, the startup loader |
| `checkout` | the draft, delivery and payment options, fees, the summary |
| `demo` | the demo gate: filter, sign-in, demo-user bootstrap |
| `order` | orders, payment intents, idempotency records |
| `problem` | `ErrorCode`, `DomainException`, `ProblemAdvice`, `/error`, trace ids, the unknown-query interceptor |
| `session` | the shop session cookie and its state version |

**Generated interfaces.** The `api` and `api.model` packages are generated
from the contract into `build/generated/openapi/` inside
`backend/services/commerce/` before every compile, wiped each run and never
committed (`backend/services/commerce/build.gradle`, "openApiGenerate {"). Eleven
controllers each implement one generated `*Api` interface, one per contract
tag (`useTags`, `backend/services/commerce/build.gradle`, "useTags"), and declare no route, method or status of their own
(`backend/docs/02-backend.md`, "deklarál saját útvonalat"); a twelfth, `ProblemErrorController`,
serves `/error`. `prepareOpenApiSpec` rewrites four single-value discriminator
enums before generation and fails, naming the block, when the contract's text
for one of them changes (`backend/services/commerce/build.gradle`, "tasks.register('prepareOpenApiSpec')",
`backend/docs/decisions/0001-openapi-generator-and-discriminator-workaround.md`);
that failure is a contract change, so it goes to `mibolt-cross-package-changes`.

**A request's path.** `TraceIdFilter`, `DemoAccessFilter` and
`SessionCookieFilter` run first; `/admin/**` also meets its own Spring Security
chain; the controller reads the session, checks `If-Match` on a write (on an
`Idempotency-Key` operation it runs the replay first and the service checks
the version), and calls one service method; the service enforces the rules
and throws `DomainException`; `ProblemAdvice` turns every failure into
`application/problem+json`. Details:
[references/security-and-sessions.md](references/security-and-sessions.md)
and [references/error-model.md](references/error-model.md).

**Where the rules are written.**

- `backend/docs/02-backend.md` (Hungarian): invariants 1-47 in §4
  (`backend/docs/02-backend.md`, "4. Domain-invariánsok"), the data model in §5, tests in §7, decision records in §8, the
  forbidden list in §9.
- `backend/docs/04-adatbazis.md` (Hungarian): schema constraints (§4) and
  migrations (§5).
- `contracts/commerce/kommunikacio.md` (English): session, versioning,
  idempotency and the error contract. `backend/docs/02-backend.md` ("az ott leírt szabályok itt is kötelezőek") makes it
  part of the backend requirements; `mibolt-cross-package-changes` edits it.
- `backend/docs/decisions/` (English): 22 records, `0001` to `0022`, the why
  behind each non-obvious choice.

**Mechanics to know before changing anything.**

- **Transactions.** `CartService`, `CheckoutService`, `PaymentIntentService`
  and `IdempotencyService` are `@Transactional(noRollbackFor =
  DomainException.class)` (for example
  `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartService.java`, "@Transactional(noRollbackFor = DomainException.class)"),
  so a refusal they throw does not by itself undo what the call already
  wrote, such as the expired cart `expireIfPast` deletes before answering
  `CART_EXPIRED` (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartService.java`, "void expireIfPast"). `OrderService` is plain `@Transactional`: any
  refusal inside `place` rolls back the whole order (rule 42;
  `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrderService.java`, "The whole {@code place} call is one transaction").
  Spring rolls back on an unchecked exception unless a no-rollback rule
  matches it
  (https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/rolling-back.html).
- **One shop version.** The cart and the checkout draft share the session's
  `state_version`; every shop write checks `If-Match` against it, a mismatch
  is 412, and the cart and checkout responses carry the new value as their
  `ETag`.
- **Replay first.** An `Idempotency-Key` replay on `POST /orders` and
  `POST /payment-intents` runs before every other check, the version included
  (rule 37).
- **Prices come from the server.** Never accept a price, stock level or
  amount from a shop request body; the admin catalogue write API is the one
  exception (`backend/docs/decisions/0020-admin-catalogue-write-api.md`).
- **Stock is decremented atomically**, by a conditional update, never by
  read-then-write
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/ProductVariantRepository.java`, "decrementStock").
- **Hosted smoke is stock-neutral only for its reserved canary** (ADR 0023).
  `mibolt.smoke.enabled` defaults to false; demo charts and Compose enable it.
  Orders restore the exact canary variant's quantity within the same transaction,
  checking its owning reserved product too. Normal catalogue stock still falls.
  Bootstrap works in an already populated database and public listings hide it.
- **Payment-intent expiry is lazy**: evaluated on every read and outcome
  call; there is no scheduler
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/PaymentIntentService.java`, "private void applyLazyExpiry(").

**Configuration** lives in
`backend/services/commerce/src/main/resources/application.properties`: schema
validation and open-in-view (`backend/services/commerce/src/main/resources/application.properties`, "spring.jpa.hibernate.ddl-auto"), JSON inclusion and unknown-member
rejection (`backend/services/commerce/src/main/resources/application.properties`, "JSON: omit absent optional members"), the context path (`backend/services/commerce/src/main/resources/application.properties`, "server.servlet.context-path"), the admin session cookie
(`backend/services/commerce/src/main/resources/application.properties`, "Admin session cookie"), the first-admin password (`backend/services/commerce/src/main/resources/application.properties`, "mibolt.admin.initial-password"), session lifetime (`backend/services/commerce/src/main/resources/application.properties`, "mibolt.session.lifetime"), the
demo gate (`backend/services/commerce/src/main/resources/application.properties`, "Demo gate"), checkout fees, free-shipping threshold, cash-on-delivery
ceiling and terms version (`backend/services/commerce/src/main/resources/application.properties`, "Checkout fees and thresholds"), payment intents and idempotency
retention (`backend/services/commerce/src/main/resources/application.properties`, "Payment intents and orders"), readiness probes (`backend/services/commerce/src/main/resources/application.properties`, "management.endpoint.health.probes.enabled"), and the demo smoke flag (`backend/services/commerce/src/main/resources/application.properties`, "mibolt.smoke.enabled"). `mibolt.catalog.path` has
no line there; its default is in the loader (see
[references/data-and-migrations.md](references/data-and-migrations.md)).
Name environment variables, never their values: several defaults are
passwords.

## 3. Where to start

| Task | Open first |
|---|---|
| A business rule | the rule in [references/invariants-index.md](references/invariants-index.md), then the service it names |
| An endpoint | the operation in `contracts/commerce/openapi.yaml`, then the controller implementing its tag's interface |
| A fee or threshold | `backend/services/commerce/src/main/resources/application.properties` ("Checkout fees and thresholds") and `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/checkout/CheckoutService.java` ("public CheckoutService(") |
| An error code | `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ErrorCode.java` and [references/error-model.md](references/error-model.md) |
| A migration | `backend/services/commerce/src/main/resources/db/changelog/db.changelog-master.yaml` and the script in section 7 |
| Sign-in, cookies, admin access | [references/security-and-sessions.md](references/security-and-sessions.md) |

**Canonical examples**, the patterns to copy:

- `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartController.java`:
  a controller that only delegates, checks `If-Match` before each write and
  sets the `ETag`.
- `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartService.java`
  `addItem` (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartService.java`, "CartData.CartView addItem("): validation, reconciliation and a version bump only
  when something changed.
- `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/catalog/ProductVariantRepository.java`
  `decrementStock`: the atomic conditional update.
- `backend/services/commerce/src/main/resources/db/changelog/changes/0003-cart.yaml`:
  a changeset whose comment cites the rules it serves and whose named unique
  constraint backs an invariant against races.
- `backend/services/commerce/src/main/resources/db/changelog/changes/0006-idempotency-response-body.yaml`:
  a wrong earlier changeset fixed forward, by a new one.
- `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrderService.java`
  `place` with
  `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrdersController.java`
  `createOrder`: the one transaction under a `TransactionTemplate` that
  retries an order-number collision.
- `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/ProblemAdvice.java`:
  every failure's wire shape.
- `backend/services/commerce/src/test/java/com/example/mi_bolt_backend/cart/CartServiceTest.java`,
  `backend/services/commerce/src/test/java/com/example/mi_bolt_backend/test/IntegrationTest.java`
  and
  `backend/services/commerce/src/test/java/com/example/mi_bolt_backend/test/ContractValidation.java`:
  the unit and integration test shapes.

## 4. Typical work

**An endpoint the contract already declares.**

1. Confirm the operation, its schemas and its error codes are in
   `contracts/commerce/openapi.yaml`; if not, `mibolt-cross-package-changes`
   first.
2. Compile, or run `mise run //backend:api:generate`, and read the new method
   in the generated `*Api` interface.
3. Implement it in the controller that already implements that interface, or
   in a new `@RestController` in the owning package for a new tag: read the
   session with `CurrentSession.get`, check `If-Match` first on a shop write,
   except where the operation takes an `Idempotency-Key`: there the replay
   runs first and the service checks the version after the rule 47 price
   check (rule 37;
   [references/security-and-sessions.md](references/security-and-sessions.md)).
   Call one service method, map the result with the package's `*Models`
   mapper, and set `ETag` or `Location` as the contract requires.
4. Put every rule in the service and refuse with `DomainException`.
5. Place a session-scoped path under `/cart`, `/checkout`, `/payment-intents`
   or `/orders`, or add its prefix to `SessionCookieFilter`; the demo gate
   covers any new path on its own.
6. Test each rule in a unit test and each status in an API test with
   `validAgainstContract()` ([references/testing.md](references/testing.md)).

**A business rule.**

1. Find it in [references/invariants-index.md](references/invariants-index.md)
   and read the Hungarian text it points at.
2. Change it in the service that enforces it.
3. When the change departs from a requirement document, write a decision
   record and correct the document in the same change (section 5).
4. Add or change the unit test that names the rule number, and the API test
   when a status or body changes.
5. When a database constraint backs the rule, the constraint changes by
   migration.

**A new response field.** The chain is: the contract
(`mibolt-cross-package-changes`), the regenerated DTO, the package's `*Data`
record, its `*Models` mapper, the service that computes the value, and the
contract assertion in the API test. For the cart that is
`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartData.java`,
`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartModels.java` (`toCart`),
`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartService.java`
and `backend/services/commerce/src/test/java/com/example/mi_bolt_backend/cart/CartApiTest.java`.
A stored value adds a migration.

**A fee, threshold or other configuration value.**

1. Change the key in
   `backend/services/commerce/src/main/resources/application.properties` ("Checkout fees and thresholds"),
   or add one with a constructor `@Value` in
   `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/checkout/CheckoutService.java` ("public CheckoutService(").
2. Use it in `buildOptions` (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/checkout/CheckoutService.java`, "CheckoutData.Options buildOptions").
3. Update the tests that assert the old value, and add an API case whose
   outcome differs between the old and the new value where none does yet;
   "Done means" in section 7 covers a value the test catalogue cannot
   bracket. The `test` profile does not override `mibolt.checkout.*`, so
   every `@IntegrationTest` class sees the real values,
   `backend/services/commerce/src/test/java/com/example/mi_bolt_backend/checkout/CheckoutApiTest.java` and
   `backend/services/commerce/src/test/java/com/example/mi_bolt_backend/order/OrdersApiTest.java`
   among them. Some carry a value only inside a derived number, such as the
   total `300480` (299 990 plus the 490 cash-on-delivery fee) or a shipping
   fee of 0 above the free-shipping threshold; a search for the old value
   misses those, and `integrationTest` shows them as failures.
   `backend/services/commerce/src/test/java/com/example/mi_bolt_backend/checkout/CheckoutServiceTest.java` ("private static final long HOME_FEE")
   passes its own constants, so a new default leaves it unchanged. Pin a
   value in
   `backend/services/commerce/src/test/resources/application-test.properties`
   only when a test must not follow the default.
4. Update the value table in
   `backend/docs/decisions/0010-checkout-draft-options-and-fees.md` ("The fees and thresholds are configuration under"), or
   record a new decision when the change is one (section 5).
5. The value has copies outside the backend: the storefront's mock
   (`frontend/projects/shop-mocks/src/checkout/checkout-store.ts`, "Demo defaults mirrored from the backend") and
   its spec, `frontend/projects/shop-mocks/src/checkout/checkout-mock.spec.ts`,
   which `mibolt-shop-frontend` keeps in step;
   `frontend/docs/spec/screens.md` ("S4.3 Delivery and simulated payment"), `frontend/docs/spec/components.md` ("PaymentMethodSelector — purchase/delivery")
   and `frontend/docs/spec/test-scenarios.md` ("Choose home with valid HU address"); and the Playwright plans under
   `frontend/specs/` and specs under `frontend/e2e/`, which pick products
   against the cash-on-delivery ceiling, often through a literal such as
   `300_000`. Several copies carry only the number, so list them by name and
   by value,
   `git grep -n -e '<property key>' -e '<mock constant>' -e '<old value>' -e '<old value with _ as thousands separator>' -e '<old value with a space as thousands separator>' -- ':(exclude,glob)**/mibolt-*/**' ':!frontend/docs/design/yettel'`,
   whose first exclusion keeps the MiBolt skills' own quotations of the value
   out, and set aside every hit whose number means something else: a price, a
   timeout, a length, or a longer number that contains it.

**A migration.**

1. Run the script (section 7) for the next number and the include block.
2. Write `NNNN-topic.yaml` in
   `backend/services/commerce/src/main/resources/db/changelog/changes/`:
   `id` equal to the file stem, `author: mi-bolt`, a `comment:` citing the
   rule or section it serves, portable types, named constraints, and money
   as `bigint` `*_huf`.
3. Append the printed include to the master changelog.
4. Change the entity and repository in the same change. The start validates
   each mapped column against the schema, not the reverse: a mapping with no
   matching column, or a column of another type, stops the start, while a
   column nothing maps passes unnoticed, so nothing at start reports a
   forgotten mapping.
5. Never edit a changeset that has run; add a new one. The stable database
   has already recorded it, and Liquibase halts there on a changed checksum.
6. Run the script again with `--base` and expect exit 0, then the integration
   tests, which run the changelog on H2.

Details, and why nothing but the script catches an edited changeset:
[references/data-and-migrations.md](references/data-and-migrations.md).

**An admin catalogue write**, the one place a request body may set price and
stock: the `admin.catalog` package, from
`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/admin/catalog/AdminProductsController.java`
to `AdminProductCommandService` (create, replace, archive, restore),
`AdminProductValidator` (cross-field rules) and `AdminProductEtags` (428 or
412 on `If-Match`). Validation runs in three stages, each answered whole
(`backend/docs/decisions/0020-admin-catalogue-write-api.md`, "Validation in three stages, each answered whole"). The API
tests sign in with `AdminLogin`.

**An error code**: the contract's `ProblemCode` first, then `ErrorCode`,
`ErrorCodeTest`, the throwing service and an API test, in the order
[references/error-model.md](references/error-model.md) gives.

## 5. Code expectations

Owned by this skill:

- Refuse with `DomainException` and an `ErrorCode`; never build an error body
  in a controller or a service. `ProblemAdvice` is the one place that renders
  them, which is what keeps every failure in the contract's shape with a
  trace id.
- Pass every shop write's `If-Match` to `CartService.expectVersion`, and every
  admin product write's to `AdminProductEtags.expectVersion`, so a client
  holding a stale version gets a 412 instead of overwriting newer state.
- Keep the transaction choice above: `noRollbackFor = DomainException.class`
  on the cart, checkout, payment-intent and idempotency services, plain
  `@Transactional` on order placement.
- Follow the changeset pattern in section 4; the script warns on a departure.
- **Record every decision** a later reader would ask "why this way?" about,
  when it is made, not afterwards (`backend/docs/02-backend.md`, "8. A fejlesztés alatti döntések dokumentálása"):
  - one numbered file under `backend/docs/decisions/`, the next being `0024`;
  - the five sections §8 names, in the English form the records use:
    Situation, Options, Decision, Consequences, Date and status, as in
    `backend/docs/decisions/0002-liquibase-changelog-and-portable-constraints.md`
    (several later records omit Options or Date and status);
  - a departure from a requirement document also corrects that document
    (`backend/docs/02-backend.md`, "Az eltérés külön hangsúlyos.");
  - a defect in the contract is not fixed from the implementation side on its
    own initiative (`backend/docs/02-backend.md`, "A szerződés külön eset."): a contract change
    reaches the frontends as well, so ask the user whether it changes, and the
    change itself goes to `mibolt-cross-package-changes`;
  - an earlier record is amended with a dated section, not rewritten, as in
    `backend/docs/decisions/0004-contract-validator-jacoco-gate-context-path-and-json-inclusion.md` ("per-class floor").

Owned by `mibolt-backend-code-standards`, one line each:

- No business rule and no database call in a controller
  (`backend/docs/02-backend.md`, "Itt nincs üzleti szabály, nincs adatbázis-hívás").
- Error responses carry no user-facing Hungarian text
  (`backend/docs/02-backend.md`, "Felhasználónak szánt magyar szöveg hibaválaszban"); the Hungarian receipt notice and
  checkout option labels are non-error responses the rule does not cover.
- Read the time from an injected `Clock`, which a unit test fixes with
  `Clock.fixed` ([references/testing.md](references/testing.md));
  `SessionService` calls `OffsetDateTime.now()` directly and is the one
  exception.
- Import types; never write a fully qualified name inline (PMD
  `NoFullyQualifiedNames`).
- No `System.out` or `System.err` (PMD `SystemPrintln`).
- No test starts, reaches or depends on the Docker database
  (`backend/docs/02-backend.md`, "Egyetlen teszt sem indíthatja el").

## 6. What else a change touches

- **Contract consumers.** A contract change regenerates the backend stubs, the
  shop SDK and the admin client together: `mibolt-cross-package-changes`.
- **The browser mocks.** The storefront and the admin app run on MSW mocks
  that imitate this service (`frontend/projects/shop-mocks/src/`,
  `frontend/projects/admin/src/mocks/`). A behaviour change here leaves them
  behind until `mibolt-shop-frontend` or `mibolt-admin-frontend` updates them.
- **Documents.** A departure from `backend/docs/02-backend.md` or
  `backend/docs/04-adatbazis.md` corrects the document and adds a decision
  record. A new environment variable goes in the table at
  `backend/README.md` ("Environment variables the service reads"), and into compose and the chart through
  `mibolt-workspace-ops`.
- **Deployed databases.** The stable deployment keeps its database and
  applies new migrations to it, and a rollback must stay schema-compatible
  (`deploy/candidate/README.md`, "Automatic stable releases"); that is why forward-only binds.
- **`smoke.sh`.** When a flow it walks changes, or the demo gate or the admin
  sign-in does, update
  `backend/services/commerce/scripts/smoke.sh` in the same change
  ([references/testing.md](references/testing.md)).
- **Coverage.** A new class counts against a per-class floor as well as the
  total. The numbers are `mibolt-verification`'s ("Backend (`backend/`)"),
  and the rule that they are floors, not per-line gates, is
  `mibolt-verification`'s ("Tests and coverage").

## 7. Verification

Commands, from the repository root unless one names another directory:

- `uv run --no-project --python 3.12 --with PyYAML==6.0.2 python scripts/check-liquibase-changelog.py --base origin/main`,
  from this skill's directory: the changelog check, read-only. Pass the
  branch this work was cut from as `--base`. Exit 0 no FAIL, 1 a FAIL, 2 a
  usage or prerequisite error. Needs uv, git 2.30 or later, and PyYAML 6.0.2
  fetched once by uv if its cache lacks it.
- `backend/gradlew -p backend :services:commerce:test --tests '<pattern>'`:
  unit tests only.
- `backend/gradlew -p backend :services:commerce:integrationTest --tests '<pattern>'`:
  the Spring context tests on H2; an `@IntegrationTest` class runs only here.
- `mise run //backend:api:generate`: regenerates the backend stubs; a compile
  does it anyway.
- `backend/gradlew -p backend :services:commerce:build`: the full gate, unit
  and integration tests, PMD and coverage; when to run it and how to read it
  is `mibolt-verification` ("Gates before a commit").

The Gradle tasks need the Java 21 that the root `mise.toml` ("java") pins, and write
under the module's `build/` directory. `smoke.sh` starts no backend of its
own: it runs against one that is already up.

The changelog check ends by printing the next changeset number, `0012` today,
the new file's path and the include block to append to the master changelog.
A full run and what each FAIL means are in
[references/data-and-migrations.md](references/data-and-migrations.md).

Done means:

- **A rule or endpoint**: a unit test per rule, naming its number; an API
  test per status with `validAgainstContract()`; both test tasks green.
- **A migration**: the script exits 0 with `--base`, and `integrationTest` is
  green, which proves the changelog runs and the mappings validate on H2.
- **An error code**: `ErrorCodeTest` and the new API test green.
- **A configuration value**: an API case whose outcome depends on the new
  value (for a threshold or ceiling, a cart from the test catalogue,
  `backend/services/commerce/src/test/resources/catalog/catalog.json`, priced
  between the old and the new value), the tests asserting the old value
  updated, all green; and decision 0010 or a new record updated. Where that
  catalogue has no such cart as loaded, never edit it in the same change:
  [references/testing.md](references/testing.md) says how a test gets one for
  its own run, and when not even that tells the old value from the new.
- **Anything the UI displays**: also a real-browser pass on the backend-backed
  build, per `mibolt-verification` ("Browser pass").

## 8. References

- [references/invariants-index.md](references/invariants-index.md): read when
  changing business behaviour, or when a rule is cited by number.
- [references/error-model.md](references/error-model.md): read when adding or
  changing an error, a status or a field error.
- [references/data-and-migrations.md](references/data-and-migrations.md): read
  when touching the schema, persistence, a changeset, the script's output, or
  catalogue seeding.
- [references/security-and-sessions.md](references/security-and-sessions.md):
  read when touching sign-in, cookies, the filters, admin endpoints, `If-Match`
  or idempotency keys.
- [references/testing.md](references/testing.md): read when writing or fixing
  a test, or changing what `smoke.sh` walks.

Repository sources: `backend/docs/02-backend.md`, `backend/docs/04-adatbazis.md`,
`contracts/commerce/kommunikacio.md`, `backend/docs/decisions/` and
`backend/README.md`.

## 9. Keep this skill current

Update this skill in the same change when any of these moves:

- `backend/settings.gradle`, and in `backend/services/commerce/build.gradle`
  the plugin and toolchain block (`backend/services/commerce/build.gradle`, "plugins {"), the repositories and dependencies
  blocks (`backend/services/commerce/build.gradle`, "dependencies {"), the generation block (`backend/services/commerce/build.gradle`, "openApiGenerate {") and the test tasks
  (`backend/services/commerce/build.gradle`, "tasks.register('integrationTest', Test)"; `backend/services/commerce/build.gradle`, "tasks.withType(Test).configureEach");
- `backend/docs/02-backend.md` §4 or §8, or `backend/docs/04-adatbazis.md`;
- a new record under `backend/docs/decisions/` (the next number, 0024, is
  stated in section 5);
- `backend/services/commerce/src/main/resources/application.properties`,
  `backend/services/commerce/src/test/resources/application-test.properties`
  or `backend/services/commerce/src/test/resources/catalog/catalog.json`;
- a new domain package, or a class named here moving or being renamed;
- a new changeset (the changeset count, and the next number stated in
  section 7 and in the references' output excerpts);
- `ErrorCode` (the count of 26) or the handlers in `ProblemAdvice`;
- the three filters or `AdminSecurityConfig`;
- `backend/services/commerce/scripts/smoke.sh`;
- the changelog layout, which makes the script exit 2 with `layout changed`.

From the directory that holds the MiBolt skills, check every path, cited name and
command here with:

```bash
node mibolt-project-map/scripts/check-skill-references.mjs mibolt-commerce-backend
```

A citation here names its target (a heading, task, function, key or
distinctive phrase) and never gives a line number. Run the check after an edit
to any file this skill or its references cite, listed above or not, a MiBolt
skill cited by section name included, and read each cited section there
against the claim beside it: the check only confirms that the name still
occurs somewhere in the target, so a renamed section passes while its old name
is still in the file, and a name that is gone fails.
