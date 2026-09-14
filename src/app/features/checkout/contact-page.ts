import { Component } from '@angular/core';

/**
 * T11 placeholder for the contact step (S4.2). The route is wired in
 * `app.routes.ts` so the navigation graph compiles; the real screen
 * belongs to T17. This minimal stub renders an H1 so the step
 * indicator has something to frame.
 */
@Component({
  selector: 'app-contact-page',
  template: `
    <section class="contact">
      <h1>Kapcsolattartási adatok</h1>
      <p>A teljes űrlap a T17 feladatban készül.</p>
    </section>
  `,
})
export class ContactPage {}
