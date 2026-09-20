/**
 * Pure URL predicates the browser worker's handlers are built from
 * (FIX-51, T05-AC05 — `docs/tasks/T05.md:49`). Kept in a module of
 * their own, with no `msw` import, so a unit test can exercise them
 * directly: `src/mocks/browser.ts`'s module scope calls
 * `setupWorker()` from `msw/browser`, which throws outside a real
 * browser (`Invariant Violation: [MSW] Failed to execute setupWorker
 * in a non-browser environment` — see `src/main.spec.ts`'s own guard
 * against importing that chain), so nothing under `tests`/`src` may
 * import `./browser` at all.
 */

/**
 * True when `url` is the page's own origin and is not a business API
 * call. A pathname alone cannot distinguish the page's own
 * `/assets/x.webp` from `https://cdn.example/assets/x.webp` — both
 * have a pathname that does not start with `/api/` — so this checks
 * the origin as well.
 */
export function isSameOriginNonBusiness(url: URL, pageOrigin: string): boolean {
  return url.origin === pageOrigin && !url.pathname.startsWith('/api/');
}
