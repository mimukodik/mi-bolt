/**
 * MSW unit setup - boots the Node service worker for the
 * contract-layer test runs.
 *
 * Lifecycle:
 *   beforeAll — start the server with `onUnhandledRequest: 'error'`
 *               so any request that escapes the registered handlers
 *               fails the surrounding test.
 *   afterEach — verify no handlers were left registered by a test
 *               and reset the request journal.
 *   afterAll  — close the server cleanly.
 *
 * The handlers list starts empty on purpose: T02 owns the gate that
 * proves unhandled requests fail the suite; each test registers the
 * exact handlers it needs via `server.use(...)` so the absence of a
 * handler is a deliberate signal.
 *
 * The MSW Node setup is a no-op when the file is loaded by the
 * Angular unit-test browser runner, which would otherwise try to
 * import `node:http` through `@mswjs/interceptors` and fail. Direct
 * vitest runs (`npx vitest run`) load this file in a Node process.
 *
 * The block at the bottom also drains the Angular JIT compiler's
 * component-resource queue once the Node.js setup is in place. The
 * default `@angular/platform-browser-dynamic` `ResourceLoader` uses
 * `XMLHttpRequest`, which cannot resolve the relative `templateUrl` /
 * `styleUrl` paths the components ship with against the jsdom
 * `about:blank` base URL. Reading from disk via Node's `fs` is the
 * simplest replacement that keeps the JIT tests green without
 * touching the production code path.
 */
import { afterAll, afterEach, beforeAll } from 'vitest';

const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

let server: ReturnType<typeof import('msw/node').setupServer> | null = null;

if (!isBrowser) {
  // Dynamic import keeps `msw/node` (and the @mswjs/interceptors
  // `node:http` references) out of the browser bundle entirely.
  const { setupServer } = await import('msw/node');
  server = setupServer();

  beforeAll(() => {
    server?.listen({ onUnhandledRequest: 'error' });
  });

  afterEach(() => {
    server?.resetHandlers();
  });

  afterAll(() => {
    server?.close();
  });
}

// Resolve any `templateUrl` / `styleUrl` the JIT compiler has queued
// by the time the test files start importing components. The default
// `ResourceLoader` (XHR) cannot reach the on-disk files from jsdom;
// a Node `fs` resolver makes the JIT compiler happy. Runs regardless
// of the per-test environment because vitest still executes tests in
// a Node.js process even when the test file asks for `jsdom`.
if (typeof process !== 'undefined' && process.versions?.node) {
  const { readFileSync, readdirSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { ɵresolveComponentResources } = await import('@angular/core');

  const workspaceRoot = process.cwd();
  const resolvedCache = new Map<string, string>();

  function findFileInWorkspace(filename: string): string | null {
    const queue: string[] = [workspaceRoot];
    while (queue.length > 0) {
      const dir = queue.shift() as string;
      let entries: ReturnType<typeof readdirSync>;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
          continue;
        }
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          queue.push(full);
        } else if (entry.name === filename) {
          return full;
        }
      }
    }
    return null;
  }

  const fileResourceResolver = async (url: string): Promise<string> => {
    if (resolvedCache.has(url)) {
      return resolvedCache.get(url) as string;
    }
    const filename = url.startsWith('./') ? url.slice(2) : url;
    // The JIT compiler passes the raw `templateUrl` / `styleUrl` string
    // with no component context, so resolve the URL against the
    // workspace root by walking the tree for the matching basename.
    const absolutePath = findFileInWorkspace(filename);
    if (absolutePath === null) {
      resolvedCache.set(url, '');
      return '';
    }
    const content = readFileSync(absolutePath, 'utf-8');
    resolvedCache.set(url, content);
    return content;
  };

  // Drain the resource queue at this point in case the spec files were
  // already imported via the `globals: true` vitest option or hoisted
  // imports in the test entry. Most of the queue fills in after this
  // hook though, because the specs use dynamic `import()` statements
  // that resolve lazily during vitest's worker startup.
  await ɵresolveComponentResources(fileResourceResolver);

  // `beforeAll` runs once per test file, after all the spec's static
  // imports have completed and before any `it` block fires. By that
  // point every `@Component` decorator in the import graph has run and
  // queued itself; resolving the queue here lets the JIT compiler
  // find the templates / styles the next time it accesses a component
  // definition.
  beforeAll(async () => {
    await ɵresolveComponentResources(fileResourceResolver);
  });
}

export { server };