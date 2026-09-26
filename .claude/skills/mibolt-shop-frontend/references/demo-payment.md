# Demo payment and the payment round trip

The demo payment app at `frontend/projects/demo-payment/` and both legs of
the card-payment redirect between it and the storefront. Paths are relative
to the repository root. The protocol is
`contracts/commerce/kommunikacio.md` §8.3: the shop leaves for the payment
page with a full page load, the page posts one outcome, and the browser
returns to the shop with another full page load and a GET.

## Contents

1. Files and boot
2. `PaymentPage` states
3. Outcomes and the return
4. The storefront side
5. Ports and proxies
6. Tests and checks

## 1. Files and boot

- `frontend/projects/demo-payment/src/main.ts` registers the `hu-HU` locale
  for `CurrencyPipe`. Under `isDevMode()` it starts the shop mocks before
  bootstrapping: it hydrates the snapshot of the scenario the shop's tab
  remembered and writes the outcome back under that name, while its own
  handlers run the scenario its own URL names
  (`frontend/projects/demo-payment/src/main.ts:16-34` explains why).
- `frontend/projects/demo-payment/src/app/app.config.ts` provides zoneless
  change detection, `HttpClient` with `demoSessionInterceptor` only, the
  router with `withComponentInputBinding()`, and the shop SDK's
  `provideApiConfiguration(resolveApiRoot())`.
- `frontend/projects/demo-payment/src/app/app.routes.ts`: the empty path and
  `:paymentIntentId` both render `PaymentPage`; everything else redirects to
  the empty path.
- `frontend/projects/demo-payment/src/app/payment-page.ts` is the whole
  feature, with its template and plain `.css` stylesheet beside it.
- The app styles itself with its own `--pay-*` custom properties, declared in
  `frontend/projects/demo-payment/src/styles.css`, not with
  `frontend/projects/storefront/src/styles/tokens.css`. The header of that
  file (`frontend/projects/demo-payment/src/styles.css:9-18`) takes the
  shop's numeric scales and a few of its colours (white, the error red, the
  demo banner's warning pair) from `frontend/docs/design/yettel.md` §2 and
  §9, and keeps the palette and the typeface deliberately its own.
  Entry C6 of the conflict register in `mibolt-frontend-code-standards`
  records the design-scope question this raises; this skill does not settle
  it.

## 2. `PaymentPage` states

`PageState`
(`frontend/projects/demo-payment/src/app/payment-page.ts:68-77`) is one
discriminated union in one signal; everything else is `computed`.

| State | Reached when |
|---|---|
| `loading` | the intent read is in flight |
| `ready` | the intent's status is `requires_action` |
| `submitting` | an outcome was chosen and its POST is in flight |
| `redirecting` | the POST succeeded; the page is leaving for `returnUrl` |
| `missing-id` | the route carried no id |
| `not-found` | the read answered 404 |
| `demo-access` | any call answered 401; the page links to the shop's `/belepes` |
| `closed` | the intent is already terminal, read directly or after a 409 |
| `error` | any other failure, recording whether `load` or `submit` failed |

- `display()` collapses the states into `loading`, `card` and `alert`, and
  `ALERT_MESSAGES` holds the Hungarian alert copy.
- Retry re-runs exactly the step recorded in the `error` state.
- A 409 on the outcome POST means the intent was already resolved. The page
  never repeats the POST; it re-reads the intent and shows the booked
  outcome (`showBookedOutcome`).

## 3. Outcomes and the return

- The outcomes are the contract's `PaymentOutcomeRequest['outcome']`:
  `succeeded`, `declined`, `pending`. `OUTCOME_LABELS` is a
  `Record` over that type, so an outcome added to the contract does not
  compile here until it has a label. A contract change is
  `mibolt-cross-package-changes` work first.
- The request carries only `outcome`, so the page renders no card field, and
  it carries no real provider's name or branding
  (`contracts/commerce/kommunikacio.md` §8.3).
- The return goes through `LOCATION_ASSIGN`, a root `InjectionToken` whose
  factory calls `window.location.assign`. It is never a router navigation,
  and the spec overrides the token to observe the URL.
- `PaymentPage` builds its `Api` with `new Api(...)` in its constructor,
  like the storefront's cart and checkout facades.

## 4. The storefront side

- **Leaving.** `CheckoutFacade.createPaymentIntent()` creates the intent with
  an idempotency key and stores its id in `sessionStorage`. `ReviewPage`
  sends the browser to the intent's `redirectUrl` through the storefront's
  own `LOCATION_ASSIGN`
  (`frontend/projects/storefront/src/app/features/checkout/review-page.ts:59`).
  The two apps keep separate tokens because lint forbids one app importing
  another.
- **URLs.** The mock issues `redirectUrl` `/demo-fizetes/<id>` and
  `returnUrl` `/penztar?paymentIntentId=<id>`, with `&mi-scenario=<name>`
  appended under a named scenario
  (`frontend/projects/shop-mocks/src/orders/order-store.ts:274-275`).
- **Returning.** `/penztar` with no child path loads `PaymentReturnPage`
  (`frontend/projects/storefront/src/app/features/checkout/payment-return-page.ts`).
  It has no guard, because the SPA starts cold; it hydrates the cart and the
  session, reads the intent through `CheckoutFacade.readPaymentIntent`, and
  navigates to `/penztar/ellenorzes`. A bare `/penztar` lands on the cart.
  `ReviewPage` owns every branch on the intent's status, including the
  bounded re-read of a `pending` one.

## 5. Ports and proxies

- **On the MSW mock** (`mise run frontend`, or `mise run storefront` plus
  `mise run payment`): the storefront serves on 4200 and
  `frontend/proxy.conf.json` forwards `/demo-fizetes` to the payment dev
  server on 4210 (`servePath` `/demo-fizetes`, `frontend/angular.json`), so
  the shopper stays on the 4200 origin.
- **On the real backend** (`mise run dev`): the backend hands out an absolute
  `redirectUrl` on `http://localhost:4210` and a `returnUrl` on
  `http://localhost:4200/penztar`; the payment app's `local-backend` serve
  configuration builds `production`, so no mock starts, and
  `frontend/proxy.payment.conf.json` forwards `/api` to port 8080.
  `frontend/README.md` ("Configurations: mock or real backend") describes
  both modes.
- Starting and stopping these servers is the orchestrator's
  (`.claude/rules/session-lifecycle.md`, "Tools and startup"). Changing a
  port or proxy belongs to `mibolt-workspace-ops`.

## 6. Tests and checks

- `frontend/projects/demo-payment/src/app/payment-page.spec.ts` drives the
  page over the shared MSW Node server: it calls `useMswServer()` itself,
  because the payment app's test target has no `setupFiles`, registers each
  intent answer with `server.use(...)`, and overrides `LOCATION_ASSIGN`.
- `npm --prefix frontend run build:payment` writes the production build under
  `frontend/dist/`; `npm --prefix frontend run check:payment-dist` then fails
  if MSW reached that output.
- `npm --prefix frontend run check:payment-boot` serves the app with
  `ng serve` on port 4299 and checks that the mock worker script is served
  under `/demo-fizetes/` (`frontend/scripts/check-app-boot.mjs:1-20`). It
  starts a server, so run it only where the task allows that.
- End-to-end coverage of the round trip is
  `frontend/e2e/smoke/card-payment-round-trip-reaches-the-receipt.spec.ts`
  and the specs under `frontend/e2e/integration/` whose names contain
  `payment`. They belong to the `playwright-tests` skill.
