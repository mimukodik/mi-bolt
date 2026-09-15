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
 *
 * The template and styles are inlined (instead of `templateUrl` /
 * `styleUrl`) so the JIT compiler can resolve them inside the
 * vitest harness without an Angular-CLI style loader.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <a class="skip-link" href="#main-content">Ugrás a tartalomhoz</a>

    <app-fatal role="alert" aria-live="assertive" hidden>
      <h1>A MiBolt demó indítása sikertelen</h1>
      <p>
        A bemutató nem tudott elindulni. Frissítsd az oldalt, vagy
        ellenőrizd a böngésző konzolját a részletekért.
      </p>
    </app-fatal>

    <router-outlet />
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100dvh;
        font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue',
          Arial, sans-serif;
        color: #171b1f;
        background: #ffffff;
      }

      .skip-link {
        position: absolute;
        left: -9999px;
        top: 0;
        padding: 0.5rem 0.75rem;
        background: #171b1f;
        color: #ffffff;
        text-decoration: none;
        z-index: 1000;
      }

      .skip-link:focus {
        left: 0.5rem;
        top: 0.5rem;
        outline: 2px solid #ff6a00;
      }

      app-fatal {
        display: block;
        padding: 1.5rem 1rem;
        background: #fdecea;
        color: #171b1f;
        border: 1px solid #b3261e;
      }

      app-fatal[hidden] {
        display: none;
      }

      app-fatal h1 {
        margin: 0 0 0.5rem;
        font-size: 1.25rem;
      }

      app-fatal p {
        margin: 0;
        line-height: 1.5;
      }
    `,
  ],
})
export class App {}
