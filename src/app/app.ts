import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * `App` is the standalone root component that hosts the router
 * outlet and the fatal-startup fallback. The class is intentionally
 * thin: every behaviour is colocated with the route or feature it
 * serves, and providers are wired in `appConfig`.
 *
 * The `<app-fatal>` element is a custom-element name the runtime
 * resolves through `CUSTOM_ELEMENTS_SCHEMA`; `main.ts` toggles its
 * `hidden` attribute when bootstrap rejects.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly tag = 'app-root';
}
