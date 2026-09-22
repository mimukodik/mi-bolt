import { readFileSync } from 'node:fs';

import { isRecord } from './is-record';
import { resolveMockWorkerUrl } from './browser';

/** Walks an `unknown` JSON value down the given key path, returning `undefined` at the first non-record. */
function readNode(root: unknown, keys: readonly string[]): unknown {
  let node: unknown = root;
  for (const key of keys) {
    node = isRecord(node) ? node[key] : undefined;
    if (node === undefined) {
      return undefined;
    }
  }
  return node;
}

describe('MIM-254 resolveMockWorkerUrl', () => {
  it('MIM-254: the shop resolves the worker at the origin root', () => {
    expect(resolveMockWorkerUrl('http://localhost:4200/')).toBe('/mockServiceWorker.js');
  });

  // The input is the document's base URI, not the current location:
  // a deep page URL would otherwise resolve to that page's directory
  // and the worker would be looked up under it, which the dev server
  // has not been told to serve. Reverting to the old literal
  // `'/mockServiceWorker.js'` would silently fail the second case.
  it('MIM-254: a non-root base URI places the worker under that base', () => {
    expect(resolveMockWorkerUrl('http://localhost:4210/demo-fizetes/')).toBe(
      '/demo-fizetes/mockServiceWorker.js',
    );
    expect(resolveMockWorkerUrl('http://localhost:4200/telefonok/')).toBe(
      '/telefonok/mockServiceWorker.js',
    );
  });

  it('MIM-254: a base URI ending in a file name resolves beside it, not inside it', () => {
    expect(resolveMockWorkerUrl('http://localhost:4210/demo-fizetes/index.html')).toBe(
      '/demo-fizetes/mockServiceWorker.js',
    );
  });

  // The resolver relies on `baseHref` ending in `/`: without it the worker URL
  // would resolve one level up and 404, which is the failure this whole module
  // exists to prevent. Guard the configuration rather than second-guess URL
  // resolution in the resolver.
  //
  // `@angular/build:unit-test` emits each spec at the workspace root as
  // `<segments>-<file>.js` (measured: `spec-mocks-mock-worker-url.js`), so
  // `import.meta.dirname` is the workspace root and `angular.json` sits beside
  // it. Going `../..` would leave the filesystem, which `readFileSync`
  // reports as `ENOENT` long before `URL must be of scheme file`.
  it('MIM-254: the demo payment baseHref ends in a slash', () => {
    const raw = readFileSync(`${import.meta.dirname}/angular.json`, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    const baseHref = readNode(parsed, [
      'projects',
      'demo-payment',
      'architect',
      'build',
      'options',
      'baseHref',
    ]);
    expect(baseHref).toBe('/demo-fizetes/');
  });
});
