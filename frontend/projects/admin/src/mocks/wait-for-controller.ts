/** What `waitForController` reads: `navigator.serviceWorker` in the browser. */
export interface ControllerSource extends EventTarget {
  readonly controller: object | null;
}

/**
 * Resolves once a service worker controls the current page. `worker.start()`
 * resolves when the mock worker is activated and has answered MSW's
 * handshake; on the first registration in a fresh browser context that can
 * happen before the worker's `clients.claim()` has made it this page's
 * controller, and a request fired in that gap reaches the dev server, which
 * answers 404. MSW's own reload fallback covers only a page that already had
 * a registration.
 */
export function waitForController(source: ControllerSource): Promise<void> {
  if (source.controller !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    source.addEventListener(
      'controllerchange',
      () => {
        resolve();
      },
      { once: true },
    );
  });
}
