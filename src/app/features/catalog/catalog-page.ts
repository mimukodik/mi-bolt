import { Component } from '@angular/core';

/**
 * T11 placeholder for the catalogue route (S2). The route is wired
 * in `app.routes.ts` so the navigation graph compiles; the real screen
 * belongs to T13. This minimal stub renders an H1 so the layout
 * chrome has something to frame.
 */
@Component({
  selector: 'app-catalog-page',
  template: `
    <section class="catalog">
      <h1>Mobiltelefonok</h1>
      <p>A teljes katalógus a T13 feladatban készül.</p>
    </section>
  `,
})
export class CatalogPage {}
