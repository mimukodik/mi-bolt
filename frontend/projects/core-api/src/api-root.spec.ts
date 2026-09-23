/**
 * T04-AC05: the SDK root URL derived from document.baseURI.
 *
 * Pins the three behaviours the storefront's generated client depends on:
 * a base-href subpath is stripped, a path is stripped, and a baseURI that is
 * not a URL or a document that is not there fails loudly instead of shipping
 * a hard-coded origin.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveApiRoot } from './api-root';

/** Returns the error a call threw, so the case can assert on its message. */
function captureError(action: () => void): Error {
  try {
    action();
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }
    throw new Error(`expected an Error, got ${typeof error}`, { cause: error });
  }
  throw new Error('the call was expected to throw, and did not');
}

describe('resolveApiRoot', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('derives the root from a base-href subpath', () => {
    const root = resolveApiRoot({ baseURI: 'http://localhost:4200/admin/' });

    expect(root).toBe('http://localhost:4200/api/v1');
  });

  it('drops the path and keeps the origin', () => {
    const root = resolveApiRoot({ baseURI: 'https://shop.example/x/y' });

    expect(root).toBe('https://shop.example/api/v1');
  });

  it('reports an unparseable baseURI and keeps the cause', () => {
    const error = captureError(() => resolveApiRoot({ baseURI: 'not a url' }));

    expect(error.message).toContain('cannot parse document.baseURI "not a url"');
    expect(error.cause).toBeDefined();
  });

  it('falls back to the live document when no argument is passed', () => {
    const root = resolveApiRoot();

    expect(root).toBe(`${new URL(document.baseURI).origin}/api/v1`);
  });

  it('throws when no document exists at all', () => {
    vi.stubGlobal('document', undefined);

    expect(() => resolveApiRoot()).toThrow(/document is missing/);
  });
});
