/**
 * MIM-228 — application-managed scroll restoration.
 *
 * The router's built-in `scrollPositionRestoration: 'enabled'` restores
 * the previous scroll position on backward navigation and otherwise
 * scrolls to `[0, 0]` on every forward navigation (a query-string
 * change on the same route counts as a forward navigation, so toggling
 * a filter pushes the shopper back to the top of the page on every
 * click). That is the wrong behaviour for the catalogue: a filter
 * change keeps the scroll position, a real path change goes to the
 * top, a back / forward restores the stored position, and a fragment
 * scrolls to its anchor.
 *
 * The router is left with `anchorScrolling: 'enabled'` and
 * `scrollPositionRestoration: 'disabled'`. The application takes
 * position restoration over through this provider, which:
 *
 *   - flips `history.scrollRestoration` to `'manual'` so the browser
 *     stops resetting the scroll offset on every `pushState`. Without
 *     that, a filter click would always scroll the page back to the
 *     top no matter what the listener does — see the `History.scrollRestoration`
 *     note on MDN (https://developer.mozilla.org/en-US/docs/Web/API/History/scrollRestoration);
 *   - subscribes to the router's `Scroll` events and dispatches to
 *     the `ViewportScroller`:
 *     - when the event carries a `position`, restore it (back / forward);
 *     - otherwise when it carries an `anchor`, scroll to that anchor
 *       (fragment navigation, still routed by the router's anchor config);
 *     - otherwise compare the path component (everything before the
 *       first `?`) of `routerEvent.urlAfterRedirects` with the path we
 *       last saw, and scroll to `[0, 0]` only when it actually changed.
 *
 * Reference for the built-in behaviour this replaces:
 * https://angular.dev/api/router/InMemoryScrollingOptions#scrollPositionRestoration
 */

import { DestroyRef, inject, provideEnvironmentInitializer } from '@angular/core';
import type { EnvironmentProviders } from '@angular/core';
import { NavigationEnd, Router, Scroll } from '@angular/router';
import { ViewportScroller } from '@angular/common';
import { filter } from 'rxjs/operators';

/** Build the `EnvironmentProviders` that wires the listener in. */
export function provideScrollRestoration(): EnvironmentProviders {
  return provideEnvironmentInitializer(() => {
    const router = inject(Router);
    const scroller = inject(ViewportScroller);
    const destroyRef = inject(DestroyRef);

    // The browser resets scroll on every `pushState` by default; this
    // switch hands the responsibility over entirely. With
    // `'manual'`, a `pushState` does nothing to the scroll offset, so
    // the listener alone decides what happens.
    if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }

    let lastPath: string | null = null;

    const subscription = router.events
      .pipe(filter((event): event is Scroll => event instanceof Scroll))
      .subscribe((event) => {
        // `Scroll.routerEvent` is `NavigationEnd | NavigationSkipped`;
        // only the end carries `urlAfterRedirects`. A `Scroll` with a
        // `NavigationSkipped` is rare and carries no path the page
        // needs to act on, so the listener leaves `lastPath` alone.
        if (!(event.routerEvent instanceof NavigationEnd)) return;
        if (event.position !== null) {
          // The router's `RouterScroller.scheduleScrollEvent` emits a
          // `position` only on a popstate navigation (back / forward) —
          // a stored offset it pulls from its internal scroll store.
          // Forward navigation emits `position: null` and lands in the
          // path-comparison branch below. Honoring only the non-zero
          // case keeps a "back to where I was" navigation that
          // happens to remember `[0, 0]` from scrolling at all, and
          // shields us from any future Angular change that starts
          // emitting `[0, 0]` on every forward nav by mistake.
          if (event.position[0] !== 0 || event.position[1] !== 0) {
            scroller.scrollToPosition(event.position);
          }
          lastPath = pathOf(event.routerEvent.urlAfterRedirects);
          return;
        }
        if (event.anchor !== null) {
          scroller.scrollToAnchor(event.anchor);
          lastPath = pathOf(event.routerEvent.urlAfterRedirects);
          return;
        }
        const nextPath = pathOf(event.routerEvent.urlAfterRedirects);
        if (nextPath !== lastPath) {
          scroller.scrollToPosition([0, 0]);
        }
        lastPath = nextPath;
      });

    destroyRef.onDestroy(() => {
      subscription.unsubscribe();
    });
  });
}

/** The path component of a URL — everything before the first `?`. */
function pathOf(url: string): string {
  const q = url.indexOf('?');
  return q < 0 ? url : url.slice(0, q);
}
