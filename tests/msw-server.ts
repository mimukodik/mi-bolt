/**
 * MSW Node server instance, split out of `tests/setup-msw.ts`.
 *
 * Why the split exists: the unit-test builder bundles spec files and
 * `setupFiles` as separate esbuild entry points with code splitting on, so a
 * module imported by both a setup file and every spec file gets its body
 * hoisted into a shared chunk once, while the setup file becomes a bare
 * re-export shim. Vitest's per-file setup re-run only invalidates that one
 * shim module, not the shared chunk it imports, so with the server and its
 * `beforeAll`/`afterEach`/`afterAll` hooks in the same module, the hooks ran
 * once per worker process rather than once per file, and whichever spec
 * happened to run first in a worker owned the `afterAll` that closed the
 * server for every spec after it.
 *
 * Keeping the server instance here, imported by both `setup-msw.ts` and the
 * spec files that need `server.use(...)`, means `setup-msw.ts` has no spec
 * importing it any more, so esbuild keeps its body — the hook registrations —
 * in the setup entry chunk, where Vitest's per-file invalidation actually
 * reaches it. Do not merge this file back into `tests/setup-msw.ts`: doing so
 * silently restores the shared-chunk bug this split exists to avoid.
 */
const isNodeProcess = typeof process !== 'undefined' && Boolean(process.versions?.node);

let server!: ReturnType<typeof import('msw/node').setupServer>;

if (isNodeProcess) {
  // Dynamic import keeps `msw/node` (and the @mswjs/interceptors
  // `node:http` references) out of the browser bundle entirely.
  const { setupServer } = await import('msw/node');
  server = setupServer();
}

export { server };
