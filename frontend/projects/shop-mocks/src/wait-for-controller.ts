/** What `waitForController` reads: `navigator.serviceWorker` in the browser. */
export interface ControllerSource extends EventTarget {
  readonly controller: object | null;
}

/** Resolves once the page is controlled by a service worker: at once when
 *  it already is, otherwise on the first `controllerchange`. MSW's start
 *  handshake can answer before `clients.claim()` makes the worker the
 *  controller on a first registration, so an API call made right after
 *  `worker.start()` would reach the network. No timer on purpose. */
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
