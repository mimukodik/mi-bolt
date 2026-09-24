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

import catalogFixture from '../../../docs/api/fixtures/catalog.json';
import { createHandlers, type CreateHandlersOptions } from './create-handlers';
import { Repository } from './repository';
import { createRealClock, createRealIds, parseScenarioFromLocation } from './scenarios';
import { createBrowserPersistence, type MockSnapshot } from './persistence';
import { buildSnapshot } from './snapshot';
import { isSameOriginNonBusiness } from './business-route-predicates';
import { isCatalogFixtureShape, loadCatalogFixture } from './catalog/catalog.handlers';
import { cartStore } from './cart/cart.handlers';
import { checkoutStore, orderStore } from './checkout/checkout.handlers';
import { waitForController } from './wait-for-controller';

// Force-load the slice handler modules so their module-level
// registerBusinessHandlers(...) calls populate the create-handlers
// registry before buildBrowserHandlers() reads it.
import './catalog/catalog.handlers';
import './cart/cart.handlers';
import './checkout/checkout.handlers';
import './payment/payment.handlers';
import './orders/order.handlers';
import './demo/demo.handlers';

// `setupWorker()` from `msw/browser` requires a real Service Worker API:
// jsdom ships `window` and `navigator` but no `navigator.serviceWorker`,
// so any caller there throws `Invariant Violation: [MSW] Failed to execute
// setupWorker in a non-browser environment`. The `'serviceWorker' in
// navigator` probe distinguishes jsdom from a real browser without reading
// `process` (the latter is not in the Angular app typings, which would
// force an `as` cast the project rule forbids). Guarding the call lets
// the helper functions below stay reachable from the unit suite; the
// page-side path through `startMockWorker` is unaffected.
const isBrowserProcess = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;

export const worker: ReturnType<typeof setupWorker> | undefined = isBrowserProcess
  ? setupWorker()
  : undefined;

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
  if (isCatalogFixtureShape(catalogFixture)) {
    loadCatalogFixture(catalogFixture);
  }
  const persistence = createBrowserPersistence({ nowMs: () => Date.parse(clock.now()) });
  return {
    repository,
    clock,
    ids,
    scenario,
    apiRoot: '/api/v1',
    persist: (sessionId: string) => {
      const cart = cartStore.current;
      const checkout = checkoutStore.current;
      const order = orderStore.current;
      if (cart === null || checkout === null || order === null) {
        throw new Error('[browser] persist called before the three stores were initialised');
      }
      persistence.save(
        scenario.name,
        buildSnapshot({ cart, checkout, order }, sessionId, Date.parse(clock.now())),
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
  worker?.use(bypassSameOriginNonApi);
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
  worker?.use(blockCrossOrigin);
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
  worker?.use(failUnclaimedApiRoute);
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
  options.snapshot = snapshot;
  // The demo configuration adds the dispatcher shell so a misrouted
  // curl does not produce a stack trace inside the page.
  return createHandlers(options);
}

/**
 * The service-worker script is served from the application's own base
 * path, which is `/` for the shop and `/demo-fizetes/` for the demo
 * payment application. A root-absolute URL is rejected by the dev
 * server's base-path middleware before the file layer is reached, so
 * the path is resolved against the document's base instead.
 *
 * Resolution is plain WHATWG: a relative reference replaces the base's last
 * path segment, so a base ending in `index.html` resolves beside it and a base
 * ending in `/` resolves inside it. Forcing a trailing slash here was tried and
 * reverted — it broke the `index.html` case. The one shape that would resolve
 * wrongly, a base with no trailing slash and no file name, cannot occur:
 * Angular's `baseHref` ends in `/`, and `mock-worker-url.spec.ts` fails if it
 * ever stops doing so.
 */
export function resolveMockWorkerUrl(baseUri: string): string {
  return new URL('mockServiceWorker.js', baseUri).pathname;
}

/**
 * Boots the MSW service worker. Callers gate the boot (the shop on
 * `environment.demo`, the payment app on `isDevMode()`), and production
 * builds swap this file for `browser.production.ts`; the demo configuration
 * registers the handlers built
 * by `createHandlers` behind the `/api/...` network-error catch-all
 * that keeps them the only way out. The optional snapshot is
 * forwarded to `buildBrowserHandlers` so the repository is seeded
 * with the persisted cart before the first request is dispatched.
 */
export async function startMockWorker(snapshot: MockSnapshot | null = null): Promise<void> {
  if (worker === undefined) {
    throw new Error(
      '[browser] startMockWorker called outside a browser; MSW setupWorker was skipped at module load',
    );
  }

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
      url: resolveMockWorkerUrl(document.baseURI),
    },
  });
  await waitForController(navigator.serviceWorker);
}
