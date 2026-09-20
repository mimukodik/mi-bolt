/**
 * Browser MSW worker — T02 network-isolation proof, extended by T05.
 *
 * The worker is the only place that owns business API traffic in the
 * browser: MSW's `unhandled` event proves the page is not reaching
 * the network for any business call.
 *
 * Static assets (Vite dev server chunks, `/mockServiceWorker.js`,
 * `/assets/...`) are explicitly bypassed, but only when the request is
 * addressed to the page's own origin — a pathname alone cannot tell
 * the page's own `/assets/x.webp` from `https://cdn.example/assets/x.webp`.
 * Every `/api/...` request no business slice claims is answered with
 * `HttpResponse.error()` instead, so a page-side `fetch()` rejects with
 * a real network error rather than reaching the network or resolving
 * with a status. Every other cross-origin request — a script, a font,
 * a telemetry beacon, another company's API — is answered with an
 * explicit 403 rather than passed through: the requirement is that
 * "external scripts, fonts, telemetry and business hosts are disallowed",
 * and `docs/spec/
 * architecture.md` §8 and `docs/spec/acceptance.md` AC25 build the
 * whole demo on the premise that the page reaches no network at all.
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
import { createHandlers, type CreateHandlersOptions } from './create-handlers';
import { Repository, type Product } from './repository';
import { createRealClock, createRealIds, parseScenarioFromLocation } from './scenarios';
import { createBrowserPersistence, type MockSnapshot } from './persistence';
import { buildSnapshot } from './snapshot';
import { isSameOriginNonBusiness } from './business-route-predicates';

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
 * catalog: every demo / happy-path / out-of-stock /
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
 * Install a passthrough for the page's own non-business routes. The
 * dev server still serves its own Vite chunks, source maps and the
 * mockServiceWorker.js bundle; intercepting those would break the
 * page. `installUnclaimedApiRouteNetworkError` owns the same-origin
 * `/api/...` half, and `installCrossOriginBlock` owns every request
 * addressed to a different origin.
 */
export function installBusinessRouteBypass(): void {
  const pageOrigin = globalThis.location.origin;
  const bypassSameOriginNonApi: HttpHandler = http.all(
    ({ request }) => isSameOriginNonBusiness(new URL(request.url), pageOrigin),
    () => passthrough(),
  );
  worker.use(bypassSameOriginNonApi);
}

/**
 * Install the outright block for every request addressed to another
 * origin — a script, a font, a telemetry beacon, another company's
 * API. The resolver returns a 403 `Response`, so the request is
 * answered inside the service worker and nothing ever leaves the
 * browser; it does not `passthrough()` and does not throw, because a
 * thrown error surfaces as a generic network error indistinguishable
 * from an offline machine.
 */
export function installCrossOriginBlock(): void {
  const pageOrigin = globalThis.location.origin;
  const blockCrossOrigin: HttpHandler = http.all(
    ({ request }) => new URL(request.url).origin !== pageOrigin,
    ({ request }) => {
      console.error(`[mi-bolt] blocked external request: ${request.method} ${request.url}`);
      return HttpResponse.json(
        {
          type: 'about:blank',
          title: 'External request blocked',
          status: 403,
          detail: 'The MiBolt demo makes no external requests (T05-AC05).',
        },
        { status: 403 },
      );
    },
  );
  worker.use(blockCrossOrigin);
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
 * This predicate matches any `/api/...` pathname regardless of
 * origin, so on its own it would also catch a foreign origin's
 * `/api/...` request; `installCrossOriginBlock`'s handler is
 * registered so it is evaluated first and claims that case instead,
 * with an explicit 403 rather than a generic network error. This
 * catch-all is reached only for a same-origin `/api/...` request no
 * business slice claimed.
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
  // The demo configuration adds the dispatcher shell so a misrouted
  // curl does not produce a stack trace inside the page.
  return createHandlers(options);
}

/**
 * Boots the MSW service worker. Production builds skip the boot
 * entirely; the demo configuration registers the handlers built
 * by `createHandlers` behind the `/api/...` network-error catch-all
 * that keeps them the only way out. The optional snapshot is
 * forwarded to `buildBrowserHandlers` so the repository is seeded
 * with the persisted cart before the first request is dispatched.
 */
export async function startMockWorker(snapshot: MockSnapshot | null = null): Promise<void> {
  if (!environment.demo) return;

  // Registration order is evaluation order reversed, so the
  // catch-all and the cross-origin block go in first to be consulted
  // last — after every business handler and after the same-origin
  // bypass. See `installUnclaimedApiRouteNetworkError`.
  installUnclaimedApiRouteNetworkError();
  installCrossOriginBlock();
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
