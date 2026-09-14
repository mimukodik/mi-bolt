import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * T11 placeholder for the utility 404 page. The route is wired in
 * `app.routes.ts` so the navigation graph compiles; the layout shell
 * keeps the standard header and footer (wildcard mount of
 * `ShopLayout`) and this minimal stub gives it a link back home.
 */
@Component({
  selector: 'app-not-found-page',
  imports: [RouterLink],
  template: `
    <section class="not-found">
      <h1>Az oldal nem található</h1>
      <p>A keresett oldal nem érhető el a MiBolt demóban.</p>
      <nav aria-label="Hasznos linkek">
        <a routerLink="/">Vissza a főoldalra</a>
      </nav>
    </section>
  `,
})
export class NotFoundPage {}
