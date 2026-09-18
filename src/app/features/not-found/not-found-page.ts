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
  templateUrl: './not-found-page.html',
})
export class NotFoundPage {
  protected readonly tag = 'app-not-found-page';
}
