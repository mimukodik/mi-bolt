import { Component } from '@angular/core';

/**
 * T11 placeholder for the delivery step (S4.3). The route is wired in
 * `app.routes.ts` so the navigation graph compiles; the real screen
 * belongs to T17. This minimal stub renders an H1 so the step
 * indicator has something to frame.
 */
@Component({
  selector: 'app-delivery-page',
  template: `
    <section class="delivery">
      <h1>Szállítás és fizetés</h1>
      <p>A teljes űrlap a T17 feladatban készül.</p>
    </section>
  `,
})
export class DeliveryPage {}
