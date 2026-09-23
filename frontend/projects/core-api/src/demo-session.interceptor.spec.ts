/**
 * T04-AC05: the demo-session interceptor.
 *
 * The session id is cached in a module-level variable, so every case loads a
 * fresh copy of the module with vi.resetModules() and drives the interceptor
 * directly, asserting the exact headers written on the outgoing request.
 */

import { HttpContext, HttpRequest, HttpResponse } from '@angular/common/http';
import type { HttpHandlerFn, HttpInterceptorFn } from '@angular/common/http';
import { of } from 'rxjs';
import type { Mock } from 'vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** The module under test, reloaded per case so the id cache starts empty. */
interface InterceptorModule {
  readonly demoSessionInterceptor: HttpInterceptorFn;
  readonly withIfMatch: (version: string | number) => HttpContext;
}

const STORAGE_KEY = 'mi-bolt.demo-session';
const GENERATED_ID: ReturnType<Crypto['randomUUID']> = '11111111-2222-3333-4444-555555555555';

/** Undoes a sessionStorage getter installed by stubThrowingSessionStorage(). */
let restoreSessionStorage: (() => void) | undefined;

/** Reloads the module so its cached session id does not leak between cases. */
const loadInterceptorModule = (): Promise<InterceptorModule> => {
  vi.resetModules();
  return import('./demo-session.interceptor');
};

/** Stubs sessionStorage with `stored` behind getItem, and returns the setItem spy. */
const stubSessionStorage = (stored: string | null): Mock => {
  const setItem = vi.fn();
  vi.stubGlobal('sessionStorage', { getItem: vi.fn(() => stored), setItem });
  return setItem;
};

/** Replaces sessionStorage with a getter that throws, as a denied context does. */
const stubThrowingSessionStorage = (): void => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    get() {
      throw new Error('sessionStorage access denied');
    },
  });
  restoreSessionStorage = () => {
    if (descriptor === undefined) {
      Reflect.deleteProperty(globalThis, 'sessionStorage');
      return;
    }
    Object.defineProperty(globalThis, 'sessionStorage', descriptor);
  };
};

/**
 * Makes crypto.randomUUID() return `value` and returns the spy, so a case can
 * assert how often the id was generated. The `crypto` global is stubbed rather
 * than the method spied on: `randomUUID` is typed as a UUID, which a `value`
 * outside the contract pattern cannot be without a type assertion.
 */
const stubRandomUuid = (value: string): Mock => {
  const randomUUID = vi.fn(() => value);
  vi.stubGlobal('crypto', { randomUUID });
  return randomUUID;
};

/** Runs one GET through the interceptor and returns the request it passed on. */
const interceptedRequest = (
  module: InterceptorModule,
  context: HttpContext,
): HttpRequest<unknown> => {
  const captured: HttpRequest<unknown>[] = [];
  const next: HttpHandlerFn = (request) => {
    captured.push(request);
    return of(new HttpResponse({ status: 200 }));
  };
  module
    .demoSessionInterceptor(new HttpRequest<unknown>('GET', '/api/v1/x', { context }), next)
    .subscribe();

  expect(captured).toHaveLength(1);
  return captured[0];
};

describe('demoSessionInterceptor', () => {
  afterEach(() => {
    restoreSessionStorage?.();
    restoreSessionStorage = undefined;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reuses a valid stored session id', async () => {
    const setItem = stubSessionStorage('abcdefgh-1234');
    const randomUUID = stubRandomUuid(GENERATED_ID);

    const module = await loadInterceptorModule();
    const request = interceptedRequest(module, new HttpContext());

    expect(request.headers.get('X-Demo-Session')).toBe('abcdefgh-1234');
    expect(randomUUID).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });

  it('generates and stores an id when sessionStorage holds nothing', async () => {
    const setItem = stubSessionStorage(null);
    const randomUUID = stubRandomUuid(GENERATED_ID);

    const module = await loadInterceptorModule();
    const request = interceptedRequest(module, new HttpContext());

    expect(request.headers.get('X-Demo-Session')).toBe(GENERATED_ID);
    expect(setItem).toHaveBeenCalledWith(STORAGE_KEY, GENERATED_ID);
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it('replaces a stored id that violates the contract pattern', async () => {
    const setItem = stubSessionStorage('bad id!');
    stubRandomUuid(GENERATED_ID);

    const module = await loadInterceptorModule();
    const request = interceptedRequest(module, new HttpContext());

    expect(request.headers.get('X-Demo-Session')).toBe(GENERATED_ID);
    expect(setItem).toHaveBeenCalledWith(STORAGE_KEY, GENERATED_ID);
  });

  it('falls back to a page-local id when sessionStorage access is denied', async () => {
    stubThrowingSessionStorage();
    stubRandomUuid(GENERATED_ID);

    const module = await loadInterceptorModule();
    const request = interceptedRequest(module, new HttpContext());

    expect(request.headers.get('X-Demo-Session')).toBe(GENERATED_ID);
  });

  it('keeps the id when storing it is denied', async () => {
    const setItem = vi.fn(() => {
      throw new Error('sessionStorage access denied');
    });
    vi.stubGlobal('sessionStorage', { getItem: vi.fn(() => null), setItem });
    stubRandomUuid(GENERATED_ID);

    const module = await loadInterceptorModule();
    const request = interceptedRequest(module, new HttpContext());

    expect(request.headers.get('X-Demo-Session')).toBe(GENERATED_ID);
  });

  it('resolves the id once for every request on the same module', async () => {
    stubSessionStorage(null);
    const randomUUID = stubRandomUuid(GENERATED_ID);

    const module = await loadInterceptorModule();
    const first = interceptedRequest(module, new HttpContext());
    const second = interceptedRequest(module, new HttpContext());

    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(first.headers.get('X-Demo-Session')).toBe(second.headers.get('X-Demo-Session'));
  });

  it('rejects a generated id outside the contract pattern', async () => {
    stubSessionStorage(null);
    stubRandomUuid('x');

    const module = await loadInterceptorModule();

    expect(() => interceptedRequest(module, new HttpContext())).toThrow(
      /violates the contract pattern/,
    );
  });

  it('quotes a numeric If-Match version', async () => {
    stubSessionStorage('abcdefgh-1234');

    const module = await loadInterceptorModule();
    const request = interceptedRequest(module, module.withIfMatch(7));

    expect(request.headers.get('If-Match')).toBe('"7"');
  });

  it('keeps an already-quoted If-Match version', async () => {
    stubSessionStorage('abcdefgh-1234');

    const module = await loadInterceptorModule();
    const request = interceptedRequest(module, module.withIfMatch('"12"'));

    expect(request.headers.get('If-Match')).toBe('"12"');
  });

  it('rejects an If-Match version that is not a number', async () => {
    stubSessionStorage('abcdefgh-1234');

    const module = await loadInterceptorModule();

    expect(() => interceptedRequest(module, module.withIfMatch('abc'))).toThrow(
      /version must be a non-negative integer/,
    );
  });

  it('writes no If-Match header without the context helper', async () => {
    stubSessionStorage('abcdefgh-1234');

    const module = await loadInterceptorModule();
    const request = interceptedRequest(module, new HttpContext());

    expect(request.headers.has('If-Match')).toBe(false);
  });
});
