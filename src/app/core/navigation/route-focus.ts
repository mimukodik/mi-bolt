import { Injectable, afterNextRender, inject } from '@angular/core';
import { NavigationEnd, Router, type Event } from '@angular/router';
import { Observable, filter } from 'rxjs';

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
@Injectable({ providedIn: 'root' })
export class RouteFocusService {
  private readonly router = inject(Router);

  /**
   * Re-emits Router events as they occur. The RouteHeadingDirective on
   * each page H1 and the AppShell both subscribe and act on NavigationEnd.
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
   * Schedule the focus move after the next render so the lazy-loaded
   * route's H1 has a chance to mount. `afterNextRender` only fires on
   * the browser, so server contexts remain a no-op.
   */
  scheduleFocus(): void {
    afterNextRender(() => this.focusMainHeading());
  }

  /**
   * Helper that returns the NavigationEnd stream filtered out of the
   * general event stream. Consumers that only care about completion of
   * a navigation can subscribe here without re-typing the filter.
   */
  navigationEnd$(): Observable<NavigationEnd> {
    return this.routeChange$.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd));
  }
}
