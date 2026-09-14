/**
 * Browser MSW worker — T02 network-isolation proof.
 *
 * The worker is the only place that owns business API traffic in the
 * browser. Playwright's request observer cannot see requests that
 * are intercepted by the service worker, so the gate combines
 * MSW's `unhandled` event, Playwright's request log and the
 * "open sockets" check in `e2e/fixtures/coverage.ts` to prove the
 * page is not reaching the network for any business call.
 *
 * Static assets (Vite dev server chunks, `/mockServiceWorker.js`,
 * `/assets/...`) are explicitly bypassed: the `onUnhandledRequest`
 * callback only throws for `/api/...` traffic so the page can still
 * boot in the demo / e2e environment.
 *
 * The handler list is deliberately empty: each E2E spec uses
 * `worker.use(...)` to register only the handlers it needs, so an
 * unhandled `/api/v1/...` request is a test failure rather than a
 * silent network call.
 */
import { http, passthrough, type HttpHandler } from 'msw';
import { setupWorker } from 'msw/browser';

export const worker = setupWorker();

/**
 * Install a global passthrough for every non-business route. The
 * dev server still serves its own Vite chunks, source maps and the
 * mockServiceWorker.js bundle; intercepting those would break the
 * page. The `onUnhandledRequest` callback in `startMockWorker`
 * retains the `error` policy for `/api/...` URLs only.
 */
export function installBusinessRouteBypass(): void {
  const bypassAllNonApi: HttpHandler = http.all(
    ({ request }) => !new URL(request.url).pathname.startsWith('/api/'),
    () => passthrough(),
  );
  worker.use(bypassAllNonApi);
}

export async function startMockWorker(): Promise<void> {
  installBusinessRouteBypass();
  await worker.start({
    onUnhandledRequest(request, print) {
      const url = new URL(request.url);
      if (url.pathname.startsWith('/api/')) {
        // The T02 contract: an unhandled business route is a test
        // failure. The MSW unhandled event fires inside the service
        // worker; the page-level request listener picks the attempt
        // up as a network error.
        print.error();
        throw new Error(
          `[mi-bolt] unhandled business route: ${request.method} ${request.url}`,
        );
      }
      // Static assets, source maps, the mock worker bundle itself
      // and the Vite dev server chunks all bypass MSW silently.
    },
    serviceWorker: {
      url: '/mockServiceWorker.js',
    },
  });
}