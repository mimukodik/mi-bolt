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
 * redirect cancels with `NavigationCancellationCode.Redirect`, and a newer
 * navigation cancels the running one with
 * `NavigationCancellationCode.SupersededByNewNavigation`; a next navigation
 * follows either, so those cancellations do not count.
 */
function isSettledNavigation(event: RoutingEvent): boolean {
  return (
    event instanceof NavigationEnd ||
    event instanceof NavigationError ||
    event instanceof NavigationSkipped ||
    (event instanceof NavigationCancel &&
      event.code !== NavigationCancellationCode.Redirect &&
      event.code !== NavigationCancellationCode.SupersededByNewNavigation)
  );
}

/**
 * The admin's root: a router outlet. Its index.html cover screen
 * (`#mi-bolt-splash`, MIM-404) leaves once the first navigation has settled,
 * so a signed-out visit keeps it until the login page has rendered.
 */
@Component({
  imports: [RouterOutlet],
  selector: 'adm-root',
  templateUrl: './app.html',
})
export class App {
  constructor() {
    const document = inject(DOCUMENT);
    inject(Router)
      .events.pipe(first(isSettledNavigation))
      .subscribe(() => {
        void dismissSplash(document);
      });
  }
}
