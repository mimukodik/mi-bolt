# Testing the commerce backend

The test harness: the two test tasks, the unit and integration shapes, the
contract assertion, the fixtures, and what `smoke.sh` walks. The coverage
floors, the full gate and CI's job layout belong to `mibolt-verification`;
the rules over test code (no Docker database, the `integration` tag,
test-method names) belong to `mibolt-backend-code-standards`.

## Contents

- [Two test tasks](#two-test-tasks)
- [Unit tests](#unit-tests)
- [Integration and API tests](#integration-and-api-tests)
- [The fixture catalogue](#the-fixture-catalogue)
- [The contract assertion](#the-contract-assertion)
- [What the requirement docs ask of the tests](#what-the-requirement-docs-ask-of-the-tests)
- [smoke.sh](#smokesh)

## Two test tasks

`backend/services/commerce/build.gradle:141-162` splits the suite on the JUnit
tag `integration`, so an `@IntegrationTest` class runs only under
`integrationTest`; the task wiring and when to run which is
`mibolt-verification`'s. Focus a run with Gradle's `--tests` filter, a text
pattern over class and method names
(https://docs.gradle.org/current/userguide/java_testing.html, "Test
filtering"):

```bash
backend/gradlew -p backend :services:commerce:test --tests 'CartServiceTest'
backend/gradlew -p backend :services:commerce:integrationTest --tests '*CartApiTest'
```

Both write under the module's `build/` directory, and each ends with one
summary line, `<task>: N tests, P passed, F failed, S skipped`
(`backend/services/commerce/build.gradle:247-268`). Both declare the source
contract as an input (`:142`, `:149`), so a contract edit reruns them.

## Unit tests

Plain JUnit with no Spring context, as in
`backend/services/commerce/src/test/java/com/example/mi_bolt_backend/cart/CartServiceTest.java:58-84`:

- collaborators are Mockito mocks;
- time is `Clock.fixed(...)`, passed to the service's constructor;
- ids that JPA would generate are set with `ReflectionTestUtils.setField`.

A unit test constructs the service with its own configuration values, so it
does not follow `application.properties`: `CheckoutServiceTest` passes its
own fees and thresholds
(`backend/services/commerce/src/test/java/com/example/mi_bolt_backend/checkout/CheckoutServiceTest.java:45-50`).

## Integration and API tests

`backend/services/commerce/src/test/java/com/example/mi_bolt_backend/test/IntegrationTest.java:21-29`
is the one annotation an integration test class carries. It combines
`@SpringBootTest`, the `integration` tag, `@AutoConfigureMockMvc`, the `test`
profile and `DemoAccessTestConfiguration`, which puts a valid
`mibolt_demo_access` cookie on every MockMvc request; a request that sets its
own cookie of that name replaces it
(`backend/services/commerce/src/test/java/com/example/mi_bolt_backend/test/DemoAccessTestConfiguration.java:13-18`).

- The `test` profile is
  `backend/services/commerce/src/test/resources/application-test.properties`:
  in-memory H2 in PostgreSQL mode running the production changelog, the
  three-product fixture catalogue, and pinned payment prefixes, admin
  password and demo credentials.
- The context, and with it one H2 database, is shared across the run
  (`backend/README.md:98`), so a test creates its own session rather than
  assuming empty tables, as `CartApiTest`'s `newSession()` does. A test that
  needs a database of its own sets its own `spring.datasource.url`
  (`backend/services/commerce/src/test/java/com/example/mi_bolt_backend/ReadinessBeforeRunnersTest.java:39`).
- Admin endpoints are signed into through the real login with
  `backend/services/commerce/src/test/java/com/example/mi_bolt_backend/test/AdminLogin.java:18-22`,
  CSRF cookie included. MockMvc sees an empty context path, so these tests do
  not prove the `/api/v1` matcher; `smoke.sh` does.
- Filter, advice and interceptor tests run against test-only endpoints in
  `backend/services/commerce/src/test/java/com/example/mi_bolt_backend/test/FixtureControllers.java:31-39`,
  never against a business endpoint.

## The fixture catalogue

`backend/services/commerce/src/test/resources/catalog/catalog.json` is the
catalogue the `test` profile loads, so every cart an integration test builds
comes from it. As loaded, its in-stock variants cost 299 990, 349 990,
399 990 and 449 990 HUF, so every cart costs one of those or a sum of them;
the one cheaper variant, `nokia-105--black--128` at 12 990 HUF, has no stock,
and adding it to a cart is refused with `OUT_OF_STOCK`
(`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartService.java:92-96`).
So moving the free-shipping threshold (30 000 today) to another value up to
299 990, or raising the cash-on-delivery ceiling (300 000 today) to anything
under 349 990, leaves no cart as loaded whose outcome differs between the two.

A test gets such a cart by giving `nokia-105--black--128` stock for its own
run and restoring the row in a `finally`, the way
`backend/services/commerce/src/test/java/com/example/mi_bolt_backend/order/OrdersApiTest.java:504-518`
sets and restores `stock` with `JdbcTemplate`. At up to five per line (rule
16), that adds 12 990 to 64 950 in steps of 12 990, alone or beside the other
variants: a cart of three, 38 970, tells a 30 000 threshold from 40 000, and
one beside a 299 990 phone, 312 980, tells a 300 000 ceiling from 320 000.
Where not even that separates the two values, as with thresholds of 30 000
and 35 000, no cart built that way tells them apart; ask the user whether the
change goes without such a case. Never leave the row changed, and never edit
the fixture in the same change, not even to give `nokia-105--black--128`
stock: the integration classes share one H2 database,
`listProductsReturnsAllSixEntriesWithFullFacets` in
`backend/services/commerce/src/test/java/com/example/mi_bolt_backend/catalog/ProductsApiTest.java`
pins the fixture's entry count, in-stock facet and price range, and
`outOfStockVariantIs409` in
`backend/services/commerce/src/test/java/com/example/mi_bolt_backend/cart/CartApiTest.java`
adds that variant expecting `OUT_OF_STOCK`.

## The contract assertion

`backend/services/commerce/src/test/java/com/example/mi_bolt_backend/test/ContractValidation.java`
builds an OpenAPI validator from the source contract,
`contracts/commerce/openapi.yaml`, read at run time from
`backend/services/commerce/` (`:52-66`), not from the copy the generator
consumed, so contract drift is caught independently of the generated code.

- `validAgainstContract()` (`:35-38`) checks the request and the response
  against every applicable rule; API tests assert it after each call, as at
  `backend/services/commerce/src/test/java/com/example/mi_bolt_backend/cart/CartApiTest.java:76`.
- `validMultipartAgainstContract()` (`:40-50`) is the variant for multipart
  uploads, which MockMvc keeps out of the request body.
- The validator only checks that a security cookie is present, so a
  contract-validated 401 test sends an invalid cookie rather than none
  (`backend/docs/decisions/0022-demo-access-gate.md:63-65`).

## What the requirement docs ask of the tests

`backend/docs/02-backend.md:368-401`, in short:

- Every numbered invariant has a test that names its number
  (`:370-371`), in a comment such as the one at
  `backend/services/commerce/src/test/java/com/example/mi_bolt_backend/order/OrdersApiTest.java:293`.
- Concurrency, idempotency and session isolation each get their own case
  (`:377-380`).
- API tests cover every operation's success path, every documented error code
  with its status (the table in `contracts/commerce/kommunikacio.md` §5.3),
  `ETag`, `If-Match`, `Location` and `Set-Cookie`, the cookie each path
  requires, and `fieldErrors` paths that really point into the body
  (`:382-395`).
- A bug fix comes with a test seen failing first; that rule and the coverage
  policy are `mibolt-verification`'s ("Tests and coverage"), and the backend's
  floor values are `mibolt-verification`'s ("Backend (`backend/`)").

## smoke.sh

`backend/services/commerce/scripts/smoke.sh` is a bash and curl pass against a
running backend, `BASE` defaulting to the local `/api/v1` (`:5`). It walks:

- the demo gate refusing before sign-in, then signing in (`:26-31`);
- the catalogue, a product, an image, related products and a 404 (`:33-55`);
- a cart add with `If-Match`, a stale `If-Match` (412) and an unknown body
  member (400);
- a cash-on-delivery order and its replay under the same `Idempotency-Key`,
  with an identical body (`:78`), then an empty cart (`:82`);
- a card order through a payment intent and its outcome;
- when `MIBOLT_ADMIN_INITIAL_PASSWORD` is set, the admin sign-in with the CSRF
  cookie, the product and user lists, a media upload, an upload one byte over
  1 MB answered 413, and sign-out (`:101-126`). This is the only run of the
  real `/api/v1` admin matcher and the real multipart limit (`:101-102`).

It starts no backend of its own; how and when it runs is
`mibolt-verification`'s. CI runs it in the `postgres-smoke` job
against an empty PostgreSQL (`.github/workflows/backend.yml:175-187`).
