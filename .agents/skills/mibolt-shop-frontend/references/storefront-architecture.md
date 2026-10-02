# Storefront architecture

Bootstrap, routes and guards, layouts, the root services, interceptors and
storage keys of `frontend/projects/storefront/`. Paths are relative to the
repository root. A citation names its target (a heading, function, constant
or distinctive phrase) and never gives a line number; re-read the named part
before relying on it.

## Contents

1. Bootstrap and environments
2. Route table
3. Checkout routes and guards
4. Layouts and the shell
5. Root services
6. Interceptors
7. Storage keys
8. Security-relevant helpers

## 1. Bootstrap and environments

- `frontend/projects/storefront/src/main.ts` ("const start = async") bootstraps directly when
  `environment.production` is true. Otherwise it loads
  `frontend/projects/storefront/src/core/bootstrap-demo.ts` through a dynamic
  `import()`, awaits `startMocks()`, and only then calls
  `bootstrapApplication`. A failed start renders the `#mi-bolt-fatal`
  template instead of a half-booted app.
- `startMocks()` (`frontend/projects/storefront/src/core/bootstrap-demo.ts`,
  "export async function startMocks")
  resolves the scenario (`?mi-scenario=` or the one the tab remembered),
  hydrates the `sessionStorage` snapshot, and starts the worker. It returns
  without starting anything when `environment.demo` is false, and throws in
  production on purpose.
- Two facts from that hydrate reach Angular as DI tokens that the entry point
  provides: `PERSISTENCE_MODE` and `SNAPSHOT_DISCARD`
  (`frontend/projects/storefront/src/app/core/persistence-mode.ts`). App code
  reads the tokens instead of importing the bootstrap module, and imports
  `@mi-bolt/mocks/*` only as `import type`, so the MSW graph stays out of the
  eager bundle.
- `frontend/projects/storefront/src/app/app.config.ts`
  ("Local production / development build providers") provides zoneless
  change detection, `provideHttpClient` with the two interceptors (section 6),
  `provideRouter` with `withComponentInputBinding()` and in-memory scrolling,
  and `provideApiConfiguration(resolveApiRoot())`. Each is a named top-level
  constant, as the file's header comment asks of a new one, and
  `providerManifest` exposes them to
  `frontend/projects/storefront/src/app/app.spec.ts`.
- Environments: `frontend/projects/storefront/src/environments/environment.ts`
  is production (`production: true`, `demo: false`),
  `frontend/projects/storefront/src/environments/environment.development.ts`
  is the MSW demo (`production: false`, `demo: true`), and
  `frontend/projects/storefront/src/environments/environment.local-backend.ts`
  talks to the real backend (`demo: false`). `frontend/angular.json` swaps
  them per configuration. The production file's header makes
  `environment.production` the only switch for production decisions.

## 2. Route table

`frontend/projects/storefront/src/app/app.routes.ts`. Every page is a
`loadComponent` with its own `title`.

| Path | Layout | Guard | Page |
|---|---|---|---|
| (empty path) | `MarketingLayout` | `demoAccessGuard` | `HomePage` |
| `telefonok` | `ShopLayout` | `demoAccessGuard` | `CatalogPage` |
| `telefonok/:slug` | `ShopLayout` | `demoAccessGuard` | `ProductPage` |
| `kosar` | `ShopLayout` | none | redirect to `/penztar/kosar`, query and fragment kept |
| `penztar` | per child | `demoAccessGuard` | `loadChildren` into `checkoutRoutes` |
| `belepes` | none | none (the one open route) | `DemoSignInPage` |
| `primitives` | none | `demoAccessGuard` | `PrimitivesShowcase` (internal) |
| `**` | `ShopLayout` | `demoAccessGuard` | `NotFoundPage`, must stay last |

`demoAccessGuard`
(`frontend/projects/storefront/src/app/core/demo-access/demo-access.guard.ts`)
asks `DemoAccess.check()` and otherwise redirects to `/belepes` with the
wanted URL in `vissza`. A new gated route carries it.

## 3. Checkout routes and guards

`frontend/projects/storefront/src/app/features/checkout/checkout.routes.ts` ("checkoutRoutes")
mounts each step under its own `CheckoutLayout`, with the step name in route
`data`, which the layout reads as its required `step` input.

| Path under `/penztar` | `data.step` | Guard | Component |
|---|---|---|---|
| (empty path) | `review` | none | `PaymentReturnPage`, the cold return from payment |
| `kosar` | `cart` | none | `CartPage` |
| `adatok` | `contact` | `contactGuard` (canMatch) | `ContactPage`, with a route-level `CONTACT_DRAFT_SAVER` provider |
| `szallitas` | `delivery` | `deliveryGuard` (canMatch) | `DeliveryPage` |
| `ellenorzes` | `review` | `reviewGuard` (canMatch) | `ReviewPage` |
| `siker/:orderId` | `success` | `successGuard` (canActivate) | `SuccessStep` |

Every class above lives in
`frontend/projects/storefront/src/app/features/checkout/` except `CartPage`,
which is `frontend/projects/storefront/src/app/features/cart/cart-page.ts`.

- **Guards hydrate, then decide.** `contactGuard`, `deliveryGuard` and
  `reviewGuard` inject everything before their first `await`, await
  `CartFacade.ensureCart()` and `CheckoutFacade.ensureSession()`, then return
  `true` or a `UrlTree` to the earliest unsatisfied step, carrying a
  `navigationReason` query parameter (`frontend/projects/storefront/src/app/features/checkout/checkout.guards.ts`,
  "export type NavigationReason").
  The header of that file
  (`frontend/projects/storefront/src/app/features/checkout/checkout.guards.ts`, "Checkout wizard route guards.")
  explains why hydration sits inside each guard rather than in a separate
  guard in front of it. `successGuard` stays synchronous.
- **Pages decide, steps render.** `ContactPage`, `DeliveryPage` and
  `ReviewPage` hold the facades and turn outcomes into navigation;
  `ContactStep`, `DeliveryStep` and `ReviewStep` render. The success route
  loads `SuccessStep` directly; the `SuccessPage` name is only a re-export of
  it.
- `NavigationReasonBanner` reads `navigationReason` on the cart, contact and
  delivery pages and shows the sentence `navigationReasonMessage`
  (`frontend/projects/storefront/src/app/features/checkout/navigation-reason.ts`, "navigationReasonMessage")
  maps it to. A new reason extends the union and that function.

## 4. Layouts and the shell

`MarketingLayout`, `ShopLayout` and `CheckoutLayout`
(`frontend/projects/storefront/src/app/layouts/`) each wrap `AppShell`
(`frontend/projects/storefront/src/app/shared/shell/app-shell.ts`) around a
`<router-outlet>`. `AppShell` takes a required `variant` (`HeaderVariant`:
`marketing`, `shop` or `checkout`, from
`frontend/projects/storefront/src/app/core/navigation/header-nav.ts`) and
renders the header, the footer and `DemoNotice`.
`frontend/projects/storefront/src/app/core/navigation/` holds the header,
footer and mobile drawer. `BREADCRUMB_VISIBLE`
(`frontend/projects/storefront/src/app/core/navigation/breadcrumb-visibility.ts`, "BREADCRUMB_VISIBLE")
is `false`, which keeps the breadcrumb switched off.

## 5. Root services

All six are `@Service()` classes that use `inject()`.

| Service | File | `Api` built by | Owns |
|---|---|---|---|
| `CatalogFacade` | `frontend/projects/storefront/src/app/features/catalog/catalog.facade.ts` ("export class CatalogFacade") | `inject(Api)` | the URL-driven query, results, facets, `vm` |
| `ProductFacade` | `frontend/projects/storefront/src/app/features/product/product.facade.ts` ("export class ProductFacade") | `inject(Api)` | product, variant selection, gallery, related, `vm` |
| `CartFacade` | `frontend/projects/storefront/src/app/features/cart/cart.facade.ts` ("export class CartFacade") | `new Api(...)` | the cart snapshot, its version, `error`, `conflict`, `cartExpired` |
| `CheckoutFacade` | `frontend/projects/storefront/src/app/features/checkout/checkout.facade.ts` ("export class CheckoutFacade") | `new Api(...)` | session, options, payment intent, order, `priceChange` |
| `OrderSubmission` | `frontend/projects/storefront/src/app/features/checkout/order-submission.ts` ("export class OrderSubmission") | none (calls `CheckoutFacade`) | eight `SubmitOutcome` kinds |
| `DemoAccess` | `frontend/projects/storefront/src/app/core/demo-access/demo-access.ts` ("export class DemoAccess") | `inject(Api)` | the demo gate's answer for this page load |

`HomePage` (`frontend/projects/storefront/src/app/features/home/home-page.ts`, "inject(Api)")
also calls `inject(Api)`. Which construction a new unit takes is not
settled; entry C2 of the conflict register in
`mibolt-frontend-code-standards` records both.

- `CartFacade` fetches the cart once in its constructor, so the header badge
  is right after a reload. `CartCountFacade` in
  `frontend/projects/storefront/src/app/core/navigation/cart-count-facade.ts`
  is the same class re-exported.
- `CheckoutFacade` never owns a version. It reads `cart.cart().version` for
  `If-Match` and writes each answer back through
  `CartFacade.acceptServerVersion`
  (`frontend/projects/storefront/src/app/features/cart/cart.facade.ts`, "acceptServerVersion(version: number)").
- Failure routing is one private function per facade (`recordFailure`), so
  412, 410 and other problems always land in the same signal. A 404 on an
  intent or order read is returned to the caller and never becomes a banner.

## 6. Interceptors

The order in `frontend/projects/storefront/src/app/app.config.ts` is
`demoSessionInterceptor`, then `demoAccessInterceptor`.

- `demoSessionInterceptor` (`frontend/projects/core-api/src/demo-session.interceptor.ts`)
  adds `X-Demo-Session` to every request and writes `If-Match` from the
  `HttpContext` that `withIfMatch(version)` builds. Pass that context as the
  third argument of `api.invoke`. `core-api` changes belong to
  `mibolt-cross-package-changes`.
- `demoAccessInterceptor`
  (`frontend/projects/storefront/src/app/core/demo-access/demo-access.interceptor.ts`)
  catches a gated 401, marks the visitor signed out, and navigates to
  `/belepes?vissza=<current url>`, unless the visitor is already there.

## 7. Storage keys

Only `sessionStorage` is used, and every read and write sits in `try`/`catch`
and degrades to page-local state when storage is denied.

| Key | Owner |
|---|---|
| `mi-bolt.demo-session` | `frontend/projects/core-api/src/demo-session.interceptor.ts` |
| `mi-bolt.checkout.intent-key`, `.order-key`, `.intent-id`, `.terms-accepted` | `frontend/projects/storefront/src/app/features/checkout/checkout-keys.ts` |
| `mi-bolt.scenario` | `frontend/projects/shop-mocks/src/scenarios.ts` |
| `mi-bolt.snapshot.<scenario>` | `frontend/projects/shop-mocks/src/persistence.ts` |
| `mi-bolt.demo-access.<scenario>` | `frontend/projects/shop-mocks/src/demo/demo-access.ts` |

`checkoutKeys` applies "uncertain retains, definite rotates": a failure with
status 0 or 5xx keeps the idempotency key so the retry replays the same
request, any other failure rotates it, and a placed order clears every key
(`CheckoutFacade.resetAfterOrder`).

## 8. Security-relevant helpers

- `resolveAssetUrl`
  (`frontend/projects/storefront/src/app/shared/media/resolve-asset-url.ts`, "export function resolveAssetUrl")
  is the only producer of an `<img src>`. It accepts an absolute `http(s)`
  URL or a root-relative path, and refuses protocol-relative, relative,
  encoded and dot-segment paths and every other scheme.
- `isSafeReturnUrl`
  (`frontend/projects/storefront/src/app/core/demo-access/demo-access.ts`, "export function isSafeReturnUrl")
  admits a post-sign-in `vissza` only as a same-origin absolute path with no
  backslash that is not the sign-in route itself.

Route every new image or return target through these two. Do not add a
second path around them.
