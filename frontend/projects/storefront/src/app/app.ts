import { Component, DOCUMENT, inject } from '@angular/core';
import {
  NavigationCancel,
  NavigationCancellationCode,
  NavigationEnd,
  NavigationError,
  NavigationSkipped,
  Router,
  RouterOutlet,
} from '@angular/router';
import type { Event as RoutingEvent } from '@angular/router';
import { first } from 'rxjs';

import { dismissSplash } from '@mi-bolt/core-api/splash';

/**
 * Whether the router has finished a navigation, however it ended. A guard's
 * redirect cancels with `NavigationCancellationCode.Redirect` and starts the
 * next navigation, so that cancellation does not count.
 */
function isSettledNavigation(event: RoutingEvent): boolean {
  return (
    event instanceof NavigationEnd ||
    event instanceof NavigationError ||
    event instanceof NavigationSkipped ||
    (event instanceof NavigationCancel && event.code !== NavigationCancellationCode.Redirect)
  );
}

/**
 * `App` is the standalone root component that hosts the router
 * outlet. The class is intentionally thin: every behaviour is
 * colocated with the route or feature it serves, and providers are
 * wired in `appConfig`.
 * Its one start-up duty: the index.html cover screen (`#mi-bolt-splash`,
 * MIM-404) leaves once the first navigation has settled.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly tag = 'app-root';

  constructor() {
    const document = inject(DOCUMENT);
    inject(Router)
      .events.pipe(first(isSettledNavigation))
      .subscribe(() => {
        void dismissSplash(document);
      });
  }

  /**
   * The skip link keeps its `#main-content` href for assistive tech, but the
   * document's `<base href="/">` makes the browser resolve that fragment on
   * the home page; the click moves focus to the landmark on the current
   * route instead (MIM-220). A modifier-key click (Ctrl, Cmd, Shift) keeps
   * the native anchor behaviour.
   */
  protected skipToMain(event: Event): void {
    if (event instanceof MouseEvent && (event.ctrlKey || event.metaKey || event.shiftKey)) return;
    const main = document.querySelector('main#main-content');
    if (!(main instanceof HTMLElement)) return;
    event.preventDefault();
    main.focus();
  }
}
