import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * `App` is the standalone root component that hosts the router
 * outlet. The class is intentionally thin: every behaviour is
 * colocated with the route or feature it serves, and providers are
 * wired in `appConfig`.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly tag = 'app-root';

  /**
   * The skip link keeps its `#main-content` href for assistive tech, but the
   * document's `<base href="/">` makes the browser resolve that fragment on
   * the home page; the click moves focus to the landmark on the current
   * route instead (MIM-220).
   */
  protected skipToMain(event: Event): void {
    const main = document.querySelector('main#main-content');
    if (!(main instanceof HTMLElement)) return;
    event.preventDefault();
    main.focus();
  }
}
