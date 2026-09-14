import { Component } from '@angular/core';

/**
 * T11 placeholder for the review step (S4.4). The route is wired in
 * `app.routes.ts` so the navigation graph compiles; the real screen
 * belongs to T18. This minimal stub renders an H1 so the step
 * indicator has something to frame.
 */
@Component({
  selector: 'app-review-page',
  template: `
    <section class="review">
      <h1>Rendelés ellenőrzése</h1>
      <p>A teljes áttekintő nézet a T18 feladatban készül.</p>
    </section>
  `,
})
export class ReviewPage {}
