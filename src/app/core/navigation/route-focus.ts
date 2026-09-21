import {
  EnvironmentInjector,
  Service,
  afterNextRender,
  inject,
  runInInjectionContext,
} from '@angular/core';
import { NavigationEnd, Router, type Event } from '@angular/router';
import type { Observable } from 'rxjs';
import { distinctUntilChanged, filter } from 'rxjs';

/**
 * Route focus management.
 *
 * The Angular router does not move focus when the URL changes, which
 * leaves keyboard and screen-reader users stranded at the previous page
 * heading. This service bridges that gap:
 *
 * - `routeChange$` re-emits every Router event; consumers filter for
 *   `NavigationEnd` to run their focus logic exactly once per route.
 * - `focusMainHeading()` performs the actual focus move: it locates
 *   the `<h1>` inside `<main id="main-content">`, sets `tabindex="-1"`
 *   (so the heading is programmatically focusable) and calls `focus`.
 *
 * The service is provided in root so any feature component can inject
 * it without an extra provider entry.
 */
@Service()
export class RouteFocusService {
  private readonly router = inject(Router);
  private readonly injector = inject(EnvironmentInjector);

  /**
   * The live "focus the heading once it mounts" watch, or null. At most
   * one exists: `focusMainHeadingWhenMounted()` disconnects the
   * previous one before starting its own.
   */
  private headingWatch: MutationObserver | null = null;

  /**
   * Re-emits Router events as they occur. `MarketingLayout`, `ShopLayout`
   * and `CheckoutLayout` each subscribe — via `navigationEnd$()` or
   * `pathChangeNavigationEnd$()` — and act on `NavigationEnd`.
   */
  readonly routeChange$: Observable<Event> = this.router.events;

  /**
   * Move focus to the first H1 inside the main landmark. Safe to call
   * before the H1 is in the DOM (no-op) and idempotent (calling it
   * repeatedly keeps the focus on the same heading).
   */
  focusMainHeading(): void {
    if (typeof document === 'undefined') return;
    const main = document.querySelector('main#main-content');
    if (!(main instanceof HTMLElement)) return;
    const heading = main.querySelector('h1');
    if (!(heading instanceof HTMLElement)) return;
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: false });
  }

  /**
   * Focus the main heading now, and otherwise as soon as it mounts.
   *
   * One render after `NavigationEnd` is not late enough for a page
   * whose H1 sits behind its own loading state: `ProductPage` renders
   * `LoadingState` until the SDK answers, so the H1 the catalogue's
   * product link navigates to is not in the DOM when `afterNextRender`
   * fires and `focusMainHeading()` returns having done nothing. Nothing
   * re-ran it, which is why every product page opened from the
   * catalogue was left with focus on `<body>`.
   *
   * The watch stops the moment focus is anywhere but the body. A user
   * who has already focused a control of their own owns the focus, and
   * taking it back for a heading is the WCAG 3.2.2 (On Input) steal
   * `pathChangeNavigationEnd$()` exists to prevent. It also stops as
   * soon as the heading itself has focus, and the next navigation
   * replaces it, so at most one watch is ever live.
   */
  focusMainHeadingWhenMounted(): void {
    this.stopHeadingWatch();
    this.focusMainHeading();
    if (!this.focusIsUnclaimed()) return;
    const watch = new MutationObserver(() => {
      if (!this.focusIsUnclaimed()) {
        this.stopHeadingWatch();
        return;
      }
      this.focusMainHeading();
      if (!this.focusIsUnclaimed()) this.stopHeadingWatch();
    });
    watch.observe(document.body, { childList: true, subtree: true });
    this.headingWatch = watch;
  }

  /**
   * Schedule the focus move after the next render so the lazy-loaded
   * route's H1 has a chance to mount. `afterNextRender` only fires on
   * the browser, so server contexts remain a no-op.
   *
   * `afterNextRender` requires an injection context, but this method
   * is normally called from a `Router.events` subscription (which is
   * not). The captured `EnvironmentInjector` is replayed via
   * `runInInjectionContext` so the callback runs in the same DI scope
   * as the service itself; without that, Angular throws NG0203.
   */
  scheduleFocus(): void {
    runInInjectionContext(this.injector, () => {
      afterNextRender(() => {
        this.focusMainHeadingWhenMounted();
      });
    });
  }

  /**
   * True while nothing holds focus but the document body — what the
   * browser leaves focused after a route swap destroys the element
   * that had it, and the only state in which this service may move
   * focus without taking it from the user.
   */
  private focusIsUnclaimed(): boolean {
    return document.activeElement === document.body;
  }

  /** Disconnect the pending heading watch, if there is one. */
  private stopHeadingWatch(): void {
    if (this.headingWatch === null) return;
    this.headingWatch.disconnect();
    this.headingWatch = null;
  }

  /**
   * Helper that returns the NavigationEnd stream filtered out of the
   * general event stream. Consumers that only care about completion of
   * a navigation can subscribe here without re-typing the filter.
   */
  navigationEnd$(): Observable<NavigationEnd> {
    return this.routeChange$.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd));
  }

  /**
   * `NavigationEnd` events filtered down to actual route-path changes: a
   * navigation that only rewrites the query string (a catalogue filter,
   * a sort order, a page number) does not re-emit here. Moving focus to
   * the page heading on every query-only navigation would drag focus
   * away from a form control the user is actively typing into, which is
   * a WCAG 3.2.2 (On Input) violation, so heading-focus consumers
   * subscribe here instead of `navigationEnd$()`. The first navigation
   * always emits — there is no previous path to compare it against, so
   * a deep link or a fresh load still focuses the heading.
   */
  pathChangeNavigationEnd$(): Observable<NavigationEnd> {
    return this.navigationEnd$().pipe(
      distinctUntilChanged(
        (previous, current) =>
          RouteFocusService.pathOnly(previous.urlAfterRedirects) ===
          RouteFocusService.pathOnly(current.urlAfterRedirects),
      ),
    );
  }

  /** Strips the query string and fragment off a URL, leaving the path. */
  private static pathOnly(url: string): string {
    return url.split('#')[0].split('?')[0];
  }
}
