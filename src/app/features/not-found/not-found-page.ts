import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * T11 utility 404 page. The route is wired in `app.routes.ts` so the
 * navigation graph compiles; the layout shell keeps the standard
 * header and footer (wildcard mount of `ShopLayout`) and the page
 * gives visitors a link back home and a link into the catalogue,
 * styled on the shared centreline.
 */
@Component({
  selector: 'app-not-found-page',
  imports: [RouterLink],
  templateUrl: './not-found-page.html',
  styleUrl: './not-found-page.scss',
})
export class NotFoundPage {
  protected readonly tag = 'app-not-found-page';
}
