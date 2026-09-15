/**
 * Route entry for the contact step. The T20 `ContactStep` owns the
 * implementation; this module re-exports it under the `ContactPage`
 * name so `app.routes.ts` (T11) can keep its import binding
 * (`import('./features/checkout/contact-page').then((m) =>
 * m.ContactPage)`) without touching the wizard when the screen
 * arrives.
 */
export { ContactStep as ContactPage } from './contact-step';