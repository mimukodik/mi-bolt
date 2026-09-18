import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * `App` is the standalone root component that hosts the router
 * outlet and the fatal-startup fallback. The class is intentionally
 * thin: every behaviour is colocated with the route or feature it
 * serves, and providers are wired in `appConfig`.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly tag = 'app-root';
}
