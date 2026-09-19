/**
 * Browser MSW worker — T02 network-isolation proof, extended by T05.
 *
 * The worker is the only place that owns business API traffic in the
 * browser. Playwright's request observer cannot see requests that
 * are intercepted by the service worker, so the gate combines
 * MSW's `unhandled` event, Playwright's request log and the
 * "open sockets" check, now in `e2e/network-isolation.spec.ts`, to prove the
 * page is not reaching the network for any business call.
 *
 * Static assets (Vite dev server chunks, `/mockServiceWorker.js`,
 * `/assets/...`) are explicitly bypassed so the page can still boot
 * in the demo / e2e environment. Every `/api/...` request no business
 * slice claims is answered with `HttpResponse.error()` instead, so a
 * page-side `fetch()` rejects with a real network error rather than
 * reaching the network or resolving with a status.
 *
 * `createHandlers` builds the actual handler list from the injected
 * repository / clock / ids / scenario / apiRoot; T05 only owns the
 * dispatcher shell that 404s on routes no business slice has wired
 * up. T06–T09 register their own slices by calling
 * `registerBusinessHandlers(...)` from their files.
 */
import { http, HttpResponse, passthrough, type HttpHandler } from 'msw';
import { setupWorker } from 'msw/browser';

import { environment } from '../environments/environment';
// Static import keeps the JSON in the bundle. The browser worker
// seeds the in-memory repository from this fixture on construction
// so the catalog endpoint returns the demo data instead of an empty
// items array.
import productsFixture from '../../docs/api/fixtures/products.json';
import {
  createHandlers,
  createStrictHandlers,
  type CreateHandlersOptions,
} from './create-handlers';
import { Repository, type Product } from './repository';
import { createRealClock, createRealIds, parseScenarioFromLocation } from './scenarios';
import { createBrowserPersistence, type MockSnapshot } from './persistence';
import { buildSnapshot } from './snapshot';

// Force-load the slice handler modules so their module-level
// registerBusinessHandlers(...) calls populate the create-handlers
// registry before buildBrowserHandlers() reads it.
import './catalog/catalog.handlers';
import './cart/cart.handlers';
import './checkout/checkout.handlers';
import './payment/payment.handlers';
import './orders/order.handlers';

export const worker = setupWorker();

/**
 * The `production` scenario is the only one that runs with an empty
 * catalog: every demo / e2e / happy-path / out-of-stock /
 * payment-declined variant expects the fixture to be present so the
 * page renders the catalogue rather than an empty state.
 */
const PRODUCTION_SCENARIO_NAME = 'production';

function loadCatalogFixture(repository: Repository, scenarioName: string): void {
  if (scenarioName === PRODUCTION_SCENARIO_NAME) {
    repository.loadProducts([]);
    return;
  }
  repository.loadProducts(productsFixture as readonly Product[]);
}

/**
 * Build the handler factory options the browser worker uses. T05
 * owns only the dispatcher shell; T06–T09 will add their own slices
 * by calling `registerBusinessHandlers(...)` from their files.
 */
export function resolveBrowserHandlerOptions(): CreateHandlersOptions {
  const scenario = parseScenarioFromLocation();
  const ids = createRealIds();
  const clock = createRealClock(scenario.clockOffsetMs);
  const repository = new Repository(scenario, ids, clock);
  loadCatalogFixture(repository, scenario.name);
  const persistence = createBrowserPersistence({ nowMs: () => Date.parse(clock.now()) });
  return {
    repository,
    clock,
    ids,
    scenario,
    apiRoot: '/api/v1',
    persist: (sessionId: string) => {
      persistence.save(
        scenario.name,
        buildSnapshot(repository, sessionId, Date.parse(clock.now())),
      );
    },
  };
}

/**
 * Install a global passthrough for every non-business route. The
 * dev server still serves its own Vite chunks, source maps and the
 * mockServiceWorker.js bundle; intercepting those would break the
 * page. `installUnclaimedApiRouteNetworkError` owns the `/api/...`
 * half with the exactly complementary predicate.
 */
export function installBusinessRouteBypass(): void {
  const bypassAllNonApi: HttpHandler = http.all(
    ({ request }) => !new URL(request.url).pathname.startsWith('/api/'),
    () => passthrough(),
  );
  worker.use(bypassAllNonApi);
}

/**
 * Install the catch-all that refuses every `/api/...` request no
 * business slice claimed. `HttpResponse.error()` is a `Response`
 * (`msw/src/core/HttpResponse.ts:55-57`), so the service worker
 * source posts it as a `status: 0` mocked response
 * (`msw/src/browser/sources/service-worker-source.ts:496-500`) and
 * `public/mockServiceWorker.js:325-329` turns that back into
 * `Response.error()`: the page-side `fetch()` rejects. Throwing from
 * the `onUnhandledRequest` callback cannot produce that, because
 * `errorWith` forwards only a `Response` and answers anything else
 * with a 500 (`service-worker-source.ts:502-528`).
 *
 * The predicate is the exact complement of
 * `installBusinessRouteBypass`'s, so every request is claimed by
 * exactly one of the two and neither can shadow the other.
 *
 * Register this BEFORE the business handlers. `use()` prepends each
 * call's handlers to the list
 * (`msw/src/core/experimental/handlers-controller.ts:71-95`), so the
 * evaluation order is the reverse of the registration order;
 * measured against the installed msw 2.15.0, registering catch-all,
 * bypass, businessA, businessB in that order lists them as
 * `businessB -> businessA -> bypass -> catchAll`. Registered last it
 * would instead shadow every business route.
 */
export function installUnclaimedApiRouteNetworkError(): void {
  const failUnclaimedApiRoute: HttpHandler = http.all(
    ({ request }) => new URL(request.url).pathname.startsWith('/api/'),
    () => HttpResponse.error(),
  );
  worker.use(failUnclaimedApiRoute);
}

/**
 * Returns the current handler list without starting the worker.
 * The bootstrap helper in `core/bootstrap-demo.ts` calls this when
 * it needs to register handlers before hydration or for testing.
 * An optional snapshot seeds the in-memory repository with the
 * previously-persisted cart so a reload restores state before the
 * first intercepted request lands.
 */
export function buildBrowserHandlers(
  snapshot: MockSnapshot | null = null,
): ReturnType<typeof createHandlers> {
  const options = resolveBrowserHandlerOptions();
  if (snapshot?.cart) {
    options.repository.loadPersistedCart(snapshot.cart, snapshot.simulatedSessionId);
  }
  if (snapshot?.receipts) {
    options.repository.loadPersistedOrders(snapshot.receipts, snapshot.simulatedSessionId);
  }
  // The E2E configuration preserves the T02 network-isolation gate:
  // an unhandled `/api/v1/...` request must throw so the suite catches
  // the leak. The demo configuration adds the dispatcher shell so a
  // misrouted curl does not produce a stack trace inside the page.
  return environment.e2e ? createStrictHandlers(options) : createHandlers(options);
}

/**
 * Boots the MSW service worker. Production builds skip the boot
 * entirely; demo and e2e configurations register the handlers built
 * by `createHandlers` behind the `/api/...` network-error catch-all
 * that keeps them the only way out. The optional snapshot is
 * forwarded to `buildBrowserHandlers` so the repository is seeded
 * with the persisted cart before the first request is dispatched.
 */
export async function startMockWorker(snapshot: MockSnapshot | null = null): Promise<void> {
  if (!environment.demo && !environment.e2e) return;

  // Registration order is evaluation order reversed, so the
  // catch-all goes in first to be consulted last — after every
  // business handler. See `installUnclaimedApiRouteNetworkError`.
  installUnclaimedApiRouteNetworkError();
  installBusinessRouteBypass();
  for (const handler of buildBrowserHandlers(snapshot)) {
    worker.use(handler);
  }
  await worker.start({
    onUnhandledRequest() {
      // Static assets, source maps, the mock worker bundle itself
      // and the Vite dev server chunks all bypass MSW silently.
    },
    serviceWorker: {
      url: '/mockServiceWorker.js',
    },
  });
}
