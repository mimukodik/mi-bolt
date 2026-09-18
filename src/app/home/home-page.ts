import { Component } from '@angular/core';

/**
 * `HomePage` is the lazy-loaded component behind the `/` route. The
 * page renders a one-line Hungarian welcome placeholder; business
 * data, real catalogue tiles and the catalogue shortcut live in
 * later task packets.
 *
 * The template and styles live inline so the JIT compiler can resolve
 * this component during vitest runs (the lazy import queues the
 * component after `tests/setup-msw.ts` has already drained the
 * templateUrl resolution queue, so external `templateUrl` /
 * `styleUrl` references cannot be fetched).
 */
@Component({
  selector: 'app-home-page',
  template: `
    <main class="home">
      <h1>MiBolt</h1>
      <p>Üdvözöl a MiBolt demó.</p>
    </main>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .home {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding: 1.5rem 1rem;
      }

      h1 {
        margin: 0;
        font-size: 1.75rem;
        line-height: 1.2;
        font-weight: 600;
      }

      p {
        margin: 0;
        line-height: 1.5;
      }
    `,
  ],
})
export class HomePage {
  protected readonly tag = 'app-home-page';
}
