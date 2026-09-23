# 0015 — Admin API security: two Spring Security filter chains

## Situation

The admin API (`/api/v1/admin/**`) needs sign-in, CSRF protection, session
cookies and 401/403 Problem bodies. The same Spring Boot application serves
the shop under `/api/v1` for catalogue, cart, checkout, payment intents,
orders and media; the shop uses `mibolt_session` cookies, no CSRF tokens
and a constant `Cache-Control` on its media reads. Anything that touches the
admin layer must not move the shop.

Two ways to draw the line:

1. **One filter chain, two `securityMatcher` blocks.** Spring Security
   supports multiple matchers on a single chain, but a single
   `securityContextRepository`, a single CSRF policy and a single
   `exceptionHandling` block apply to everything the chain sees. Either
   the chain wears the admin defaults (csrf.spa(), HTTP session) and the
   shop keeps its permissive behaviour through a hand-rolled "shop"
   matcher, or the chain keeps the shop defaults and the admin path
   re-enables everything it needs. Both end up with conditional code
   inside one config class, and CSRF defaults can quietly leak back in.
2. **Two filter chains, ordered, with separate defaults.** Chain 1
   (`@Order(1)`, `securityMatcher("/admin/**")`) carries the admin
   defaults; chain 2 (`@Order(2)`, no matcher, `permitAll()`) carries
   every other request with the shop defaults explicitly re-stated.

## Decision

Two chains, ordered.

### Chain 1 — `/admin/**`

- `@Order(1)`, `securityMatcher("/admin/**")`.
- `authorizeHttpRequests`: `GET /admin/auth/session`, `POST /admin/auth/login`,
  `POST /admin/auth/logout` → `permitAll()`; `anyRequest()` →
  `access(liveAdminAuthorizationManager)` (authenticated **and** the
  principal's `admin_user` row still exists).
- `csrf(c -> c.spa().csrfTokenRepository(adminCsrfTokenRepository))` with
  `CookieCsrfTokenRepository.withHttpOnlyFalse()` and `setCookiePath("/")`
  (the SPA lives at `/admin/`; the context path `/api/v1` would hide the
  cookie from `document.cookie`).
- `exceptionHandling`: `authenticationEntryPoint(ProblemAuthenticationEntryPoint)`,
  `accessDeniedHandler(ProblemAccessDeniedHandler)` — Spring Security routes
  CSRF failures through the access-denied handler.
- `formLogin`, `httpBasic`, `logout`, `requestCache` → `disable()`.
  Default headers stay **on**: admin JSON must carry Spring's `no-store`.
- `securityContext(c -> c.securityContextRepository(adminSecurityContextRepository))`
  with an `HttpSessionSecurityContextRepository` bean (the B5 login
  controller saves into the same bean).

### Chain 2 — everything else

- `@Order(2)`, no matcher. `anyRequest().permitAll()`.
- `csrf`, `headers`, `requestCache`, `formLogin`, `httpBasic`, `logout` →
  `disable()`. `sessionManagement(STATELESS)`.
- With headers left on, every cart/checkout/order response would gain
  `no-store` and `X-Frame-Options` (CacheControlHeadersWriter and
  HeaderWriterFilter in Spring Security 7.1.1); with CSRF on, every
  state-changing shop request would 403. Chain 2's test
  (`PublicChainUnchangedTest`) guards against that regression.

### 401 and 403 bodies

`ProblemAuthenticationEntryPoint` and `ProblemAccessDeniedHandler`
delegate to the MVC `HandlerExceptionResolver` bean with a
`DomainException`, so `ProblemAdvice.handleDomain`
(`problem/ProblemAdvice.java:58-61`) renders the house Problem with the
trace id. Access denied: a `CsrfException` (covers `MissingCsrfTokenException`
and the invalid-token case) → 403 `CSRF_TOKEN_INVALID`; any other denial
→ invalidate the session, 401 `UNAUTHENTICATED`.

### Live-admin re-check

`LiveAdminAuthorizationManager implements
AuthorizationManager<RequestAuthorizationContext>` (Spring Security 7.1.1
`AuthorizationManager.authorize(Supplier<? extends Authentication>,
RequestAuthorizationContext)`). Grants only when the principal is an
`AdminPrincipal` and `adminUserRepository.existsById(principal.id())`;
otherwise denies. One primary-key read per admin request; a deleted admin
loses access on the next request.

### Session cookie attributes

`server.servlet.session.cookie.name=mibolt_admin_session`,
`.http-only=true`, `.secure=true`, `.same-site=strict`. The shop keeps
its own `mibolt_session` cookie (SameSite=Lax, issued by
`SessionCookieFilter`); chain 2's `STATELESS` session policy means it
never sees the admin cookie.

## Consequences

- Shop headers and cookies are unchanged: `PublicChainUnchangedTest`
  walks the catalogue, media, cart and checkout paths and asserts that
  no Spring header, no `Set-Cookie` other than `mibolt_session`, and
  no CSRF token requirement reaches them. The media cache header
  (`public, max-age=31536000, immutable`) survives.
- The first admin request hits the primary key once. For a 401 the
  `ProblemAuthenticationEntryPoint` short-circuits the check; for a
  valid session the `LiveAdminAuthorizationManager` runs it. The
  orchestrator's curl probes and B16's CI smoke confirm the boot-time
  story on PostgreSQL.
- MockMvc addresses `/admin/...` with an empty context path and cannot
  prove the real-server path; `PathPatternRequestMatcher` strips
  `/api/v1` before matching (Spring Security 7.1.1 source). The
  orchestrator's curl probes on the booted jar and B16's CI smoke do.
- Declaring `AdminUserDetailsService` and the `AuthenticationManager`
  bean switches Boot's `UserDetailsServiceAutoConfiguration` off
  (`@ConditionalOnMissingBean({AuthenticationManager,
  AuthenticationProvider, UserDetailsService,
  AuthenticationManagerResolver})`); the
  `Using generated security password` log line must not appear. Gate
  `grep -c 'Using generated security password' /tmp/b4-check.log` → `0`.

## Follow-ups

- B5 implements the login/logout controllers and the `AdminBootstrap`
  that mints the first admin.
- B6 implements the `/admin/users` CRUD.
- B16 wires the CI smoke against the real `/api/v1` context path.