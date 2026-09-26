# Security, sessions, versions and idempotency

What stands between a request and a controller, which cookie means what, how
the `If-Match` versions and the `Idempotency-Key` replay work, and the one
place a request body may set a price. The contract's side of each protocol is
`contracts/commerce/kommunikacio.md` §2-§4 (`:39-122`), which
`mibolt-cross-package-changes` owns.

## Contents

- [The path of a request](#the-path-of-a-request)
- [Cookies](#cookies)
- [The admin chain](#the-admin-chain)
- [Versions and If-Match](#versions-and-if-match)
- [Idempotency keys](#idempotency-keys)
- [Price and stock from a request body](#price-and-stock-from-a-request-body)
- [Environment variables](#environment-variables)

## The path of a request

Every path is under the context path `/api/v1`
(`backend/services/commerce/src/main/resources/application.properties:21-23`).
Three servlet filters run first, in this order:

| Order | Filter | Effect |
|---|---|---|
| `HIGHEST_PRECEDENCE` | `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/TraceIdFilter.java:25-30` | Puts a trace id on the request, in the log MDC and in `X-Trace-Id`. |
| `+5` | `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/demo/DemoAccessFilter.java:38-41` | Refuses with 401 `UNAUTHENTICATED` any request without a valid `mibolt_demo_access` cookie, except under `/admin`, `/demo/session` and `/actuator`. Deny by default: a new path is gated without being listed. |
| `+10` | `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/session/SessionCookieFilter.java:30-36` | Reads or issues `mibolt_session` only under `/cart`, `/checkout`, `/payment-intents` and `/orders`. |

A new session-scoped endpoint outside those four prefixes gets no session
until `SCOPED_PREFIXES` names its prefix. A controller reads the session the
filter resolved with `CurrentSession.get(request)`
(`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/session/CurrentSession.java:15-27`),
as `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartController.java:69-71`
does.

Spring Security gates only `/admin/**`; its second chain lets every other
request through unchanged (see "The admin chain"). The
unknown-query-parameter interceptor runs before every handler
(`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/WebMvcConfig.java`).
The backend configures no CORS: a search of the main sources finds only the
interceptor's note that it skips preflights
(`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/UnknownQueryParameterInterceptor.java:28-29`).
How the browser apps reach the API is `mibolt-workspace-ops`.

## Cookies

| Cookie | Issued by | Holds | Lifetime key |
|---|---|---|---|
| `mibolt_demo_access` | `POST /demo/session` with the demo password (`backend/docs/decisions/0022-demo-access-gate.md:29-32`) | a random token; only its SHA-256 digest is stored | `mibolt.demo.access-lifetime` (`backend/services/commerce/src/main/resources/application.properties:44`) |
| `mibolt_session` | `SessionCookieFilter`, on first use of a scoped path | a random token; only its SHA-256 digest is stored (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/session/SessionTokenService.java`) | `mibolt.session.lifetime` (`backend/services/commerce/src/main/resources/application.properties:37`), set once when the cookie is issued; the server-side session and cart expiry extend whenever the cart or the draft changes (rule 19 in the invariants reference; `backend/docs/decisions/0011-cart-version-etag-and-reconciliation.md:75-84`) |
| `mibolt_admin_session` | the admin chain's HTTP session | the servlet session id; `HttpOnly`, `Secure`, `SameSite=Strict` | servlet session (`backend/services/commerce/src/main/resources/application.properties:25-30`) |
| `XSRF-TOKEN` (`backend/services/commerce/scripts/smoke.sh:110`) | `CookieCsrfTokenRepository.withHttpOnlyFalse()` with path `/` (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/admin/security/AdminSecurityConfig.java:37-47`) | the admin CSRF token the SPA sends back in a header | the admin session |

The shop session is anonymous; demo access and admin sign-in are separate
gates, and the shop chain is stateless, so it never uses the admin session.

## The admin chain

`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/admin/security/AdminSecurityConfig.java`
declares two chains (`backend/docs/decisions/0015-admin-security-filter-chains.md`):

- Chain 1, `@Order(1)`, `/admin/**` (`:77-102`): SPA-mode CSRF, an HTTP
  session, `GET /admin/auth/session` and `POST /admin/auth/login` and
  `/logout` open, everything else through `LiveAdminAuthorizationManager`,
  which also checks that the signed-in admin's row still exists, so a deleted
  admin loses access on the next request.
- Chain 2, `@Order(2)`, everything else (`:104-118`): `permitAll`, stateless,
  with CSRF, security headers and request cache off, so the shop's responses
  stay exactly as they were.
  `backend/services/commerce/src/test/java/com/example/mi_bolt_backend/admin/security/PublicChainUnchangedTest.java`
  guards that.
- A 401 or a CSRF 403 is rendered by `ProblemAuthenticationEntryPoint` and
  `ProblemAccessDeniedHandler` through the same Problem advice as every other
  error, as the error-model reference describes.
- MockMvc tests see an empty context path, so only a booted server proves the
  real `/api/v1/admin/**` matching; `smoke.sh`'s admin section does, as the
  testing reference describes.

The first admin is created by `AdminBootstrap` from
`MIBOLT_ADMIN_INITIAL_PASSWORD`; left blank, a generated password is logged
once at WARN
(`backend/services/commerce/src/main/resources/application.properties:32-34`,
`backend/docs/decisions/0016-admin-accounts-bootstrap-and-password-policy.md`).
The demo user is created once by `DemoAccessBootstrap` from
`MIBOLT_DEMO_USERNAME` and `MIBOLT_DEMO_PASSWORD`, and after that the stored
row wins over the variables (`backend/docs/decisions/0022-demo-access-gate.md:21-28`).

## Versions and If-Match

Two independent version schemes:

- **Shop.** One counter on the session, `state_version`, shared by the cart
  and the checkout draft (`backend/docs/02-backend.md:200-201`). Every shop
  write hands `If-Match` to `CartService.expectVersion`: the cart controller
  before each service call
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartController.java:40-67`),
  the checkout controller through
  `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/checkout/CheckoutService.java:101-103`,
  and the payment-intent and order services only after their price-change
  check, because rule 47 comes first there. The value may be quoted or bare;
  a mismatch is 412
  `CART_VERSION_CONFLICT` with `params.expected` and `params.received`
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartService.java:59-77`).
  A missing header is 400 `INVALID_REQUEST` with `params.header`, because the
  generated interface declares it required
  (`backend/services/commerce/src/test/java/com/example/mi_bolt_backend/cart/CartApiTest.java:147-157`).
  The version rises once per request that changed something, reconciliation
  notices included (`CartService.finalize`, `:238-243`), and the response
  carries it as the `ETag`
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartController.java:73-77`).
  `backend/docs/decisions/0011-cart-version-etag-and-reconciliation.md` records
  why.
- **Admin products.** The JPA `version` column on `product`; every admin write
  sets `updated_at`, so the version rises exactly once per write even when
  only a child row changed (`backend/docs/decisions/0020-admin-catalogue-write-api.md:28-33`).
  `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/admin/catalog/AdminProductEtags.java:9-14`:
  a missing or blank `If-Match` is 428 `PRECONDITION_REQUIRED`, another
  version is 412 `PRODUCT_VERSION_CONFLICT`.

## Idempotency keys

`POST /orders` and `POST /payment-intents` take an `Idempotency-Key`:

- The replay runs before anything else in the request, the version check
  included (rule 37;
  `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrdersController.java:89-96`,
  `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/PaymentIntentsController.java:54-61`).
- A record is keyed on session, method, path and key, and fingerprinted with
  the SHA-256 of the serialised body; payment intents fingerprint the empty
  body. The same key with another fingerprint is 409 `IDEMPOTENCY_CONFLICT`;
  a match replays the stored status, `Location` and body
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/IdempotencyService.java:40-72`).
- A record older than `mibolt.idempotency.retention`
  (`backend/services/commerce/src/main/resources/application.properties:62`)
  is ignored on replay and purged when the key is stored again
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/IdempotencyService.java:74-89`).
- The store runs in the same transaction as the work it records: a
  `TransactionTemplate` around `placeOrder`, retried up to three times on an
  order-number collision
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrdersController.java:69-87`),
  and `@Transactional` on `createPaymentIntent`
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/PaymentIntentsController.java:53`).
- `backend/docs/decisions/0012-payment-intents-idempotency-and-orders.md`
  records the design.

## Price and stock from a request body

A shop request never sets a price, a stock level or an amount
(`backend/docs/02-backend.md:448`): an order takes its prices, delivery method
and contact data from the draft (rule 44), and a payment intent takes its
amount from the checkout summary
(`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/PaymentIntentService.java:86-87`).
The one exception is the admin catalogue write API, `POST /admin/products` and
`PUT /admin/products/{productId}`, behind chain 1
(`backend/docs/decisions/0020-admin-catalogue-write-api.md:14-16`). A new shop
field that looks like a price is computed server-side, never accepted.

## Environment variables

Names and purpose only. The bare line numbers in the table are lines of
`backend/services/commerce/src/main/resources/application.properties`, which
holds the defaults, as does the table at `backend/README.md:19-31`.

| Variable | Purpose |
|---|---|
| `MIBOLT_DB_URL`, `MIBOLT_DB_USER`, `MIBOLT_DB_PASSWORD` | The PostgreSQL connection (`:5-7`). |
| `MIBOLT_ADMIN_INITIAL_PASSWORD` | The first admin's password, read only while `admin_user` is empty (`:34`). |
| `MIBOLT_DEMO_USERNAME`, `MIBOLT_DEMO_PASSWORD` | The demo gate's user, read only while `demo_user` is empty (`:42-43`). |
| `MIBOLT_PAYMENT_REDIRECT_URL_PREFIX`, `MIBOLT_PAYMENT_RETURN_URL_PREFIX` | Where the demo payment app and the checkout return live (`:60-61`). |
| `MIBOLT_CATALOG_PATH` | The catalogue directory the loader reads (`backend/README.md:31`). |

`backend/services/commerce/src/test/resources/application-test.properties:15-28`
pins the payment prefixes, the admin password and the demo credentials for the
tests, so a variable exported in a developer's shell cannot change a test's
outcome.
