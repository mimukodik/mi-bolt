import { Component } from '@angular/core';

/**
 * T11 placeholder for the cart route (S4.1). The route is wired in
 * `app.routes.ts` so the navigation graph compiles; the real screen
 * belongs to T16. This minimal stub renders an H1 so the layout
 * chrome has something to frame.
 */
@Component({
  selector: 'app-cart-page',
  template: `
    <section class="cart">
      <h1>Kosár</h1>
      <p>A teljes kosár nézet a T16 feladatban készül.</p>
    </section>
  `,
})
export class CartPage {}
