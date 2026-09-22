import { resolveMockWorkerUrl } from './browser';

describe('MIM-254 resolveMockWorkerUrl', () => {
  it('MIM-254: the shop resolves the worker at the origin root', () => {
    expect(resolveMockWorkerUrl('http://localhost:4200/')).toBe('/mockServiceWorker.js');
  });

  it('MIM-254: the payment app resolves the worker under its base href', () => {
    expect(resolveMockWorkerUrl('http://localhost:4210/demo-fizetes/')).toBe(
      '/demo-fizetes/mockServiceWorker.js',
    );
  });

  // The input is the document's base URI, not the current location:
  // a deep page URL would otherwise resolve to that page's directory
  // and the worker would be looked up under it, which the dev server
  // has not been told to serve. Reverting to the old literal
  // `'/mockServiceWorker.js'` would silently fail the second case.
  it('MIM-254: a deep page URL still resolves against the base, not the page', () => {
    expect(resolveMockWorkerUrl('http://localhost:4210/demo-fizetes/')).toBe(
      '/demo-fizetes/mockServiceWorker.js',
    );
    expect(resolveMockWorkerUrl('http://localhost:4200/telefonok/')).toBe(
      '/telefonok/mockServiceWorker.js',
    );
  });
});
