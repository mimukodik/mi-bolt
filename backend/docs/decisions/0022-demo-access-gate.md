# 0022 — Demo access gate

## Situation

The demo shop must not be reachable by robots (MIM-423). The owner chose one
fixed demo user whose password is entered on a sign-in page (no username),
a long-lived session cookie, the user and password from the environment and
stored in the database on the first start, and a gate over the SPA and the
API, while the admin application keeps its own sign-in. Contract 2.2.0
declares it: the `demoAccess` cookie scheme (`mibolt_demo_access`),
`GET` and `POST /demo/session`, and a 401 `DemoAccessRequired` on every shop
operation except `GET /media/{imageId}`; contract 2.3.0 gates that one too.

## Decision

- Changeset `0010-demo-access` adds `demo_user` (UUID id, unique username,
  `password_hash` from the existing `DelegatingPasswordEncoder`) and
  `demo_access_session` (the SHA-256 hex digest of the cookie value and its
  expiry, the `shop_session` pattern; the cookie value itself is never
  stored).
- `DemoAccessBootstrap` (`ApplicationRunner`, `@Order(2)`, after
  `AdminBootstrap`) creates the user when `demo_user` is empty, from
  `MIBOLT_DEMO_USERNAME` / `MIBOLT_DEMO_PASSWORD` (defaults `MiBoltDemoUser` /
  `1MiBoltDemo1`; the owner ruled the password not sensitive). A blank value,
  a username over 80 characters or a password over 64 (the contract's
  `maxLength`) stops the start. No admin password policy applies. A changed
  variable after the first start changes nothing: the stored row wins, as
  with the first admin (0016).
- `POST /demo/session` checks the password against the stored hash and sets
  `mibolt_demo_access` (`HttpOnly`, `Secure`, `SameSite=Lax`,
  `Path=/api/v1`, `Max-Age` 30 days, `mibolt.demo.access-lifetime`); a wrong
  password answers 401 `UNAUTHENTICATED` with no cookie. `GET /demo/session`
  answers 204 or 401, so the storefront knows whether to show its sign-in
  page.
- `DemoAccessFilter` (`@Order(HIGHEST_PRECEDENCE + 5)`: after `TraceIdFilter`,
  before `SessionCookieFilter`) gates by default and leaves open `/admin`,
  `/demo/session` and `/actuator`, each as the path itself or the path plus
  `/`. A refused request gets the house Problem through the
  `handlerExceptionResolver`, as `ProblemAuthenticationEntryPoint` renders
  it, and is never issued a `mibolt_session`.
- `/media` is gated too (contract 2.3.0). The first version left it open
  (away decision 1 on MIM-430) so the admin previews would load without a
  demo cookie; the owner reversed that in the away-mode walk. An admin image
  preview now shows only after the same browser has signed in at the shop's
  `/belepes` (the cookie is host-scoped with `Path=/api/v1`); the missing
  preview fallback is MIM-444. `Cache-Control: public, max-age=31536000,
  immutable` stays: the bytes are the same for every visitor and nginx adds
  no shared cache.
- Every `@IntegrationTest` MockMvc request carries a valid demo cookie through
  a `MockMvcBuilderCustomizer` default request, so the shop tests stay as
  they were; a test that sets its own `mibolt_demo_access` cookie replaces it.
- `scripts/smoke.sh` proves the refusal before signing in; the CI start probe
  reads readiness instead of a gated path.

## Consequences

- Robots get a 401 from every shop call; nginx adds `robots.txt`
  (`Disallow: /`) and `X-Robots-Tag: noindex, nofollow` on top (MIM-423
  nginx unit).
- A leaked image URL answers 401 without the cookie, unless a shared cache
  between the visitor and the server already holds it under `public`.
- Expired `demo_access_session` rows are kept; there is no cleanup job.
- The Atlassian validator checks only that a security cookie is present, so
  a contract-validated 401 test sends an invalid cookie rather than none; the
  cookie-less path is proven by `DemoAccessFilterTest`.
