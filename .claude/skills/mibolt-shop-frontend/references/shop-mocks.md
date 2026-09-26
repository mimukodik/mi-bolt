# Shop mocks

The MSW mock backend at `frontend/projects/shop-mocks/src/` (alias
`@mi-bolt/mocks/*`), which the storefront and the payment app run on in
development, and the unit harness that drives it in specs. Paths are relative
to the repository root.

## Contents

1. Domains and files
2. The handler registry
3. Stores, stock and idempotency
4. Scenarios and fault injection
5. Persistence across reloads
6. The browser worker
7. The demo-access gate
8. Driving the mocks from a unit spec
9. Adding or changing a handler

## 1. Domains and files

Each domain is a folder under `frontend/projects/shop-mocks/src/` holding a
`*.handlers.ts` file and the store behind it.

| Domain folder | Routes under `/api/v1` | State |
|---|---|---|
| `frontend/projects/shop-mocks/src/catalog/` | `GET /products`, `/products/{slug}`, `/products/{slug}/related`, `/media/{imageId}` | `CatalogStore`, with filtering and facet counts beside it |
| `frontend/projects/shop-mocks/src/cart/` | `GET /cart`, `POST` and `DELETE /cart/items`, `PATCH` and `DELETE /cart/items/{variantId}` | `CartStore` |
| `frontend/projects/shop-mocks/src/checkout/` | `GET /checkout/options`, `GET` and `PATCH /checkout` | `CheckoutStore`, plus the `OrderStore` it publishes |
| `frontend/projects/shop-mocks/src/payment/` | `POST /payment-intents`, `GET /payment-intents/{id}`, `POST /payment-intents/{id}/outcome` | the `OrderStore` the checkout domain publishes |
| `frontend/projects/shop-mocks/src/orders/` | `POST /orders`, `GET /orders/{orderId}` | the same `OrderStore` |
| `frontend/projects/shop-mocks/src/demo/` | `GET` and `POST /demo/session` | the demo-access flag (section 7) |

The payment and order handlers read the `OrderStore` that
`frontend/projects/shop-mocks/src/checkout/checkout.handlers.ts` creates, so
they work only beside it. The mocks import the generated models from
`@mi-bolt/api/models/*` and so compile against the same contract as the apps.

## 2. The handler registry

`frontend/projects/shop-mocks/src/create-handlers.ts`:

- Each domain file calls `registerBusinessHandlers(entry)` once at module
  load (for example
  `frontend/projects/shop-mocks/src/catalog/catalog.handlers.ts:387`). An
  entry is a function of `CreateHandlersOptions` (repository, clock, ids,
  scenario, `apiRoot`, and in the browser `persist`, `snapshot` and
  `demoAccessStorage`).
- `createHandlers(options)` returns the dispatcher shell first, which answers
  any unclaimed `/api/v1/*` route with a 404 `NOT_FOUND` Problem, then every
  registered entry's handlers. `createStrictHandlers` returns the entries
  without the shell, for a spec that must prove an unknown route fails.
- A module that is never imported never registers. The browser worker
  imports each domain file for that side effect
  (`frontend/projects/shop-mocks/src/browser.ts:54-59`), and a spec imports
  the domain files it needs.

## 3. Stores, stock and idempotency

- Every call to `createHandlers` builds a fresh cart, checkout and order store
  and a fresh stock ledger, and publishes them through module-level
  `{ current }` slots (`cartStore`, `checkoutStore`, `orderStore`,
  `stockLedger`), which is how the browser's `persist` reaches them.
- The catalogue store is module-level and is loaded from
  `frontend/docs/api/fixtures/catalog.json` by `loadCatalogFixture`; the
  browser imports the fixture in
  `frontend/projects/shop-mocks/src/browser.ts:32`, and a spec loads its own
  copy. The fixture is generated from catalogue data, which belongs to
  `mibolt-cross-package-changes`.
- `stockLedger` (`frontend/projects/shop-mocks/src/stock/stock-ledger.ts`)
  lives as long as one handler list: a variant's demo stock is its fixture
  `maxQuantity`, and a sale taken stays taken until the next page load.
- `IdempotencyStore` (`frontend/projects/shop-mocks/src/idempotency.ts`)
  replays a stored answer for the same key and body within 24 hours, and
  answers 409 `IDEMPOTENCY_CONFLICT` for the same key with a different body.
- Problems are built with `problemResponse`
  (`frontend/projects/shop-mocks/src/problem-response.ts`) and served as
  `application/problem+json`. Every cart write answers 412
  `CART_VERSION_CONFLICT` when `If-Match` is missing, malformed or not the
  current version, and an expired cart answers 410 `CART_EXPIRED`
  (`frontend/projects/shop-mocks/src/cart/cart-store.ts`).

## 4. Scenarios and fault injection

A scenario is chosen with `?mi-scenario=<name>` on the page URL and
remembered for the tab under `mi-bolt.scenario` in `sessionStorage`
(`frontend/projects/shop-mocks/src/scenarios.ts:161`). The built-in names are
`default`, `happy-path`, `out-of-stock`, `payment-declined`,
`cart-mutation-fails` and `demo-signed-out` (`BUILT_IN_SCENARIOS`,
`frontend/projects/shop-mocks/src/scenarios.ts:65`). Any other name runs with
the default seed and keeps its own name, which is how the fault families
below need no registry entry.

Fault families, defined in `frontend/projects/shop-mocks/src/faults.ts`:

| Scenario name | Effect |
|---|---|
| `fail-<operation>` | the endpoint answers 503 `SERVICE_UNAVAILABLE` every time |
| `offline-<operation>` | the endpoint fails with a network error every time |
| `fail-once-<operation>`, `offline-once-<operation>` | the same, for the first matching request of each handler list only |
| `slow-once-<operation>` | the first matching request waits `SLOW_ONCE_DELAY_MS` (2000 ms) before the store is read |
| `lost-once-order`, `lost-once-payment-intent` | the first commit succeeds, then its response is replaced by a network error |
| `stock-lost-once-cart-add`, `stock-lost-once-order` | the first matching request takes the variant's whole demo stock |

`<operation>` is one of `FAULT_OPERATIONS`
(`frontend/projects/shop-mocks/src/faults.ts:64`), the storefront endpoints a
fault can break. "Once" means once per handler list, and the browser builds
one list per page load. The handler of each of those operations calls
`faultResponse(options, '<operation>')` and then `slowOnce` before it touches
its store; the committing handlers call `loseResponseOnce` or `stockLostOnce`
where the table above says.

A new operation joins `FAULT_OPERATIONS` together with the `faultResponse`
call in its handler. The end-to-end conventions describe this protocol in
`frontend/e2e/seed.spec.ts`, item 12, so that description changes when the
protocol does; consult the `playwright-tests` skill for how that file is
kept.

## 5. Persistence across reloads

`frontend/projects/shop-mocks/src/persistence.ts` is the only writer of the
snapshot, kept in `sessionStorage` under `mi-bolt.snapshot.<scenario>`.

- A handler calls `persist(sessionId)` after a successful mutation; the
  browser builds the snapshot from the three stores (`buildSnapshot`,
  `frontend/projects/shop-mocks/src/snapshot.ts`).
- `hydrate()` discards a snapshot that is malformed, older than `MAX_AGE_MS`
  (seven days), or of another `SNAPSHOT_SCHEMA_VERSION`
  (`frontend/projects/shop-mocks/src/persistence.ts:49`, currently 4), and
  records why, which the storefront shows through `SNAPSHOT_DISCARD`.
- Bump `SNAPSHOT_SCHEMA_VERSION` when the persisted shape changes
  incompatibly, as the comment above it records for versions 3 and 4.
- When storage is denied, state lives in memory for the page, and the
  storefront learns it through `PERSISTENCE_MODE`.

## 6. The browser worker

`frontend/projects/shop-mocks/src/browser.ts`:

- `startMockWorker` registers handlers one at a time with `worker.use`, which
  prepends, so the evaluation order is the reverse of the registration
  order. It registers the unclaimed-`/api/` network error first, then the
  cross-origin block (403), then the same-origin non-API passthrough, then
  `buildBrowserHandlers`, whose last element, the demo-access gate, is
  consulted first. The comments at
  `frontend/projects/shop-mocks/src/browser.ts:169-197` carry the measured
  ordering.
- The service-worker script is resolved against `document.baseURI`, so it
  works under the payment app's `/demo-fizetes/` base. The script itself is
  `frontend/projects/storefront/public/mockServiceWorker.js`; the development
  builds of the payment app and of the admin both copy it from there
  (`frontend/angular.json:186-187`, `frontend/angular.json:310-311`), so
  moving or replacing it reaches the admin too.
- The production configurations of both apps replace
  `frontend/projects/shop-mocks/src/browser.ts` with
  `frontend/projects/shop-mocks/src/browser.production.ts`, whose
  `startMockWorker` only rejects. Anything an app imports from
  `@mi-bolt/mocks/browser` has to be exported there too, and check a
  production build with `npm --prefix frontend run check:storefront-dist`
  or `check:payment-dist` after `build` or `build:payment`.

## 7. The demo-access gate

`frontend/projects/shop-mocks/src/demo/demo-access.ts` answers 401
`UNAUTHENTICATED` for every gated shop operation while the visitor is signed
out. Every scenario starts signed in except `demo-signed-out`. In the browser
the flag survives a reload under `mi-bolt.demo-access.<scenario>`; in Node it
lives for the handler list. A Node spec that wants the gate passes it first,
because `server.use(...)` keeps array order:
`server.use(createDemoGateHandler(options), ...createHandlers(options))`.

## 8. Driving the mocks from a unit spec

- `frontend/tests/msw-server.ts` holds one MSW Node server. A spec calls
  `useMswServer()` once at module scope; the server listens with
  `onUnhandledRequest: 'error'` and resets its handlers after each test. The
  header of that file explains why each spec calls it rather than relying on
  `frontend/tests/setup-msw.ts` alone.
- The handler list starts empty. A spec that wants the whole mock builds it,
  as `frontend/projects/storefront/src/app/features/cart/cart.facade.spec.ts:114-133`
  does: load the catalogue fixture, import the domain handler modules it
  needs for their registration side effect (the checkout module as well,
  whenever payment or orders are involved), build a `Repository` with
  `createFixedClock` and `createDeterministicIds`, and call
  `server.use(...createHandlers(options))`. A spec that needs one answer
  registers only that route with `http.<method>(...)`.
- `frontend/tests/network-isolation.spec.ts` proves that an unhandled
  `/api/v1` route and an external fetch both reject. It runs under
  `npm --prefix frontend run test:contract` (`frontend/vitest.contract.config.ts`),
  not under `ng test`.
- The storefront and shop-mocks test targets name
  `frontend/tests/setup-msw.ts` in `setupFiles`; the payment app's does not,
  so its spec imports `useMswServer` directly.

## 9. Adding or changing a handler

1. Put the handler in its domain file, answering the contract shape through
   the generated model types. Call `faultResponse` and `slowOnce` first if
   the storefront calls the endpoint.
2. For a new domain file, register it with `registerBusinessHandlers` and add
   its side-effect import to `frontend/projects/shop-mocks/src/browser.ts`.
3. Call `persist` after a successful mutation whose result must survive a
   reload, and bump the snapshot version if the persisted shape changes.
4. Cover it in the domain's `*-mock.spec.ts` or in
   `frontend/projects/shop-mocks/src/mocks-handlers.spec.ts`, and run the
   shop-mocks project's tests.
