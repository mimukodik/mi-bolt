import { Component, input } from '@angular/core';

/**
 * T11 placeholder for the product detail route (S3). The route is
 * wired in `app.routes.ts` so the navigation graph compiles; the real
 * screen belongs to T14. This minimal stub renders an H1 so the
 * layout chrome has something to frame.
 */
@Component({
  selector: 'app-product-page',
  template: `
    <section class="product">
      <h1>Termék</h1>
      <p>A teljes termékoldal a T14 feladatban készül.</p>
    </section>
  `,
})
export class ProductPage {
  readonly slug = input<string>('');
}
