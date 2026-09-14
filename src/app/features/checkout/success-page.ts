import { Component, input } from '@angular/core';

/**
 * T11 placeholder for the success step (S4.5). The route is wired in
 * `app.routes.ts` so the navigation graph compiles; the real screen
 * belongs to T19. This minimal stub renders an H1 so the layout
 * chrome has something to frame.
 */
@Component({
  selector: 'app-success-page',
  template: `
    <section class="success">
      <h1>Demórendelés elkészült</h1>
      <p>A teljes összegző nézet a T19 feladatban készül.</p>
    </section>
  `,
})
export class SuccessPage {
  readonly orderId = input<string>('');
}
