/**
 * MIM-228 — application-managed scroll restoration.
 *
 * The router is left with `anchorScrolling: 'enabled'` and
 * `scrollPositionRestoration: 'disabled'`. The application takes position
 * restoration over through this provider, which:
 *
 *   - flips `history.scrollRestoration` to `'manual'` so the browser
 *     stops resetting the scroll offset on every `pushState` (see the
 *     `History.scrollRestoration` note on MDN);
 *   - captures `window.scrollY` from the live document at the moment
 *     a navigation starts (`NavigationStart`) and stores the outgoing
 *     path's offset so a back / forward can put the user back where
 *     they were;
 *   - subscribes to the router's `Scroll` events and dispatches to
 *     the `ViewportScroller`:
 *     - when the event carries a `position` the router remembered,
 *       restore it (popstate with the router's store hit);
 *     - otherwise when it carries an `anchor`, scroll to that anchor
 *       (fragment navigation);
 *     - otherwise the navigation was forward: if the path changed,
 *       scroll to `[0, 0]`; if the path stayed the same, defer a
 *       scroll back to the captured offset by one animation frame so
 *       the focused control (the brand / colour chip the user just
 *       clicked) and the freshly rendered result list have both
 *       settled before we put the page back where it was. The
 *       browser's native clamping shortens the offset when the new
 *       page cannot hold it.
 *
 * Why a `requestAnimationFrame`: a forward filter click synchronously
 * focuses the chip the user pressed, and the browser's default
 * focus() scrolls the page so the chip is in view — on a Yettel-style
 * layout the chip sits at roughly the filter panel's Y, which on this
 * branch came out as `341`. Without the rAF the restore runs in the
 * same tick as the chip's focus, the focus-driven scroll wins, and
 * the page settles at the chip's offset rather than at the offset the
 * shopper actually scrolled to.
 *
 * Reference for the built-in behaviour this replaces:
 * https://angular.dev/api/router/InMemoryScrollingOptions#scrollPositionRestoration
 */

import { DestroyRef, inject, provideEnvironmentInitializer } from '@angular/core';
import type { EnvironmentProviders } from '@angular/core';
import { NavigationEnd, NavigationStart, Router, Scroll } from '@angular/router';
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

    /** Path-keyed store of offsets the shopper left behind on a forward
     *  navigation. Popstate reads from it because `scrollPositionRestoration`
     *  is disabled and the router's own scroll store stays empty. */
    const storedPositions = new Map<string, number>();

    /** Offset captured from the live `window.scrollY` at `NavigationStart`;
     *  restored one frame after the new content has rendered. */
    let pendingRestore: number | null = null;

    /** Path the most recent navigation landed on, so the next start can
     *  decide whether the path changed. */
    let lastPath: string | null = null;

    /** Set by the most recent `NavigationStart`, read by the matching
     *  `Scroll`. A `NavigationEnd` does not carry the popstate flag the
     *  way `NavigationStart` does, so the flag has to ride from one to
     *  the other through closure. */
    let lastStartWasPopstate = false;

    const startSub = router.events
      .pipe(filter((event): event is NavigationStart => event instanceof NavigationStart))
      .subscribe((event) => {
        if (typeof window === 'undefined') {
          lastStartWasPopstate = event.restoredState !== null;
          return;
        }
        const nextPath = pathOf(event.url);
        const liveY = window.scrollY;
        const isPopstate = event.restoredState !== null;
        lastStartWasPopstate = isPopstate;
        if (lastPath !== null && lastPath !== nextPath && !isPopstate) {
          // Outgoing path changed on a forward nav: remember where the
          // shopper left it so a back / forward can put them back there.
          storedPositions.set(lastPath, liveY);
        }
        // Same-path forward (a filter click on `/telefonok`) preserves
        // the live offset through the render; a different-path forward
        // restores it to zero in the Scroll branch below. A popstate
        // does not capture a pending restore — the Scroll branch
        // reaches into `storedPositions` instead.
        pendingRestore = isPopstate ? null : liveY;
      });

    const scrollSub = router.events
      .pipe(filter((event): event is Scroll => event instanceof Scroll))
      .subscribe((event) => {
        // `Scroll.routerEvent` is `NavigationEnd | NavigationSkipped`;
        // only the end carries `urlAfterRedirects`. A `Scroll` with a
        // `NavigationSkipped` is rare and carries no path the page
        // needs to act on, so the listener leaves `lastPath` alone.
        if (!(event.routerEvent instanceof NavigationEnd)) return;
        const path = pathOf(event.routerEvent.urlAfterRedirects);
        const isPopstate = lastStartWasPopstate;
        if (event.position !== null) {
          // The router's `RouterScroller.scheduleScrollEvent` emits a
          // `position` only on a popstate navigation whose offset it
          // remembered. With `scrollPositionRestoration: 'disabled'`
          // this is rare; honor it when it does arrive so the listener
          // and the router's own store agree on a position.
          if (event.position[0] !== 0 || event.position[1] !== 0) {
            scroller.scrollToPosition(event.position);
          }
          lastPath = path;
          return;
        }
        if (event.anchor !== null) {
          scroller.scrollToAnchor(event.anchor);
          lastPath = path;
          return;
        }
        if (isPopstate) {
          // Back / forward on a router that never stored a position.
          // `storedPositions` was filled at the matching forward
          // `NavigationStart`; let the browser clamp the value natively
          // when the page cannot hold the full offset.
          const saved = storedPositions.get(path);
          lastPath = path;
          if (saved === undefined) return;
          if (typeof window === 'undefined') return;
          window.requestAnimationFrame(() => {
            window.scrollTo(0, saved);
          });
          return;
        }
        if (path !== lastPath) {
          scroller.scrollToPosition([0, 0]);
          lastPath = path;
          return;
        }
        // Same-path forward (a filter click). The chip the shopper just
        // pressed focused itself in the same tick, and the browser's
        // default focus() scrolled the page so the chip was in view.
        // Wait one frame so the new result list and the focus-driven
        // scroll have both settled, then restore the captured offset.
        // The browser clamps to the new `scrollHeight` natively — do
        // not read the height ourselves, which is how `341` used to
        // be produced (a stale read against the old layout).
        const y = pendingRestore;
        pendingRestore = null;
        lastPath = path;
        if (y === null || y <= 0) return;
        if (typeof window === 'undefined') return;
        window.requestAnimationFrame(() => {
          window.scrollTo(0, y);
        });
      });

    destroyRef.onDestroy(() => {
      startSub.unsubscribe();
      scrollSub.unsubscribe();
    });
  });
}

/** The path component of a URL — everything before the first `?`. */
function pathOf(url: string): string {
  const q = url.indexOf('?');
  return q < 0 ? url : url.slice(0, q);
}
