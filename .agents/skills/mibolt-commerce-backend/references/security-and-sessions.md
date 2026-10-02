# Security, sessions, versions and idempotency

What stands between a request and a controller, which cookie means what, how
the `If-Match` versions and the `Idempotency-Key` replay work, and the one
place a request body may set a price. The contract's side of each protocol is
`contracts/commerce/kommunikacio.md` §2-§4 (`contracts/commerce/kommunikacio.md`, "2. Session"), which
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
(`backend/services/commerce/src/main/resources/application.properties`, "server.servlet.context-path").
Three servlet filters run first, in this order:

| Order | Filter | Effect |
|---|---|---|
| `HIGHEST_PRECEDENCE` | `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/TraceIdFilter.java` ("@Order(Ordered.HIGHEST_PRECEDENCE)") | Puts a trace id on the request, in the log MDC and in `X-Trace-Id`. |
| `+5` | `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/demo/DemoAccessFilter.java` ("@Order(Ordered.HIGHEST_PRECEDENCE + 5)") | Refuses with 401 `UNAUTHENTICATED` any request without a valid `mibolt_demo_access` cookie, except under `/admin`, `/demo/session` and `/actuator`. Deny by default: a new path is gated without being listed. |
| `+10` | `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/session/SessionCookieFilter.java` ("@Order(Ordered.HIGHEST_PRECEDENCE + 10)") | Reads or issues `mibolt_session` only under `/cart`, `/checkout`, `/payment-intents` and `/orders`. |

A new session-scoped endpoint outside those four prefixes gets no session
until `SCOPED_PREFIXES` names its prefix. A controller reads the session the
filter resolved with `CurrentSession.get(request)`
(`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/session/CurrentSession.java`, "public static ShopSession get(HttpServletRequest request)"),
as `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartController.java` ("return CurrentSession.get(request)")
does.

Spring Security gates only `/admin/**`; its second chain lets every other
request through unchanged (see "The admin chain"). The
unknown-query-parameter interceptor runs before every handler
(`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/WebMvcConfig.java`).
The backend configures no CORS: a search of the main sources finds only the
interceptor's note that it skips preflights
(`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/problem/UnknownQueryParameterInterceptor.java`, "OPTIONS preflights are also skipped").
How the browser apps reach the API is `mibolt-workspace-ops`.

## Cookies

| Cookie | Issued by | Holds | Lifetime key |
|---|---|---|---|
| `mibolt_demo_access` | `POST /demo/session` with the demo password (`backend/docs/decisions/0022-demo-access-gate.md`, "checks the password against the stored hash") | a random token; only its SHA-256 digest is stored | `mibolt.demo.access-lifetime` (`backend/services/commerce/src/main/resources/application.properties`, "mibolt.demo.access-lifetime") |
| `mibolt_session` | `SessionCookieFilter`, on first use of a scoped path | a random token; only its SHA-256 digest is stored (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/session/SessionTokenService.java`) | `mibolt.session.lifetime` (`backend/services/commerce/src/main/resources/application.properties`, "mibolt.session.lifetime"), set once when the cookie is issued; the server-side session and cart expiry extend whenever the cart or the draft changes (rule 19 in the invariants reference; `backend/docs/decisions/0011-cart-version-etag-and-reconciliation.md`, "is static (30 days from issue)") |
| `mibolt_admin_session` | the admin chain's HTTP session | the servlet session id; `HttpOnly`, `Secure`, `SameSite=Strict` | servlet session (`backend/services/commerce/src/main/resources/application.properties`, "Admin session cookie") |
| `XSRF-TOKEN` (`backend/services/commerce/scripts/smoke.sh`, "no XSRF-TOKEN cookie after GET /admin/auth/session") | `CookieCsrfTokenRepository.withHttpOnlyFalse()` with path `/` (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/admin/security/AdminSecurityConfig.java`, "public CookieCsrfTokenRepository adminCsrfTokenRepository()") | the admin CSRF token the SPA sends back in a header | the admin session |

The shop session is anonymous; demo access and admin sign-in are separate
gates, and the shop chain is stateless, so it never uses the admin session.

## The admin chain

`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/admin/security/AdminSecurityConfig.java`
declares two chains (`backend/docs/decisions/0015-admin-security-filter-chains.md`):

- Chain 1, `@Order(1)`, `/admin/**` (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/admin/security/AdminSecurityConfig.java`, "public SecurityFilterChain adminFilterChain"): SPA-mode CSRF, an HTTP
  session, `GET /admin/auth/session` and `POST /admin/auth/login` and
  `/logout` open, everything else through `LiveAdminAuthorizationManager`,
  which also checks that the signed-in admin's row still exists, so a deleted
  admin loses access on the next request.
- Chain 2, `@Order(2)`, everything else (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/admin/security/AdminSecurityConfig.java`, "public SecurityFilterChain publicFilterChain"): `permitAll`, stateless,
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
(`backend/services/commerce/src/main/resources/application.properties`, "First admin (docs/decisions/0016)",
`backend/docs/decisions/0016-admin-accounts-bootstrap-and-password-policy.md`).
The demo user is created once by `DemoAccessBootstrap` from
`MIBOLT_DEMO_USERNAME` and `MIBOLT_DEMO_PASSWORD`, and after that the stored
row wins over the variables (`backend/docs/decisions/0022-demo-access-gate.md`, "the stored row wins").

## Versions and If-Match

Two independent version schemes:

- **Shop.** One counter on the session, `state_version`, shared by the cart
  and the checkout draft (`backend/docs/02-backend.md`, "Kosár és piszkozat."). Every shop
  write hands `If-Match` to `CartService.expectVersion`: the cart controller
  before each service call
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartController.java`, "cartService.expectVersion(session, ifMatch)"),
  the checkout controller through
  `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/checkout/CheckoutService.java` ("public void expectVersion"),
  and the payment-intent and order services only after their price-change
  check, because rule 47 comes first there. The value may be quoted or bare;
  a mismatch is 412
  `CART_VERSION_CONFLICT` with `params.expected` and `params.received`
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartService.java`, "public void expectVersion").
  A missing header is 400 `INVALID_REQUEST` with `params.header`, because the
  generated interface declares it required
  (`backend/services/commerce/src/test/java/com/example/mi_bolt_backend/cart/CartApiTest.java`, "missingOrMalformedIfMatchIs400").
  The version rises once per request that changed something, reconciliation
  notices included (`CartService.finalize`, `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartService.java`, "result.noticeCount() > 0"), and the response
  carries it as the `ETag`
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartController.java`, "private static ResponseEntity<Cart> respond").
  `backend/docs/decisions/0011-cart-version-etag-and-reconciliation.md` records
  why.
- **Admin products.** The JPA `version` column on `product`; every admin write
  sets `updated_at`, so the version rises exactly once per write even when
  only a child row changed (`backend/docs/decisions/0020-admin-catalogue-write-api.md`, "rises exactly once even when only a child row changed").
  `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/admin/catalog/AdminProductEtags.java` ("public final class AdminProductEtags"):
  a missing or blank `If-Match` is 428 `PRECONDITION_REQUIRED`, another
  version is 412 `PRODUCT_VERSION_CONFLICT`.

## Idempotency keys

`POST /orders` and `POST /payment-intents` take an `Idempotency-Key`:

- The replay runs before anything else in the request, the version check
  included (rule 37;
  `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrdersController.java`, "private ResponseEntity<OrderReceipt> placeOrder",
  `backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/PaymentIntentsController.java`, "public ResponseEntity<PaymentIntent> createPaymentIntent").
- A record is keyed on session, method, path and key, and fingerprinted with
  the SHA-256 of the serialised body; payment intents fingerprint the empty
  body. The same key with another fingerprint is 409 `IDEMPOTENCY_CONFLICT`;
  a match replays the stored status, `Location` and body
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/IdempotencyService.java`, "public Optional<OrderData.StoredResponse> replay").
- A record older than `mibolt.idempotency.retention`
  (`backend/services/commerce/src/main/resources/application.properties`, "mibolt.idempotency.retention")
  is ignored on replay and purged when the key is stored again
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/IdempotencyService.java`, "public void store").
- The store runs in the same transaction as the work it records: a
  `TransactionTemplate` around `placeOrder`, retried up to three times on an
  order-number collision
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/OrdersController.java`, "public ResponseEntity<OrderReceipt> createOrder"),
  and `@Transactional` on `createPaymentIntent`
  (`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/PaymentIntentsController.java`, "@Transactional public ResponseEntity<PaymentIntent> createPaymentIntent").
- `backend/docs/decisions/0012-payment-intents-idempotency-and-orders.md`
  records the design.

## Price and stock from a request body

A shop request never sets a price, a stock level or an amount
(`backend/docs/02-backend.md`, "Ár, készlet vagy összeg elfogadása a kérés törzséből"): an order takes its prices, delivery method
and contact data from the draft (rule 44), and a payment intent takes its
amount from the checkout summary
(`backend/services/commerce/src/main/java/com/example/mi_bolt_backend/order/PaymentIntentService.java`, "checkout.summary().total()").
The one exception is the admin catalogue write API, `POST /admin/products` and
`PUT /admin/products/{productId}`, behind chain 1
(`backend/docs/decisions/0020-admin-catalogue-write-api.md`, "The §9 exception."). A new shop
field that looks like a price is computed server-side, never accepted.

## Environment variables

Names and purpose only.
`backend/services/commerce/src/main/resources/application.properties`
holds the defaults, as does the table at `backend/README.md` ("Environment variables the service reads").

| Variable | Purpose |
|---|---|
| `MIBOLT_DB_URL`, `MIBOLT_DB_USER`, `MIBOLT_DB_PASSWORD` | The PostgreSQL connection (`backend/services/commerce/src/main/resources/application.properties`, "spring.datasource.url"). |
| `MIBOLT_ADMIN_INITIAL_PASSWORD` | The first admin's password, read only while `admin_user` is empty (`backend/services/commerce/src/main/resources/application.properties`, "mibolt.admin.initial-password"). |
| `MIBOLT_DEMO_USERNAME`, `MIBOLT_DEMO_PASSWORD` | The demo gate's user, read only while `demo_user` is empty (`backend/services/commerce/src/main/resources/application.properties`, "mibolt.demo.username"). |
| `MIBOLT_PAYMENT_REDIRECT_URL_PREFIX`, `MIBOLT_PAYMENT_RETURN_URL_PREFIX` | Where the demo payment app and the checkout return live (`backend/services/commerce/src/main/resources/application.properties`, "mibolt.payment.redirect-url-prefix"). |
| `MIBOLT_CATALOG_PATH` | The catalogue directory the loader reads (`backend/README.md`, "MIBOLT_CATALOG_PATH"). |

`backend/services/commerce/src/test/resources/application-test.properties` ("pin the payment URL prefixes")
pins the payment prefixes, the admin password and the demo credentials for the
tests, so a variable exported in a developer's shell cannot change a test's
outcome.
